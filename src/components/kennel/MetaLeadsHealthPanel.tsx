import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Activity, AlertTriangle, CheckCircle2, ExternalLink, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

/**
 * Meta Leads — Learning Phase Health
 *
 * Reads `meta_capi_events` to surface what Lindy needs before flipping
 * OUTCOME_LEADS optimization from `CompleteRegistration` to `Lead`:
 *
 *  - Leads/week vs. the 50-conversions/week Meta learning threshold
 *  - Success rate of the last 50 server fires (catches token/EMQ errors)
 *  - Test-mode fires in the last 24h (proves the pipeline works end-to-end
 *    without polluting prod attribution)
 *  - One-click "Send test event" → calls meta-capi-lead with test_mode=true
 *    so the event lands in Events Manager → Test Events only.
 */

const LEARNING_THRESHOLD_PER_WEEK = 50;

interface Row {
  event_name: string;
  test_mode: boolean;
  success: boolean;
  error: string | null;
  sent_at: string;
}

export function MetaLeadsHealthPanel() {
  const qc = useQueryClient();
  const [sending, setSending] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["kennel-meta-leads-health"],
    queryFn: async () => {
      const since = new Date(Date.now() - 14 * 86400_000).toISOString();
      const { data, error } = await supabase
        .from("meta_capi_events" as any)
        .select("event_name, test_mode, success, error, sent_at")
        .in("event_name", ["Lead", "CompleteRegistration"])
        .gte("sent_at", since)
        .order("sent_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    refetchInterval: 60_000,
  });

  const stats = useMemo(() => {
    const rows = data ?? [];
    const now = Date.now();
    const liveLeads = rows.filter(r => !r.test_mode && r.event_name === "Lead" && r.success);
    const last7d = liveLeads.filter(r => now - new Date(r.sent_at).getTime() <= 7 * 86400_000).length;
    const last24hTests = rows.filter(r => r.test_mode && now - new Date(r.sent_at).getTime() <= 86400_000).length;
    const recent = rows.filter(r => !r.test_mode).slice(0, 50);
    const successRate = recent.length > 0 ? recent.filter(r => r.success).length / recent.length : null;
    const lastError = rows.find(r => !r.success && r.error)?.error ?? null;
    const lastSentAt = rows[0]?.sent_at ?? null;
    return { last7d, last24hTests, successRate, lastError, lastSentAt };
  }, [data]);

  const progressPct = Math.min(100, (stats.last7d / LEARNING_THRESHOLD_PER_WEEK) * 100);
  const onThreshold = stats.last7d >= LEARNING_THRESHOLD_PER_WEEK;

  async function sendTestEvent() {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-capi-lead", {
        body: {
          test_mode: true,
          test_event_code: "TEST12345",
          email: "kennel+test@rescuedogwines.com",
          city: "Healdsburg",
          state: "CA",
          zip: "95448",
          country: "us",
        },
      });
      if (error) throw error;
      const lead = (data as any)?.results?.lead;
      const reg = (data as any)?.results?.registration;
      if (lead?.ok && reg?.ok) {
        toast.success("Test Lead + CompleteRegistration fired. Check Events Manager → Test Events.");
      } else if (lead?.skipped) {
        toast.error("META_PIXEL_ID or META_CAPI_TOKEN not configured");
      } else {
        toast.error(`Lead: ${lead?.error ?? "ok"} · Reg: ${reg?.error ?? "ok"}`);
      }
      qc.invalidateQueries({ queryKey: ["kennel-meta-leads-health"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Test fire failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="border-2 border-foreground bg-background p-4" style={{ borderRadius: 0 }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm uppercase tracking-brand font-bold text-foreground flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Meta Leads — Learning Phase Health
          </h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Switch OUTCOME_LEADS optimization from <code>CompleteRegistration</code> to <code>Lead</code> only when
            7-day Leads ≥ 50 AND success rate ≥ 95%.
          </p>
        </div>
        <button
          onClick={sendTestEvent}
          disabled={sending}
          className="text-[11px] uppercase tracking-brand font-bold border-2 border-foreground px-3 py-2 hover:bg-foreground hover:text-background transition-colors flex items-center gap-1.5 shrink-0 disabled:opacity-50"
          style={{ borderRadius: 0 }}
        >
          {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          Send test event
        </button>
      </div>

      {isLoading ? (
        <div className="text-xs text-muted-foreground">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Leads/week vs threshold */}
          <div className="border-2 border-foreground p-3" style={{ borderRadius: 0 }}>
            <div className="text-[10px] uppercase tracking-brand text-muted-foreground font-bold">Live Leads · last 7d</div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-foreground">{stats.last7d}</span>
              <span className="text-xs text-muted-foreground">/ {LEARNING_THRESHOLD_PER_WEEK} threshold</span>
            </div>
            <div className="mt-2 h-2 bg-muted border border-foreground" style={{ borderRadius: 0 }}>
              <div
                className={`h-full ${onThreshold ? "bg-primary" : "bg-foreground/60"}`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="text-[11px] mt-2 flex items-center gap-1.5">
              {onThreshold ? (
                <><CheckCircle2 className="h-3 w-3 text-primary" /> <span className="text-foreground">Out of learning — safe to switch optimization to Lead</span></>
              ) : (
                <><AlertTriangle className="h-3 w-3 text-foreground/60" /> <span className="text-muted-foreground">{LEARNING_THRESHOLD_PER_WEEK - stats.last7d} more Leads needed this week</span></>
              )}
            </div>
          </div>

          {/* Success rate */}
          <div className="border-2 border-foreground p-3" style={{ borderRadius: 0 }}>
            <div className="text-[10px] uppercase tracking-brand text-muted-foreground font-bold">CAPI success rate · last 50 fires</div>
            <div className="text-2xl font-bold text-foreground mt-1">
              {stats.successRate == null ? "—" : `${(stats.successRate * 100).toFixed(0)}%`}
            </div>
            <div className="text-[11px] text-muted-foreground mt-2 break-words">
              {stats.lastError ? (
                <span className="text-primary">Last error: {stats.lastError.slice(0, 80)}</span>
              ) : stats.lastSentAt ? (
                <>Last fire: {new Date(stats.lastSentAt).toLocaleString()}</>
              ) : (
                "No fires yet — send a test event."
              )}
            </div>
          </div>

          {/* Test events */}
          <div className="border-2 border-foreground p-3" style={{ borderRadius: 0 }}>
            <div className="text-[10px] uppercase tracking-brand text-muted-foreground font-bold">Test fires · last 24h</div>
            <div className="text-2xl font-bold text-foreground mt-1">{stats.last24hTests}</div>
            <a
              href={`https://business.facebook.com/events_manager2/list/pixel/${import.meta.env.VITE_META_PIXEL_ID ?? ""}/test_events`}
              target="_blank" rel="noopener noreferrer"
              className="text-[11px] uppercase tracking-brand font-bold text-primary mt-2 inline-flex items-center gap-1 hover:underline"
            >
              Events Manager <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      )}

      <div className="mt-3 text-[11px] text-muted-foreground leading-relaxed border-t border-foreground/20 pt-3">
        <strong className="text-foreground">Event Match Quality</strong> is only visible inside Meta Events Manager
        (not exposed via API). We send hashed email + city/state/zip + fbc/fbp + UA + IP — target EMQ ≥ 7.0.
        If EMQ drops, check that <code>_fbc</code>/<code>_fbp</code> cookies are reaching <code>meta-capi-lead</code>.
      </div>
    </section>
  );
}