import { useEffect, useRef, useState } from "react";
import { useDonationMetric } from "@/hooks/useDonationMetric";
import { useCmsContent, getCmsValue } from "@/hooks/useCmsContent";
import { CmsEditButton } from "@/components/cms/CmsEditButton";
import { CmsEditDialog, type CmsField } from "@/components/cms/CmsEditDialog";
import { T } from "@/components/T";

/** Fallback copy — used ONLY when source === 'fallback' (i.e. the QB
 *  pull failed). When source === 'quickbooks' we render the real value
 *  verbatim, even if it dips. A silent brand-floor that masks reality
 *  would damage brand integrity worse than a temporary number wobble. */
const FALLBACK_AMOUNT_DISPLAY = "$170,000+";
const FALLBACK_PARTNER_COUNT = 208;

/** Parse "$170,000+" → 170000 (drops '$', commas, trailing '+'). Returns null if no digits. */
function parseDisplayAmount(display: string): { prefix: string; number: number; suffix: string } | null {
  const m = display.match(/^([^\d-]*)([\d,]+)(.*)$/);
  if (!m) return null;
  const n = parseInt(m[2].replace(/,/g, ""), 10);
  if (!Number.isFinite(n)) return null;
  return { prefix: m[1] ?? "", number: n, suffix: m[3] ?? "" };
}

function useCountUp(target: number, enabled: boolean, durationMs = 1500): number {
  // Default to the target so first paint (and any environment without IO)
  // shows the real number. When `enabled` flips true we restart from 0 and
  // animate up to `target`.
  const [value, setValue] = useState(target);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!enabled || target <= 0) { setValue(target); return; }
    setValue(0);
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(eased * target));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [enabled, target, durationMs]);
  return value;
}

/** Public-facing donation impact badge — qualitative framing per brand rules.
 *  Reads copy from cms_content (page='home', section_key='donation_counter')
 *  and substitutes {amount} / {partners} from donation_metrics. */
export function DonationCounter() {
  const { data, isLoading } = useDonationMetric("lifetime_donations");
  const { content, upsert } = useCmsContent("homepage");
  const [editing, setEditing] = useState(false);
  const [animate, setAnimate] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // Wait until the section has rendered (i.e. data has loaded) before
    // attaching the IntersectionObserver, otherwise sectionRef.current is
    // null on first mount and the observer is never created — leaving the
    // counter stuck at its pre-animation value.
    if (isLoading) return;
    if (!sectionRef.current) return;
    const el = sectionRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) { setAnimate(true); io.disconnect(); }
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [isLoading]);

  const eyebrow = getCmsValue(content, "donation_counter", "eyebrow", "Mission in numbers");
  const headlineTemplate = getCmsValue(
    content,
    "donation_counter",
    "headline_template",
    "{amount} donated to {partners}+ rescue partners",
  );
  const subtext = getCmsValue(
    content,
    "donation_counter",
    "subtext",
    "Since 2017 — half of every bottle sold supports animal rescue.",
  );

  // Render the real QB-sourced value verbatim. Only substitute the seed
  // copy when the metric pipeline explicitly reports source='fallback'
  // (i.e. the QB pull failed), so visitors never see $0 / 0 in a
  // hard-failure mode, but a healthy QB pull always shows the truth.
  const isFallback = !data || data.source === "fallback";
  const rawPartnerCount = data?.partner_count ?? 0;
  const partnerCount = isFallback || rawPartnerCount <= 0
    ? FALLBACK_PARTNER_COUNT
    : rawPartnerCount;
  const parsedRaw = parseDisplayAmount(data?.value_display ?? "");
  const parsed = !isFallback && parsedRaw && parsedRaw.number > 0
    ? parsedRaw
    : parseDisplayAmount(FALLBACK_AMOUNT_DISPLAY)!;
  const targetAmount = parsed.number;
  const animatedAmount = useCountUp(targetAmount, animate);
  const animatedPartners = useCountUp(partnerCount, animate);

  if (isLoading) return null;

  const displayAmount = `${parsed.prefix}${animatedAmount.toLocaleString("en-US")}${parsed.suffix}`;
  const displayPartners = String(animatedPartners);

  // Split headline on {amount} / {partners} so we can style the numbers.
  const rendered = headlineTemplate
    .replace("{amount}", `\u0001${displayAmount}\u0001`)
    .replace("{partners}", `\u0001${displayPartners}\u0001`);
  const parts = rendered.split("\u0001");

  const fields: CmsField[] = [
    { key: "eyebrow", label: "Eyebrow", type: "text", value: eyebrow },
    {
      key: "headline_template",
      label: "Headline (supports {amount} and {partners})",
      type: "text",
      value: headlineTemplate,
    },
    { key: "subtext", label: "Subtext", type: "text", value: subtext },
  ];

  return (
    <section
      ref={sectionRef}
      className="relative py-14 md:py-20 bg-secondary/30 border-y border-border"
    >
      <CmsEditButton onClick={() => setEditing(true)} />
      <div className="container mx-auto px-4 text-center max-w-3xl">
        {eyebrow && (
          <p className="text-xs tracking-brand uppercase text-primary font-bold mb-3">
            <T>{eyebrow}</T>
          </p>
        )}
        <h2 className="text-3xl md:text-5xl font-bold uppercase leading-tight tracking-tight">
          {parts.map((p, i) =>
            i % 2 === 1 ? (
              <span key={i} className="text-primary tabular-nums">{p}</span>
            ) : (
              <T key={i}>{p}</T>
            ),
          )}
        </h2>
        {subtext && (
          <p className="text-foreground/70 text-base md:text-lg mt-4 max-w-xl mx-auto">
            <T>{subtext}</T>
          </p>
        )}
      </div>

      <CmsEditDialog
        open={editing}
        onOpenChange={setEditing}
        title="Donation Counter"
        fields={fields}
        isSaving={upsert.isPending}
        onSave={(values) =>
          upsert.mutate(
            { sectionKey: "donation_counter", content: values },
            { onSuccess: () => setEditing(false) },
          )
        }
      />
    </section>
  );
}