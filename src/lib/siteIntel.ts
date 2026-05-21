/**
 * Site Intelligence tracker — heatmaps, scroll, rage clicks, attention.
 *
 * Batches events client-side and flushes via direct table insert (RLS allows
 * anonymous insert into `site_intel_events`). Cheap, no edge function hop.
 */
import { supabase } from "@/integrations/supabase/client";
import { getVisitorId } from "./visitorId";

type EventType =
  | "click"
  | "mousemove"
  | "scroll"
  | "rage_click"
  | "section_view"
  | "page_attention"
  | "exposure"
  | "conversion";

interface QueuedEvent {
  visitor_id: string;
  session_id: string;
  event_type: EventType;
  path: string;
  selector?: string | null;
  section_key?: string | null;
  x_pct?: number | null;
  y_pct?: number | null;
  vw?: number | null;
  vh?: number | null;
  scroll_pct?: number | null;
  dwell_ms?: number | null;
  device?: string | null;
  referrer?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  metadata?: Record<string, unknown>;
}

const SESSION_KEY = "rdw_intel_session";
const MAX_QUEUE = 60;
const FLUSH_MS = 8000;

let started = false;
let queue: QueuedEvent[] = [];
let flushTimer: number | null = null;
let mouseSampleTimer: number | null = null;
let lastClickAt = 0;
let rageBucket: { t: number; x: number; y: number; sel: string }[] = [];
let lastScrollPct = 0;
let pageEnteredAt = Date.now();

function getSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = `s_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return `s_${Date.now()}`;
  }
}

function getDevice(): string {
  const w = window.innerWidth;
  if (w < 640) return "mobile";
  if (w < 1024) return "tablet";
  return "desktop";
}

function utm(): Pick<QueuedEvent, "utm_source" | "utm_medium" | "utm_campaign"> {
  try {
    const p = new URLSearchParams(window.location.search);
    return {
      utm_source: p.get("utm_source") || sessionStorage.getItem("utm_source"),
      utm_medium: p.get("utm_medium") || sessionStorage.getItem("utm_medium"),
      utm_campaign: p.get("utm_campaign") || sessionStorage.getItem("utm_campaign"),
    };
  } catch {
    return {};
  }
}

function describeElement(el: Element | null): { selector: string; section: string | null } {
  if (!el) return { selector: "", section: null };
  // Walk up to nearest data-section or section element
  let section: string | null = null;
  let cur: Element | null = el;
  while (cur && cur !== document.body) {
    const s = (cur as HTMLElement).dataset?.section;
    if (s) { section = s; break; }
    if (cur.tagName === "SECTION") {
      section = (cur as HTMLElement).id || cur.getAttribute("aria-label") || "section";
      break;
    }
    cur = cur.parentElement;
  }
  // Compact selector: tag#id.cls (truncated)
  const id = (el as HTMLElement).id ? `#${(el as HTMLElement).id}` : "";
  const cls = (el as HTMLElement).classList
    ? Array.from((el as HTMLElement).classList).slice(0, 2).map((c) => `.${c}`).join("")
    : "";
  const txt = (el as HTMLElement).innerText?.slice(0, 24).replace(/\s+/g, " ").trim();
  return {
    selector: `${el.tagName.toLowerCase()}${id}${cls}${txt ? `[${txt}]` : ""}`,
    section,
  };
}

function enqueue(ev: Partial<QueuedEvent> & { event_type: EventType }) {
  if (typeof window === "undefined") return;
  // Do not track admin/CRM/CMS/kennel routes
  const path = window.location.pathname;
  if (/^\/(crm|cms|kennel|admin|account)/.test(path)) return;

  const base: QueuedEvent = {
    visitor_id: getVisitorId(),
    session_id: getSessionId(),
    event_type: ev.event_type,
    path,
    vw: window.innerWidth,
    vh: window.innerHeight,
    device: getDevice(),
    referrer: document.referrer || null,
    ...utm(),
    ...ev,
  };
  queue.push(base);
  if (queue.length >= MAX_QUEUE) flush();
}

async function flush() {
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  try {
    await supabase.from("site_intel_events" as any).insert(batch);
  } catch {
    // best-effort; drop on failure rather than blocking UX
  }
}

