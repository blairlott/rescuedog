import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Mail, ExternalLink, RefreshCw, Phone, User, FileText, Plus } from "lucide-react";
import { toast } from "sonner";
import { Seo } from "@/components/Seo";

type Platform = {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  website: string | null;
  signup_url: string | null;
  status: string;
  priority: string;
  rep_name: string | null;
  rep_email: string | null;
  rep_phone: string | null;
  monthly_budget_cents: number | null;
  notes: string | null;
  last_contacted_at: string | null;
  seat_activated_at: string | null;
  api_connected_at: string | null;
};

const STATUSES = [
  "not_started", "contacted", "onboarding", "seat_active", "api_connected", "paused", "declined",
] as const;

const statusTone = (s: string) => {
  switch (s) {
    case "api_connected": return "bg-emerald-100 text-emerald-900 border-emerald-300";
    case "seat_active":   return "bg-green-100 text-green-900 border-green-300";
    case "onboarding":    return "bg-blue-100 text-blue-900 border-blue-300";
    case "contacted":     return "bg-amber-100 text-amber-900 border-amber-300";
    case "paused":        return "bg-zinc-200 text-zinc-800 border-zinc-300";
    case "declined":      return "bg-rose-100 text-rose-900 border-rose-300";
    default:              return "bg-muted text-muted-foreground border-border";
  }
};

const ME = "blair.lott@rescuedogwines.com";
const BRAND = "Rescue Dog Wines";

const buildPitchEmail = (p: Platform) => {
  const subject = encodeURIComponent(`${BRAND} — Advertiser onboarding request (${p.name})`);
  const body = encodeURIComponent(
`Hi ${p.rep_name ?? `${p.name} team`},

I'm Blair Lott, founder of Rescue Dog Wines (rescuedogwines.com). We're an alcohol e-commerce + DTC brand that gives back to rescue partners, and we're scaling paid media across programmatic, social, search, retail media, CTV, audio, and DOOH.

I'd like to open an advertiser seat on ${p.name}. Please send:
  • Onboarding requirements (MSA, IO, minimums, prepay vs net-30)
  • API access details once the seat is provisioned
  • Best contact for trafficking + billing

Brand: Rescue Dog Wines
Website: https://rescuedogwines.com
Vertical: Alcohol / wine (compliance-aware)
Target geos: US (state-by-state shipping eligible)
Monthly test budget: TBD on intro call

Looking forward to it,
Blair Lott
Founder, Rescue Dog Wines
${ME}`);
  const to = p.rep_email ?? "";
  return `mailto:${to}?subject=${subject}&body=${body}`;
};

