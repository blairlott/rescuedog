import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Heart, LayoutDashboard, Map, Route, Truck, Users, Search } from "lucide-react";

type Result = { id: string; label: string; sub?: string; to: string; icon: any };

export function CrmCommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const navigate = useNavigate();

  // ⌘K / Ctrl+K toggle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Search across accounts + ambassadors
  useEffect(() => {
    let cancel = false;
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    (async () => {
      const [{ data: accounts }, { data: ambassadors }] = await Promise.all([
        supabase.from("sales_accounts").select("id, account_name, city, state").ilike("account_name", `%${q}%`).limit(6),
        supabase.from("ambassador_profiles").select("id, display_name, handle, status").ilike("display_name", `%${q}%`).limit(6),
      ]);
      if (cancel) return;
      const out: Result[] = [];
      (accounts || []).forEach(a => out.push({ id: `acc-${a.id}`, label: a.account_name, sub: [a.city, a.state].filter(Boolean).join(", ") || "Account", to: `/crm/account/${a.id}`, icon: Building2 }));
      (ambassadors || []).forEach(a => out.push({ id: `amb-${a.id}`, label: a.display_name, sub: `Ambassador · ${a.status}`, to: `/crm/ambassadors`, icon: Heart }));
      setResults(out);
    })();
    return () => { cancel = true; };
  }, [query]);

  const go = (to: string) => { setOpen(false); setQuery(""); navigate(to); };

  const navItems: Result[] = [
    { id: "n-dash", label: "Dashboard", to: "/crm", icon: LayoutDashboard },
    { id: "n-map", label: "Map", to: "/crm/map", icon: Map },
    { id: "n-routes", label: "Route Planner", to: "/crm/routes", icon: Route },
    { id: "n-amb", label: "Ambassador Command Center", to: "/crm/ambassadors", icon: Heart },
    { id: "n-drop", label: "Drop-Ship", to: "/crm/dropship", icon: Truck },
    { id: "n-users", label: "Users & Approvals", to: "/crm/admin", icon: Users },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 text-xs text-muted-foreground border border-border px-3 py-1.5 hover:bg-muted transition-colors w-full max-w-xs"
      >
        <Search className="w-3.5 h-3.5" />
        Search accounts, ambassadors…
        <kbd className="ml-auto text-[10px] bg-muted px-1.5 py-0.5">⌘K</kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search accounts, ambassadors, or jump to a page…" value={query} onValueChange={setQuery} />
        <CommandList>
          <CommandEmpty>{query.length < 2 ? "Type at least 2 characters to search…" : "No results."}</CommandEmpty>
          {results.length > 0 && (
            <CommandGroup heading="Results">
              {results.map(r => (
                <CommandItem key={r.id} value={`${r.label} ${r.sub ?? ""}`} onSelect={() => go(r.to)}>
                  <r.icon className="w-4 h-4 mr-2" />
                  <div className="flex flex-col">
                    <span>{r.label}</span>
                    {r.sub && <span className="text-xs text-muted-foreground">{r.sub}</span>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          <CommandSeparator />
          <CommandGroup heading="Jump to">
            {navItems.map(n => (
              <CommandItem key={n.id} value={n.label} onSelect={() => go(n.to)}>
                <n.icon className="w-4 h-4 mr-2" />
                {n.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}