import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";
import { Key, Save, Trash2, Eye, EyeOff, Lock, Plug, CheckCircle2, XCircle, Loader2 } from "lucide-react";

const SHARP = { borderRadius: 0 } as const;
const BRAND = { fontFamily: '"Nunito Sans", system-ui, sans-serif' } as const;

type CredRow = {
  id: string;
  provider: string;
  credential_key: string;
  credential_value: string;
  scope: string;
  notes: string | null;
  updated_at: string;
};

type ProviderDef = {
  id: string;
  label: string;
  description: string;
  envFallbackPrefix: string;
  category?: string;
  keys: { key: string; label: string; placeholder?: string; secret?: boolean }[];
};

// Providers admins can self-rotate from the UI. Edge functions will read from
// integration_credentials first and fall back to Deno env when not set.
const PROVIDERS: ProviderDef[] = [
  {
    id: "yahoo_dsp",
    label: "Yahoo DSP",
    description: "OAuth2 client-credentials for the Yahoo Ad Manager Plus API.",
    envFallbackPrefix: "YAHOO_DSP",
    category: "Ad Platforms",
    keys: [
      { key: "client_id",     label: "Client ID" },
      { key: "client_secret", label: "Client Secret", secret: true },
      { key: "advertiser_id", label: "Advertiser ID" },
    ],
  },
  {
    id: "openweather",
    label: "OpenWeather",
    description: "Used by the weather-signals job to bias bids on storms/heat waves.",
    envFallbackPrefix: "OPENWEATHER",
    category: "Signals",
    keys: [{ key: "api_key", label: "API Key", secret: true }],
  },
  {
    id: "mailchimp",
    label: "Mailchimp",
    description: "Audience sync for win-back and lapsed-customer flows.",
    envFallbackPrefix: "MAILCHIMP",
    category: "Audiences",
    keys: [
      { key: "api_key",   label: "API Key", secret: true },
      { key: "server",    label: "Server prefix", placeholder: "us21" },
      { key: "audience_id", label: "Default Audience ID" },
    ],
  },
  {
    id: "delivery_webhooks",
    label: "Delivery Webhooks",
    description: "HMAC secrets for inbound delivery-partner webhooks (DoorDash, Uber, etc.).",
    envFallbackPrefix: "DELIVERY",
    category: "Webhooks",
    keys: [
      { key: "doordash_secret", label: "DoorDash signing secret", secret: true },
      { key: "uber_secret",     label: "Uber signing secret",     secret: true },
      { key: "grubhub_secret",  label: "Grubhub signing secret",  secret: true },
      { key: "instacart_secret",label: "Instacart signing secret",secret: true },
    ],
  },
  // ─── Retail Media Networks ─────────────────────────────────
  // Most RMNs are invite-only API programs. Credentials here are stored for
  // when access is granted; until then they act as a tracked placeholder so
  // ops knows what's pending. Schema mirrors each network's auth pattern.
  {
    id: "kroger_precision",
    label: "Kroger Precision Marketing (84.51°)",
    description: "Onsite + offsite ads on Kroger banners. OAuth2 via 84.51° API.",
    envFallbackPrefix: "KPM",
    category: "Retail Media",
    keys: [
      { key: "client_id",     label: "Client ID" },
      { key: "client_secret", label: "Client Secret", secret: true },
      { key: "advertiser_id", label: "Advertiser ID" },
    ],
  },
  {
    id: "albertsons_media",
    label: "Albertsons Media Collective",
    description: "Onsite ads across Albertsons, Safeway, Vons, Jewel-Osco, etc.",
    envFallbackPrefix: "AMC",
    category: "Retail Media",
    keys: [
      { key: "api_key",        label: "API Key", secret: true },
      { key: "advertiser_id",  label: "Advertiser ID" },
    ],
  },
  {
    id: "roundel_target",
    label: "Roundel (Target)",
    description: "Target's in-house media network. API access via Roundel partner portal.",
    envFallbackPrefix: "ROUNDEL",
    category: "Retail Media",
    keys: [
      { key: "client_id",     label: "Client ID" },
      { key: "client_secret", label: "Client Secret", secret: true },
      { key: "advertiser_id", label: "Advertiser ID" },
    ],
  },
  {
    id: "walmart_connect",
    label: "Walmart Connect",
    description: "Sponsored Search + display across Walmart.com and stores.",
    envFallbackPrefix: "WALMART_CONNECT",
    category: "Retail Media",
    keys: [
      { key: "client_id",     label: "Client ID" },
      { key: "client_secret", label: "Client Secret", secret: true },
      { key: "advertiser_id", label: "Advertiser ID" },
    ],
  },
  {
    id: "sams_map",
    label: "Sam's Club MAP",
    description: "Member Access Platform — Sam's Club retail media API.",
    envFallbackPrefix: "SAMS_MAP",
    category: "Retail Media",
    keys: [
      { key: "client_id",     label: "Client ID" },
      { key: "client_secret", label: "Client Secret", secret: true },
      { key: "advertiser_id", label: "Advertiser ID" },
    ],
  },
  {
    id: "instacart_ads",
    label: "Instacart Ads",
    description: "Sponsored Product + display on Instacart marketplace.",
    envFallbackPrefix: "INSTACART_ADS",
    category: "Retail Media",
    keys: [
      { key: "api_key",       label: "API Key", secret: true },
      { key: "advertiser_id", label: "Advertiser ID" },
    ],
  },
  {
    id: "amazon_ads",
    label: "Amazon Ads",
    description: "Sponsored Products/Brands/Display via the Amazon Advertising API.",
    envFallbackPrefix: "AMAZON_ADS",
    category: "Retail Media",
    keys: [
      { key: "client_id",     label: "Client ID" },
      { key: "client_secret", label: "Client Secret", secret: true },
      { key: "refresh_token", label: "Refresh Token", secret: true },
      { key: "profile_id",    label: "Profile ID" },
    ],
  },
  {
    id: "criteo_retail",
    label: "Criteo Retail Media",
    description: "Network access to Costco, Best Buy, Macy's, Ulta, and more.",
    envFallbackPrefix: "CRITEO_RM",
    category: "Retail Media",
    keys: [
      { key: "client_id",     label: "Client ID" },
      { key: "client_secret", label: "Client Secret", secret: true },
      { key: "account_id",    label: "Account ID" },
    ],
  },
];

