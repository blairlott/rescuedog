import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * DOM-level auto-translator. On non-English language, walks visible text
 * nodes, batches them to the `translate` edge function (AI + DB cache), and
 * swaps text in place. Keeps an in-memory map so re-renders & route changes
 * stay translated. Re-runs on route change and on DOM mutations (debounced).
 *
 * Brand-safe: skips brand/product names by leaving short ALL-CAPS tokens
 * untouched on the server (the prompt preserves them) and skips elements
 * marked `data-no-translate`, plus inputs/textareas/code/script/style.
 */

const SKIP_TAGS = new Set([
  "SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE", "TEXTAREA", "INPUT",
  "SELECT", "OPTION", "SVG", "PATH", "CANVAS", "IFRAME",
]);

function shouldSkip(el: Element | null): boolean {
  let cur: Element | null = el;
  while (cur) {
    if (SKIP_TAGS.has(cur.tagName)) return true;
    if ((cur as HTMLElement).dataset?.noTranslate === "true") return true;
    if (cur.getAttribute?.("translate") === "no") return true;
    cur = cur.parentElement;
  }
  return false;
}

function collectTextNodes(root: Node): Text[] {
  const out: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const t = node.nodeValue?.trim();
      if (!t || t.length < 2) return NodeFilter.FILTER_REJECT;
      // Skip pure numbers / prices / dates
      if (/^[\s\d.,$€£¥%:/+\-—–·•|()]+$/.test(t)) return NodeFilter.FILTER_REJECT;
      if (shouldSkip(node.parentElement)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n: Node | null;
  while ((n = walker.nextNode())) out.push(n as Text);
  return out;
}

export function AutoTranslator() {
  const { i18n } = useTranslation();
  const location = useLocation();
  const lang = (i18n.resolvedLanguage || i18n.language || "en").slice(0, 2);
  const cacheRef = useRef<Map<string, string>>(new Map());
  const originalRef = useRef<WeakMap<Text, string>>(new WeakMap());
  const inflightRef = useRef<Set<string>>(new Set());
  const debounceRef = useRef<number | null>(null);

  // Reset cache when language changes
  useEffect(() => {
    cacheRef.current = new Map();
    inflightRef.current = new Set();
  }, [lang]);

  useEffect(() => {
    if (lang === "en") {
      // Restore originals
      const all = collectTextNodes(document.body);
      all.forEach((n) => {
        const orig = originalRef.current.get(n);
        if (orig && n.nodeValue !== orig) n.nodeValue = orig;
      });
      return;
    }

    let cancelled = false;

    const run = async () => {
      const nodes = collectTextNodes(document.body);
      if (nodes.length === 0) return;

      // Store originals and collect strings needing translation
      const needed = new Set<string>();
      const pending: Array<{ node: Text; original: string }> = [];
      for (const node of nodes) {
        let original = originalRef.current.get(node);
        if (!original) {
          original = node.nodeValue?.trim() ?? "";
          if (!original) continue;
          originalRef.current.set(node, original);
        }
        const cached = cacheRef.current.get(original);
        if (cached) {
          if (node.nodeValue?.trim() !== cached) {
            node.nodeValue = (node.nodeValue ?? "").replace(original, cached);
          }
        } else if (!inflightRef.current.has(original)) {
          needed.add(original);
          pending.push({ node, original });
        }
      }

      if (needed.size === 0) return;
      const batch = Array.from(needed).slice(0, 80);
      batch.forEach((t) => inflightRef.current.add(t));

      try {
        const { data, error } = await supabase.functions.invoke("translate", {
          body: { texts: batch, target: lang },
        });
        if (cancelled || error) return;
        const translations: Record<string, string> = data?.translations ?? {};
        for (const [src, dst] of Object.entries(translations)) {
          cacheRef.current.set(src, dst);
        }
        // Apply
        for (const { node, original } of pending) {
          const dst = cacheRef.current.get(original);
          if (dst && node.nodeValue) {
            node.nodeValue = node.nodeValue.replace(original, dst);
          }
        }
      } catch (e) {
        // Silent failure — leave English
        console.warn("AutoTranslator failed", e);
      } finally {
        batch.forEach((t) => inflightRef.current.delete(t));
      }
    };

    const schedule = () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(run, 250);
    };

    schedule();

    const observer = new MutationObserver(() => schedule());
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      cancelled = true;
      observer.disconnect();
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [lang, location.pathname]);

  return null;
}

export default AutoTranslator;