export default function KennelMediaBuyingPage() {
  const qc = useQueryClient();
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [editing, setEditing] = useState<Platform | null>(null);

  const { data: platforms, isFetching, refetch } = useQuery({
    queryKey: ["media-buying-platforms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_buying_platforms" as any)
        .select("*")
        .order("category")
        .order("name");
      if (error) throw error;
      return data as unknown as Platform[];
    },
  });

  const categories = Array.from(new Set((platforms ?? []).map((p) => p.category)));
  const filtered = (platforms ?? []).filter((p) =>
    (filterCategory === "all" || p.category === filterCategory) &&
    (filterStatus === "all" || p.status === filterStatus)
  );
  const byCategory = filtered.reduce<Record<string, Platform[]>>((acc, p) => {
    (acc[p.category] ??= []).push(p);
    return acc;
  }, {});

  const summary = STATUSES.map((s) => ({
    status: s,
    count: (platforms ?? []).filter((p) => p.status === s).length,
  }));

  const handleSave = async (form: Partial<Platform>) => {
    if (!editing) return;
    const patch: any = { ...form, updated_at: new Date().toISOString() };
    if (form.status && form.status !== editing.status) {
      if (form.status === "contacted")     patch.last_contacted_at = new Date().toISOString();
      if (form.status === "seat_active")   patch.seat_activated_at = new Date().toISOString();
      if (form.status === "api_connected") patch.api_connected_at = new Date().toISOString();
    }
    const { error } = await supabase
      .from("media_buying_platforms" as any)
      .update(patch)
      .eq("id", editing.id);
    if (error) { toast.error(error.message); return; }

    if (form.status && form.status !== editing.status) {
      await supabase.from("media_buying_activity" as any).insert({
        platform_id: editing.id,
        activity_type: "status_change",
        summary: `Status: ${editing.status} → ${form.status}`,
      });
    }
    toast.success("Saved");
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["media-buying-platforms"] });
  };

  const logEmailSent = async (p: Platform) => {
    await supabase.from("media_buying_activity" as any).insert({
      platform_id: p.id,
      activity_type: "email_sent",
      summary: `Intro email opened to ${p.rep_email ?? p.name}`,
    });
    if (p.status === "not_started") {
      await supabase.from("media_buying_platforms" as any)
        .update({ status: "contacted", last_contacted_at: new Date().toISOString() })
        .eq("id", p.id);
      qc.invalidateQueries({ queryKey: ["media-buying-platforms"] });
    }
  };

  return (
    <>
      <Seo noindex title="Kennel Media Buying" />
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Media Buying</h1>
          <p className="text-sm text-muted-foreground max-w-2xl mt-1">
            Centralized advertiser-seat tracker across DSPs, social, search, retail media, CTV, audio, and DOOH/outdoor.
            The platform sends the intro email and tracks status — humans still sign MSAs and fund seats.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
        {summary.map((s) => (
          <button
            key={s.status}
            onClick={() => setFilterStatus(s.status === filterStatus ? "all" : s.status)}
            className={`rounded-lg border p-3 text-left transition ${filterStatus === s.status ? "ring-2 ring-primary" : ""}`}
          >
            <div className="text-xs uppercase text-muted-foreground">{s.status.replace("_", " ")}</div>
            <div className="text-2xl font-bold">{s.count}</div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <Label className="text-sm">Category:</Label>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Label className="text-sm">Status:</Label>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground ml-auto">{filtered.length} platforms</span>
      </div>

      {Object.entries(byCategory).map(([cat, list]) => (
        <section key={cat} className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{cat}</h2>
            <Badge variant="secondary">{list.length}</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {list.map((p) => (
              <div key={p.id} className="rounded-lg border bg-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{p.name}</div>
                    {p.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.description}</p>}
                  </div>
                  <Badge className={`border ${statusTone(p.status)}`}>
                    {p.status.replace("_", " ")}
                  </Badge>
                </div>

                {(p.rep_name || p.rep_email || p.rep_phone) && (
                  <div className="rounded-md bg-muted/40 px-2 py-1.5 text-xs space-y-0.5">
                    {p.rep_name  && <div className="flex items-center gap-1"><User  className="h-3 w-3" /> {p.rep_name}</div>}
                    {p.rep_email && <div className="flex items-center gap-1"><Mail  className="h-3 w-3" /> {p.rep_email}</div>}
                    {p.rep_phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" /> {p.rep_phone}</div>}
                  </div>
                )}

                {p.notes && (
                  <p className="text-xs text-muted-foreground line-clamp-2 flex items-start gap-1">
                    <FileText className="h-3 w-3 mt-0.5 shrink-0" /> {p.notes}
                  </p>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <a href={buildPitchEmail(p)} onClick={() => logEmailSent(p)}>
                    <Button size="sm" variant="default"><Mail className="h-3 w-3 mr-1" /> Start conversation</Button>
                  </a>
                  {p.signup_url && (
                    <a href={p.signup_url} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="outline"><ExternalLink className="h-3 w-3 mr-1" /> Sales</Button>
                    </a>
                  )}
                  {p.website && (
                    <a href={p.website} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="ghost"><ExternalLink className="h-3 w-3 mr-1" /> Site</Button>
                    </a>
                  )}
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setEditing(p)}>
                    Manage
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.name}</DialogTitle>
          </DialogHeader>
          {editing && <EditForm platform={editing} onSave={handleSave} />}
        </DialogContent>
      </Dialog>
    </div>
    </>
  );
}

function EditForm({ platform, onSave }: { platform: Platform; onSave: (f: Partial<Platform>) => void }) {
  const [status, setStatus] = useState(platform.status);
  const [priority, setPriority] = useState(platform.priority);
  const [rep_name, setRepName] = useState(platform.rep_name ?? "");
  const [rep_email, setRepEmail] = useState(platform.rep_email ?? "");
  const [rep_phone, setRepPhone] = useState(platform.rep_phone ?? "");
  const [monthly_budget_cents, setBudget] = useState(platform.monthly_budget_cents ?? 0);
  const [notes, setNotes] = useState(platform.notes ?? "");

  return (
    <>
      <Seo noindex title="Kennel Media Buying" />
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Priority</Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">low</SelectItem>
              <SelectItem value="medium">medium</SelectItem>
              <SelectItem value="high">high</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Rep name</Label>
        <Input value={rep_name} onChange={(e) => setRepName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Rep email</Label>
          <Input type="email" value={rep_email} onChange={(e) => setRepEmail(e.target.value)} />
        </div>
        <div>
          <Label>Rep phone</Label>
          <Input value={rep_phone} onChange={(e) => setRepPhone(e.target.value)} />
        </div>
      </div>
      <div>
        <Label>Monthly budget (USD)</Label>
        <Input type="number" value={Math.round(monthly_budget_cents / 100)} onChange={(e) => setBudget(parseInt(e.target.value || "0", 10) * 100)} />
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <Button onClick={() => onSave({ status, priority, rep_name, rep_email, rep_phone, monthly_budget_cents, notes })}>
        Save
      </Button>
    </div>
    </>
  );
}