function onClick(e: MouseEvent) {
  const target = e.target as Element | null;
  const { selector, section } = describeElement(target);
  const x_pct = e.clientX / window.innerWidth;
  const y_pct = e.clientY / window.innerHeight;

  // Rage detection: 3+ clicks within 1s on near-identical region (<60px)
  const now = Date.now();
  rageBucket = rageBucket.filter((c) => now - c.t < 1000);
  rageBucket.push({ t: now, x: e.clientX, y: e.clientY, sel: selector });
  const near = rageBucket.filter(
    (c) => Math.hypot(c.x - e.clientX, c.y - e.clientY) < 60,
  );
  if (near.length >= 3) {
    enqueue({
      event_type: "rage_click",
      x_pct, y_pct, selector, section_key: section,
    });
    rageBucket = [];
  }
  enqueue({ event_type: "click", x_pct, y_pct, selector, section_key: section });
  lastClickAt = now;
}

let lastMouseX = 0, lastMouseY = 0;
function onMouseMove(e: MouseEvent) { lastMouseX = e.clientX; lastMouseY = e.clientY; }

function sampleMouse() {
  if (document.hidden) return;
  if (lastMouseX === 0 && lastMouseY === 0) return;
  enqueue({
    event_type: "mousemove",
    x_pct: lastMouseX / window.innerWidth,
    y_pct: lastMouseY / window.innerHeight,
  });
}

function onScroll() {
  const h = document.documentElement.scrollHeight - window.innerHeight;
  if (h <= 0) return;
  const pct = Math.max(0, Math.min(1, window.scrollY / h));
  // Only log on threshold crossings (25/50/75/100) to keep volume sane.
  const thresholds = [0.25, 0.5, 0.75, 1.0];
  for (const t of thresholds) {
    if (lastScrollPct < t && pct >= t) {
      enqueue({ event_type: "scroll", scroll_pct: t });
    }
  }
  lastScrollPct = pct;
}

function setupSectionObserver() {
  const seen = new WeakSet<Element>();
  const dwellMap = new Map<Element, number>();
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const el = e.target;
        const section = (el as HTMLElement).dataset?.section
          || (el as HTMLElement).id
          || el.getAttribute("aria-label")
          || "section";
        if (e.isIntersecting) {
          if (!seen.has(el)) {
            seen.add(el);
            enqueue({ event_type: "section_view", section_key: section });
          }
          dwellMap.set(el, Date.now());
        } else if (dwellMap.has(el)) {
          const dwell = Date.now() - (dwellMap.get(el) ?? Date.now());
          dwellMap.delete(el);
          if (dwell > 500) {
            enqueue({ event_type: "page_attention", section_key: section, dwell_ms: dwell });
          }
        }
      }
    },
    { threshold: 0.4 },
  );
  const scan = () => {
    document.querySelectorAll("section, [data-section]").forEach((el) => io.observe(el));
  };
  scan();
  // Re-scan after route changes (handled by trackPage)
  return { rescan: scan, disconnect: () => io.disconnect() };
}

let observer: ReturnType<typeof setupSectionObserver> | null = null;

export function trackPage(path: string) {
  if (!started) return;
  pageEnteredAt = Date.now();
  lastScrollPct = 0;
  // Re-scan sections on SPA route change
  setTimeout(() => observer?.rescan(), 200);
}

export function startSiteIntel() {
  if (started || typeof window === "undefined") return;
  started = true;
  pageEnteredAt = Date.now();

  window.addEventListener("click", onClick, { capture: true, passive: true });
  window.addEventListener("mousemove", onMouseMove, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("beforeunload", () => {
    const dwell = Date.now() - pageEnteredAt;
    enqueue({ event_type: "page_attention", dwell_ms: dwell });
    flush();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) flush();
  });

  mouseSampleTimer = window.setInterval(sampleMouse, 2000) as unknown as number;
  flushTimer = window.setInterval(flush, FLUSH_MS) as unknown as number;
  observer = setupSectionObserver();
}

export function stopSiteIntel() {
  if (!started) return;
  started = false;
  if (flushTimer) clearInterval(flushTimer);
  if (mouseSampleTimer) clearInterval(mouseSampleTimer);
  observer?.disconnect();
  flush();
}