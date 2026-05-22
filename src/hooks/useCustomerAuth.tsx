import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { setInternalUserEmail } from "@/lib/internalUsers";
import { useQueryClient } from "@tanstack/react-query";

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
  const queryClient = useQueryClient();

  // Fire-and-forget Vinoshipper bootstrap on sign-in / returning visit.
  //   - `link-customer` is gated by sessionStorage (idempotent + ID-bound,
  //     no need to re-link in the same browser session).
  //   - `sync-membership` runs on EVERY auth resolution so wine club status
  //     reflects VS truth on every visit (and recovers if the first sync
  //     happened before VS had created the customer).
  const ensureVinoshipperLink = (uid: string) => {
    const linkKey = `vs_link_attempted_${uid}`;
    if (!sessionStorage.getItem(linkKey)) {
      sessionStorage.setItem(linkKey, "1");
      supabase.functions.invoke("vinoshipper-link-customer").catch((err) => {
        console.warn("[vinoshipper-link-customer] failed", err);
      });
    }

    // Always re-poll wine club membership from VS on sign-in / returning visit.
    supabase.functions
      .invoke("vinoshipper-sync-membership")
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["wine-club-membership", uid] });
        queryClient.invalidateQueries({ queryKey: ["wine-club-gifts", uid] });
      })
      .catch((err) => {
        console.warn("[vinoshipper-sync-membership] failed", err);
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
