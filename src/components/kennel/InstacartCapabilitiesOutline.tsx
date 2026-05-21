import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, BookOpen } from "lucide-react";

// Distilled from Instacart's public Carrot Ads API + Ads Manager docs
// (docs.instacart.com/ads, /ads/api/ads/overview, ads/api/ads/changelog,
// instacart.com/company/ads/measurement-insights). Capability list reflects
// what we have wired or scaffolded in this Command Center.
type Cap = {
  title: string;
  status: "live" | "scaffolded" | "pending_api";
  detail: string;
  endpoints?: string[];
  ask?: string; // question to bring to the Instacart rep
};

const CAPABILITIES: Cap[] = [
  {
    title: "Sponsored Product — campaign / ad-group / keyword sync",
    status: "live",
    detail:
      "Pulls campaign, ad group, creative, placement, region, daypart and format reports across the full Reports API window and writes to ad_performance_facts.",
    endpoints: ["/v2/reports/campaign", "/v2/reports/ad_group", "/v2/reports/creative", "/v2/reports/placement", "/v2/reports/region", "/v2/reports/daypart", "/v2/reports/format"],
    ask: "Confirm Reports API rate limits + max date span; can we get >90d single-call windows?",
  },
  {
    title: "Display / Shoppable Display / Brand Pages / Video",
    status: "scaffolded",
    detail:
      "Ingest path tags placement & format so non-SP surfaces (display, shoppable display, brand pages, shoppable video, universal, coupons) all land in the same warehouse.",
    endpoints: ["/v2/ian/sp", "/v2/ian/dp", "/v2/ian/bp", "/v2/ian/bp_block"],
    ask: "Which of these surfaces require Carrot retailer participation vs. open to all advertisers?",
  },
  {
    title: "Ad-event tracking (impressions / clicks / BrandPage events)",
    status: "scaffolded",
    detail:
      "Hooks for the Track Ad Events endpoint (incl. May-2025 BrandPage event + tracking_param). Wires into our CAPI + true-ROAS calc.",
    endpoints: ["/v2/ian/track"],
    ask: "Best-practice attribution window + dedupe vs. our Meta CAPI events?",
  },
  {
    title: "Autopilot — bid / pause / negative actions",
    status: "live",
    detail:
      "Confidence-gated bid raises/lowers, pauses, and negative keyword adds. Guardrails: paused-campaign protection, negative-category allowlist, error-rate kill switch, ROAS kill switch.",
    ask: "When will write access (campaign/keyword/bid PATCH) leave Partner-API beta?",
  },
  {
    title: "AI recommender + creative variants",
    status: "live",
    detail:
      "LLM scores search-term harvests, bid moves, dayparting, and generates SP creative variant copy ready for upload.",
    ask: "Any creative API for programmatic upload of SP / Display / Brand Page assets?",
  },
  {
    title: "RPM & Off-Platform Partnerships planner",
    status: "live",
    detail:
      "30+ pre-loaded agenda items covering Meta (overlays + CLA + lookalikes), TTD, Roku/CTV, YouTube, TikTok, Pinterest, BigQuery export, 1P audience overlap, NTB, and alcohol compliance.",
    ask: "Which RPM partners are GA for wine vs. invite-only? Minimum spend per partner?",
  },
  {
    title: "Daily + UPC-level reporting roll-up",
    status: "scaffolded",
    detail:
      "Schema supports the 2024 daily + UPC granularity release so we can join to wine_products SKU-by-day for true-margin ROAS.",
    ask: "Is UPC-level reporting on the Reports API or Ads Manager export only?",
  },
  {
    title: "Alcohol compliance & eligibility maps",
    status: "scaffolded",
    detail:
      "Per-state wine eligibility flags fed into campaign creation so we don't bid in states we can't ship; CTV state restriction map for RPM.",
    ask: "Current authoritative source for wine-eligible retailers + CTV state list?",
  },
  {
    title: "OAuth + credential rotation",
    status: "live",
    detail:
      "Refresh-token OAuth against /oauth/token, token caching, and DB-backed credential store via integration_credentials so admins rotate keys without redeploy.",
    ask: "Refresh-token lifetime + recommended rotation cadence?",
  },
  {
    title: "BigQuery / data-export pipe (planned)",
    status: "pending_api",
    detail:
      "Adapter slot for Reports → BigQuery / S3 destination once Instacart opens managed export to non-enterprise advertisers.",
    ask: "ETA on self-serve BigQuery export and is there a managed-service tier for it?",
  },
];

const STATUS_LABEL: Record<Cap["status"], { label: string; variant: "default" | "secondary" | "outline" }> = {
  live: { label: "Live", variant: "default" },
  scaffolded: { label: "Scaffolded", variant: "secondary" },
  pending_api: { label: "Pending API", variant: "outline" },
};

const PREVIEW_COUNT = 5;

export function InstacartCapabilitiesOutline() {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? CAPABILITIES : CAPABILITIES.slice(0, PREVIEW_COUNT);
  const hidden = CAPABILITIES.length - PREVIEW_COUNT;

  return (
    <Card className="border-2 border-primary/40">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm uppercase tracking-brand flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> Our Instacart Ads Capabilities — Outline
          </CardTitle>
          <div className="flex items-center gap-2 text-[10px]">
            <Badge variant="default">{CAPABILITIES.filter(c => c.status === "live").length} Live</Badge>
            <Badge variant="secondary">{CAPABILITIES.filter(c => c.status === "scaffolded").length} Scaffolded</Badge>
            <Badge variant="outline">{CAPABILITIES.filter(c => c.status === "pending_api").length} Pending API</Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Mapped against Carrot Ads API docs (docs.instacart.com/ads). Each line doubles as a question to bring tomorrow.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        <ol className="space-y-2 list-decimal list-inside">
          {visible.map((c, i) => {
            const st = STATUS_LABEL[c.status];
            return (
              <li key={i} className="text-sm">
                <span className="font-semibold">{c.title}</span>{" "}
                <Badge variant={st.variant} className="text-[10px] align-middle ml-1">{st.label}</Badge>
                {expanded && (
                  <div className="ml-5 mt-1 space-y-1">
                    <p className="text-xs text-muted-foreground">{c.detail}</p>
                    {c.endpoints && (
                      <p className="text-[10px] font-mono text-muted-foreground">
                        {c.endpoints.join("  ·  ")}
                      </p>
                    )}
                    {c.ask && (
                      <p className="text-xs"><span className="text-muted-foreground">Ask IC rep:</span> {c.ask}</p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(v => !v)}
          className="text-xs"
        >
          {expanded ? (
            <><ChevronUp className="h-3 w-3 mr-1" /> Show less</>
          ) : (
            <><ChevronDown className="h-3 w-3 mr-1" /> See more ({hidden} more + endpoints & rep questions)</>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}