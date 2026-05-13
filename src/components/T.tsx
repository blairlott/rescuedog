import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";

/**
 * AI auto-translation with batching + in-memory cache.
 *
 * <T>Some English string</T>  → renders translated text when current lang !== "en".
 * useAutoT("text")            → returns translated string (or original while loading).
 *
 * Strings are batched in 250ms windows and cached forever in localStorage + Supabase.
 */

type Lang = string;

const memCache = new Map<string, string>(); // key = `${lang}::${text}`
const inFlight = new Map<string, Promise<string>>(); // key = same
const subscribers = new Map<string, Set<(v: string) => void>>(); // notify components when a value lands

let queue: { lang: Lang; text: string }[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const LS_PREFIX = "rdw_t_";

function readLS(lang: string, text: string): string | undefined {
  try {
    return localStorage.getItem(LS_PREFIX + lang + "::" + text) ?? undefined;
  } catch { return undefined; }
}
function writeLS(lang: string, text: string, val: string) {
  try { localStorage.setItem(LS_PREFIX + lang + "::" + text, val); } catch {}
}

function notify(key: string, value: string) {
  const subs = subscribers.get(key);
  if (subs) subs.forEach((fn) => fn(value));
}

async function flush() {
  flushTimer = null;
  const batch = queue;
  queue = [];
  if (batch.length === 0) return;

  // Group by language
  const byLang = new Map<Lang, Set<string>>();
  for (const { lang, text } of batch) {
    if (!byLang.has(lang)) byLang.set(lang, new Set());
    byLang.get(lang)!.add(text);
  }

  await Promise.all(Array.from(byLang.entries()).map(async ([lang, set]) => {
    const texts = Array.from(set);
    try {
      const { data, error } = await supabase.functions.invoke("translate", {
        body: { texts, target: lang },
      });
      if (error) throw error;
      const translations: Record<string, string> = data?.translations ?? {};
      for (const text of texts) {
        const out = translations[text] ?? text;
        const key = lang + "::" + text;
        memCache.set(key, out);
        writeLS(lang, text, out);
        inFlight.delete(key);
        notify(key, out);
      }
    } catch (e) {
      console.warn("[T] translate failed", e);
      // Fall back to original text so UI never stays blank/loading
      for (const text of texts) {
        const key = lang + "::" + text;
        memCache.set(key, text);
        inFlight.delete(key);
        notify(key, text);
      }
    }
  }));
}

function enqueue(lang: Lang, text: string): Promise<string> {
  const key = lang + "::" + text;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const p = new Promise<string>((resolve) => {
    const sub = (v: string) => { resolve(v); };
    if (!subscribers.has(key)) subscribers.set(key, new Set());
    subscribers.get(key)!.add(sub);
  });
  inFlight.set(key, p);
  queue.push({ lang, text });
  if (!flushTimer) flushTimer = setTimeout(flush, 250);
  return p;
}

export function useAutoT(text: string | null | undefined): string {
  const { i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || i18n.language || "en").slice(0, 2);
  const source = (text ?? "").toString();

  const initial = (() => {
    if (!source.trim() || lang === "en") return source;
    const key = lang + "::" + source;
    if (memCache.has(key)) return memCache.get(key)!;
    const ls = readLS(lang, source);
    if (ls) { memCache.set(key, ls); return ls; }
    return source;
  })();

  const [value, setValue] = useState(initial);

  useEffect(() => {
    if (!source.trim() || lang === "en") { setValue(source); return; }
    const key = lang + "::" + source;
    if (memCache.has(key)) { setValue(memCache.get(key)!); return; }
    const ls = readLS(lang, source);
    if (ls) { memCache.set(key, ls); setValue(ls); return; }

    setValue(source); // show original while loading
    const sub = (v: string) => setValue(v);
    if (!subscribers.has(key)) subscribers.set(key, new Set());
    subscribers.get(key)!.add(sub);
    enqueue(lang, source);
    return () => { subscribers.get(key)?.delete(sub); };
  }, [source, lang]);

  return value;
}

interface TProps {
  children: ReactNode;
  as?: keyof JSX.IntrinsicElements;
  className?: string;
}

export function T({ children, as, className }: TProps) {
  // Only translate plain string children; pass through anything else untouched.
  const text = typeof children === "string" ? children : Array.isArray(children) && children.every((c) => typeof c === "string") ? children.join("") : null;
  const translated = useAutoT(text ?? "");
  if (text == null) return <>{children}</>;
  if (as) {
    const Tag = as as any;
    return <Tag className={className}>{translated}</Tag>;
  }
  if (className) return <span className={className}>{translated}</span>;
  return <>{translated}</>;
}