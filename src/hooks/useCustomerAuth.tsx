import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { setInternalUserEmail } from "@/lib/internalUsers";

interface CustomerAuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const CustomerAuthContext = createContext<CustomerAuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Fire-and-forget call to ensure each authenticated user is linked to a
  // Vinoshipper customer record. Safe to call repeatedly — the edge function
  // is idempotent and will short-circuit if already linked.
  const ensureVinoshipperLink = (uid: string) => {
    const key = `vs_link_attempted_${uid}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    supabase.functions
      .invoke("vinoshipper-link-customer")
      .then(() => {
        // After linking, confirm wine club membership status against VS
        // (source of truth). Non-blocking; we don't await it.
        supabase.functions
          .invoke("vinoshipper-sync-membership")
          .catch((err) => {
            console.warn("[vinoshipper-sync-membership] failed", err);
          });
      })
      .catch((err) => {
        // Non-blocking — Vinoshipper outages must not break auth
        console.warn("[vinoshipper-link-customer] failed", err);
      });
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        setInternalUserEmail(session?.user?.email ?? null);
        if (session?.user) {
          // Defer to avoid running inside the auth callback
          setTimeout(() => ensureVinoshipperLink(session.user.id), 0);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      setInternalUserEmail(session?.user?.email ?? null);
      if (session?.user) {
        setTimeout(() => ensureVinoshipperLink(session.user.id), 0);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <CustomerAuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </CustomerAuthContext.Provider>
  );
}

export const useCustomerAuth = () => useContext(CustomerAuthContext);
