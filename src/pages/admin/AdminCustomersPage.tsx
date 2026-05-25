import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, RefreshCw, Search, Users, Wine, Mail, Phone, MapPin } from "lucide-react";

type VsCustomer = {
  id: string;
  vs_customer_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  business_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  is_club_member: boolean;
  club_name: string | null;
  vs_created_at: string | null;
  last_synced_at: string;
  tags: any;
  raw: any;
};

type SyncLog = {
  id: string;
  started_at: string;
  finished_at: string | null;
  pages: number;
  seen: number;
  inserted: number;
  updated: number;
  errors: number;
  error_message: string | null;
  triggered_by: string;
};

const PAGE_SIZE = 50;

export default function AdminCustomersPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [rows, setRows] = useState<VsCustomer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [clubFilter, setClubFilter] = useState<"all" | "club" | "non_club">("all");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<VsCustomer | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<SyncLog | null>(null);
  const [states, setStates] = useState<string[]>([]);

  // Auth + role check
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { navigate("/admin"); return; }
      const { data: ok } = await supabase.rpc("is_admin_or_owner", { _user_id: session.user.id });
      if (!ok) { navigate("/admin"); return; }
      setAllowed(true);
      setChecking(false);
    })();
  }, [navigate]);

  const fetchRows = async () => {
    setLoading(true);
    let q = supabase
      .from("vs_customers")
      .select("*", { count: "exact" })
      .order("last_synced_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (search.trim()) {
      const s = search.trim();
      q = q.or(
        `email.ilike.%${s}%,first_name.ilike.%${s}%,last_name.ilike.%${s}%,business_name.ilike.%${s}%,vs_customer_id.ilike.%${s}%`,
      );
    }
    if (clubFilter === "club") q = q.eq("is_club_member", true);
    if (clubFilter === "non_club") q = q.eq("is_club_member", false);
    if (stateFilter !== "all") q = q.eq("state", stateFilter);
    const { data, count, error } = await q;
    if (error) toast({ title: "Failed to load", description: error.message, variant: "destructive" });
    setRows((data as VsCustomer[]) ?? []);
    setTotal(count ?? 0);
    setLoading(false);
  };

  const fetchStates = async () => {
    const { data } = await supabase.from("vs_customers").select("state").not("state", "is", null).limit(1000);
    const uniq = Array.from(new Set(((data ?? []) as any[]).map((r) => r.state).filter(Boolean))).sort();
    setStates(uniq as string[]);
  };

  const fetchLastSync = async () => {
    const { data } = await supabase
      .from("vs_customer_sync_log")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setLastSync((data as SyncLog) ?? null);
  };

  useEffect(() => { if (allowed) { fetchRows(); fetchLastSync(); fetchStates(); } /* eslint-disable-next-line */ }, [allowed, page, clubFilter, stateFilter]);
  useEffect(() => {
    if (!allowed) return;
    const t = setTimeout(() => { setPage(0); fetchRows(); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [search]);

  const handleRefresh = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("vinoshipper-sync-customers", {
        body: { page_size: 100, max_pages: 200 },
      });
      if (error) throw error;
      const r = data as any;
      if (r?.ok) {
        toast({
          title: "Sync complete",
          description: `${r.seen} seen · ${r.inserted} new · ${r.updated} updated`,
        });
      } else {
        toast({ title: "Sync finished with errors", description: r?.error || "See log", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Sync failed", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setSyncing(false);
      await Promise.all([fetchRows(), fetchLastSync(), fetchStates()]);
    }
  };

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  if (checking) {
    return <div className="min-h-dvh flex items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (!allowed) return null;

  return (
    <div className="min-h-dvh bg-secondary">
      <header className="border-b border-border bg-background">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admin"><ArrowLeft className="h-4 w-4 mr-1" /> Admin</Link>
          </Button>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold text-foreground">Customers</h1>
            <Badge variant="outline">{total.toLocaleString()} synced</Badge>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {lastSync && (
              <span className="text-xs text-muted-foreground hidden md:inline">
                Last sync: {lastSync.finished_at ? new Date(lastSync.finished_at).toLocaleString() : "in progress…"}
                {lastSync.errors > 0 && <span className="text-destructive ml-1">· {lastSync.errors} errors</span>}
              </span>
            )}
            <Button onClick={handleRefresh} disabled={syncing} size="sm">
              <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing…" : "Refresh now"}
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <p className="text-sm text-muted-foreground mb-4">
          Mirror of the Vinoshipper customer list. Customers sign up at Vinoshipper checkout; this view
          syncs nightly and on demand. Use it for Subscribe &amp; Save, AI wine-club curation, and ad
          audience exports.
        </p>

        <div className="flex flex-col md:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, business, or VS ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={clubFilter} onValueChange={(v: any) => { setClubFilter(v); setPage(0); }}>
            <SelectTrigger className="w-full md:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All customers</SelectItem>
              <SelectItem value="club">Club members</SelectItem>
              <SelectItem value="non_club">Non-club</SelectItem>
            </SelectContent>
          </Select>
          <Select value={stateFilter} onValueChange={(v) => { setStateFilter(v); setPage(0); }}>
            <SelectTrigger className="w-full md:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All states</SelectItem>
              {states.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="bg-background border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground uppercase text-xs tracking-wide">
                <tr>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">Location</th>
                  <th className="px-3 py-2 text-left">Club</th>
                  <th className="px-3 py-2 text-left">VS ID</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={5} className="px-3 py-12 text-center text-muted-foreground">Loading…</td></tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-12 text-center text-muted-foreground">
                      No customers yet. Click <strong>Refresh now</strong> to import from Vinoshipper.
                    </td>
                  </tr>
                )}
                {!loading && rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r)}
                    className="border-t border-border hover:bg-muted/50 cursor-pointer"
                  >
                    <td className="px-3 py-2 font-medium text-foreground">
                      {[r.first_name, r.last_name].filter(Boolean).join(" ") || r.business_name || "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.email ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {[r.city, r.state].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="px-3 py-2">
                      {r.is_club_member ? (
                        <Badge className="gap-1"><Wine className="h-3 w-3" />{r.club_name || "Member"}</Badge>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground font-mono">{r.vs_customer_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {total > PAGE_SIZE && (
            <div className="border-t border-border px-3 py-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Page {page + 1} of {totalPages}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</Button>
                <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </div>
      </main>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>
                  {[selected.first_name, selected.last_name].filter(Boolean).join(" ") || selected.business_name || selected.email}
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4 text-sm">
                <div className="space-y-1">
                  {selected.email && <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" />{selected.email}</div>}
                  {selected.phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />{selected.phone}</div>}
                  {(selected.address || selected.city) && (
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        {selected.address && <div>{selected.address}</div>}
                        <div>{[selected.city, selected.state, selected.zip].filter(Boolean).join(" ")}</div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="border-t border-border pt-3 space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Vinoshipper ID</span><span className="font-mono">{selected.vs_customer_id}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">VS created</span><span>{selected.vs_created_at ? new Date(selected.vs_created_at).toLocaleDateString() : "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Last synced</span><span>{new Date(selected.last_synced_at).toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Club</span><span>{selected.is_club_member ? selected.club_name || "Member" : "No"}</span></div>
                </div>
                <details className="border-t border-border pt-3">
                  <summary className="cursor-pointer text-xs uppercase tracking-wide text-muted-foreground">Raw Vinoshipper payload</summary>
                  <pre className="mt-2 text-[10px] bg-muted p-2 overflow-auto max-h-64">{JSON.stringify(selected.raw, null, 2)}</pre>
                </details>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}