export default function KennelIntegrationsPage() {
  const { data: roleInfo } = useUserRole();
  const isAdmin = !!roleInfo?.isAdminOrOwner;
  const [rows, setRows] = useState<CredRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; status: string; detail?: string }>>({});

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("integration_credentials")
      .select("*")
      .order("provider")
      .order("credential_key");
    if (error) toast.error(error.message);
    setRows((data as CredRow[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const rowFor = (provider: string, key: string) =>
    rows.find((r) => r.provider === provider && r.credential_key === key && r.scope === "live");

  const draftKey = (p: string, k: string) => `${p}::${k}`;

  const save = async (provider: string, key: string) => {
    const value = drafts[draftKey(provider, key)] ?? "";
    if (!value.trim()) { toast.error("Value is empty"); return; }
    setBusy(draftKey(provider, key));
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      provider,
      credential_key: key,
      credential_value: value.trim(),
      scope: "live",
      updated_by: user?.id ?? null,
      created_by: user?.id ?? null,
    };
    const { error } = await supabase
      .from("integration_credentials")
      .upsert(payload, { onConflict: "provider,credential_key,scope" });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`${provider} · ${key} saved`);
    setDrafts((d) => { const n = { ...d }; delete n[draftKey(provider, key)]; return n; });
    await load();
  };

  const remove = async (id: string, label: string) => {
    if (!confirm(`Delete credential ${label}? Edge functions will fall back to the Lovable secret if one exists.`)) return;
    setBusy(id);
    const { error } = await supabase.from("integration_credentials").delete().eq("id", id);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    await load();
  };

  const test = async (provider: string) => {
    setTesting(provider);
    const { data, error } = await supabase.functions.invoke("kennel-test-credentials", {
      body: { provider },
    });
    setTesting(null);
    if (error) {
      const result = { ok: false, status: "error", detail: error.message };
      setTestResults((r) => ({ ...r, [provider]: result }));
      toast.error(`${provider}: ${error.message}`);
      return;
    }
    setTestResults((r) => ({ ...r, [provider]: data }));
    if (data?.ok) toast.success(`${provider}: ${data.detail ?? "ok"}`);
    else toast.error(`${provider}: ${data?.detail ?? data?.status ?? "failed"}`);
  };

  if (!isAdmin) {
    return (
      <div className="p-6" style={BRAND}>
        <Card className="p-6 border-2" style={SHARP}>
          <div className="flex items-center gap-2 text-foreground">
            <Lock className="h-4 w-4" /> Admin/owner only.
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6" style={BRAND}>
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Key className="h-5 w-5 text-primary" />
          <h1 className="text-xl md:text-2xl font-bold uppercase tracking-brand">Integrations</h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Paste third-party API keys here to rotate without redeploying. Edge functions read
          this table first and fall back to the Lovable secret store if a row is missing.
          Values are stored in the database and only readable by owners/admins.
        </p>
      </header>

      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}

      {Object.entries(
        PROVIDERS.reduce<Record<string, ProviderDef[]>>((acc, p) => {
          const cat = p.category ?? "Other";
          (acc[cat] ||= []).push(p);
          return acc;
        }, {}),
      ).map(([category, providers]) => (
        <section key={category} className="space-y-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold uppercase tracking-brand text-foreground">{category}</h2>
            <div className="h-px bg-border flex-1" />
            <Badge variant="outline" style={SHARP} className="text-[10px]">
              {providers.length}
            </Badge>
          </div>
          <div className="grid gap-4">
            {providers.map((p) => (
              <Card key={p.id} className="p-4 md:p-5 border-2" style={SHARP}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-bold uppercase tracking-brand text-foreground">{p.label}</h2>
                  <Badge variant="outline" style={SHARP} className="text-[10px]">{p.id}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{p.description}</p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  style={SHARP}
                  disabled={testing === p.id}
                  onClick={() => test(p.id)}
                >
                  {testing === p.id ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Plug className="h-3 w-3 mr-1" />
                  )}
                  Test
                </Button>
                {testResults[p.id] && (
                  <div
                    className={`flex items-center gap-1 text-[10px] uppercase tracking-brand ${
                      testResults[p.id].ok ? "text-primary" : "text-destructive"
                    }`}
                    title={testResults[p.id].detail ?? ""}
                  >
                    {testResults[p.id].ok ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <XCircle className="h-3 w-3" />
                    )}
                    {testResults[p.id].status}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {p.keys.map((k) => {
                const existing = rowFor(p.id, k.key);
                const dk = draftKey(p.id, k.key);
                const showing = !!reveal[dk];
                const envName = `${p.envFallbackPrefix}_${k.key.toUpperCase()}`;
                return (
                  <div key={k.key} className="grid md:grid-cols-[200px_1fr_auto] gap-2 items-start">
                    <div>
                      <Label className="text-xs font-bold uppercase tracking-brand">{k.label}</Label>
                      <div className="text-[10px] text-muted-foreground font-mono">{k.key}</div>
                      {existing ? (
                        <Badge className="mt-1 text-[10px] bg-primary text-primary-foreground" style={SHARP}>
                          DB · updated {new Date(existing.updated_at).toLocaleDateString()}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="mt-1 text-[10px]" style={SHARP}>
                          env fallback: {envName}
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Input
                        type={k.secret && !showing ? "password" : "text"}
                        placeholder={existing ? "•".repeat(12) + " (set — paste to replace)" : (k.placeholder ?? "Paste value…")}
                        value={drafts[dk] ?? ""}
                        onChange={(e) => setDrafts((d) => ({ ...d, [dk]: e.target.value }))}
                        style={SHARP}
                        className="font-mono text-xs"
                      />
                      {k.secret && (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          style={SHARP}
                          onClick={() => setReveal((r) => ({ ...r, [dk]: !showing }))}
                          aria-label={showing ? "Hide" : "Reveal"}
                        >
                          {showing ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        style={SHARP}
                        disabled={busy === dk || !(drafts[dk]?.trim())}
                        onClick={() => save(p.id, k.key)}
                      >
                        <Save className="h-3 w-3 mr-1" /> Save
                      </Button>
                      {existing && (
                        <Button
                          size="sm"
                          variant="outline"
                          style={SHARP}
                          disabled={busy === existing.id}
                          onClick={() => remove(existing.id, `${p.id}.${k.key}`)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
              </Card>
            ))}
          </div>
        </section>
      ))}

      <Card className="p-4 border-2 border-dashed" style={SHARP}>
        <div className="text-xs text-muted-foreground space-y-1">
          <div><strong>Lookup order:</strong> integration_credentials (this page) → Lovable secret (Deno env) → unset.</div>
          <div><strong>High-sensitivity keys</strong> (Stripe live, Supabase service role, Vinoshipper) stay in the Lovable secret store and are not editable here.</div>
        </div>
      </Card>
    </div>
  );
}