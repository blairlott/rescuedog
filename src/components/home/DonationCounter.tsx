import { useEffect, useRef, useState } from "react";
import { useDonationMetric } from "@/hooks/useDonationMetric";
import { useCmsContent, getCmsValue } from "@/hooks/useCmsContent";
import { CmsEditButton } from "@/components/cms/CmsEditButton";
import { CmsEditDialog, type CmsField } from "@/components/cms/CmsEditDialog";
import { T } from "@/components/T";

const COUNTER_FIELDS: CmsField[] = [
  { name: "eyebrow", label: "Eyebrow", type: "text" },
  { name: "headline_template", label: "Headline (supports {amount} and {partners})", type: "text" },
  { name: "subtext", label: "Subtext", type: "text" },
];

/** Parse "$170,000+" → 170000 (drops '$', commas, trailing '+'). Returns null if no digits. */
function parseDisplayAmount(display: string): { prefix: string; number: number; suffix: string } | null {
  const m = display.match(/^([^\d-]*)([\d,]+)(.*)$/);
  if (!m) return null;
  const n = parseInt(m[2].replace(/,/g, ""), 10);
  if (!Number.isFinite(n)) return null;
  return { prefix: m[1] ?? "", number: n, suffix: m[3] ?? "" };
}

function useCountUp(target: number, enabled: boolean, durationMs = 1500): number {
  const [value, setValue] = useState(enabled ? 0 : target);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!enabled) { setValue(target); return; }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
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
  const { content } = useCmsContent("home");
  const [editing, setEditing] = useState(false);
  const [animate, setAnimate] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
  }, []);

  if (isLoading || !data) return null;

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

  const partnerCount = data.partner_count ?? 0;
  const parsed = parseDisplayAmount(data.value_display);
  const targetAmount = parsed?.number ?? 0;
  const animatedAmount = useCountUp(targetAmount, animate);
  const animatedPartners = useCountUp(partnerCount, animate);

  const displayAmount = parsed
    ? `${parsed.prefix}${animatedAmount.toLocaleString("en-US")}${parsed.suffix}`
    : data.value_display;
  const displayPartners = String(animatedPartners);

  // Split headline on {amount} / {partners} so we can style the numbers.
  const rendered = headlineTemplate
    .replace("{amount}", `\u0001${displayAmount}\u0001`)
    .replace("{partners}", `\u0001${displayPartners}\u0001`);
  const parts = rendered.split("\u0001");

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
        page="home"
        sectionKey="donation_counter"
        title="Donation Counter"
        fields={COUNTER_FIELDS}
        currentContent={content["donation_counter"] ?? {}}
      />
    </section>
  );
}