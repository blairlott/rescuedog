import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * /v3/admin/printful-sim/mappings
 *
 * Focused VS productId ↔ Printful sync_variant_id mapping editor.
 * No dispatch/ship/deliver controls — just the table that ops needs.
 * Saves are idempotent (upsert on dropship_skus.sku) and existing
 * rows are loaded on mount so the table reflects current state.
 */

const PRINTFUL_PARTNER_ID = "70b93ed3-b26a-4ca0-b461-b1b0b44dd318";

type Variant = {
  sync_variant_id: number;
  external_id: string | null;
  sku: string | null;
  name?: string;
  store_id?: number;
};
type VsProduct = { id: string; sku: string; name: string; type?: string };
type ExistingMapping = {
  id: string;
  sku: string;
  partner_sku: string | null;
  vendor_variant_id: string | null;
  vinoshipper_product_id: string | null;
  product_title: string | null;
  is_active: boolean;
};
type DraftEntry = { vs_product_id: string; title: string; saving?: boolean; saved?: boolean; error?: string };

export default function V3PrintfulMappings() {
  const [variants, setVariants] = useState<Variant[]>([]);
  const [vsProducts, setVsProducts] = useState<VsProduct[]>([]);
  const [existing, setExisting] = useState<ExistingMapping[]>([]);
  const [drafts, setDrafts] = useState<Record<number, DraftEntry>>({});
  const [storeId, setStoreId] = useState("");
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [loadingVs, setLoadingVs] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [autoStatus, setAutoStatus] = useState<{ matched: number; missing: string[] } | null>(null);
  const [filter, setFilter] = useState<"all" | "mapped" | "unmapped">("all");
  const [testRun, setTestRun] = useState<{
    running: boolean;
    log: Array<{ step: string; ok: boolean; detail: unknown }>;
    vsOrderId?: string;
    printfulOrderId?: string;
  }>({ running: false, log: [] });

  const existingByVendorVariant = useMemo(() => {
    const m = new Map<string, ExistingMapping>();
    for (const e of existing) if (e.vendor_variant_id) m.set(e.vendor_variant_id, e);
    return m;
  }, [existing]);

  const loadExisting = async () => {
    setLoadingExisting(true);
    const { data } = await supabase
      .from("dropship_skus" as any)
      .select("id,sku,partner_sku,vendor_variant_id,vinoshipper_product_id,product_title,is_active")
      .eq("partner_id", PRINTFUL_PARTNER_ID)
      .eq("fulfillment_mode", "printful");
    setExisting((data ?? []) as unknown as ExistingMapping[]);
    setLoadingExisting(false);
  };

  useEffect(() => { loadExisting(); }, []);

  // Seed drafts from existing rows when both variants + existing are loaded.
  useEffect(() => {
    if (variants.length === 0 || existing.length === 0) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const v of variants) {
        const e = existingByVendorVariant.get(String(v.sync_variant_id));
        if (e && !next[v.sync_variant_id]) {
          next[v.sync_variant_id] = {
            vs_product_id: e.vinoshipper_product_id ?? "",
            title: e.product_title ?? v.name ?? "",
            saved: true,
          };
        }
      }
      return next;
    });
  }, [variants, existing, existingByVendorVariant]);

  const listVariants = async () => {
    setLoadingVariants(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const storeParam = storeId.trim() ? `&store_id=${encodeURIComponent(storeId.trim())}` : "";
      const url = `https://${projectId}.supabase.co/functions/v1/printful-dispatch?action=list_variants${storeParam}`;
      const { data: sess } = await supabase.auth.getSession();
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${sess.session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      const data = await res.json();
      setVariants(data?.variants ?? []);
    } finally {
      setLoadingVariants(false);
    }
  };

  const loadVsProducts = async () => {
    setLoadingVs(true);
    try {
      const { data } = await supabase.functions.invoke("vinoshipper-list-products", { body: {} });
      setVsProducts((data?.products ?? []) as VsProduct[]);
    } finally {
      setLoadingVs(false);
    }
  };

  const buildRow = (v: Variant, vsProductId: string, title: string) => ({
    partner_id: PRINTFUL_PARTNER_ID,
    sku: v.external_id || v.sku || `pf-${v.sync_variant_id}`,
    partner_sku: v.sku,
    product_title: (title?.trim() || v.name || `Printful ${v.sync_variant_id}`).slice(0, 200),
    vinoshipper_product_id: vsProductId.trim(),
    vendor_variant_id: String(v.sync_variant_id),
    fulfillment_mode: "printful" as const,
    is_active: true,
    cost_cents: 0,
    retail_cents: 0,
  });

  const saveOne = async (v: Variant) => {
    const d = drafts[v.sync_variant_id];
    if (!d?.vs_product_id?.trim()) {
      setDrafts((m) => ({ ...m, [v.sync_variant_id]: { ...(d ?? { vs_product_id: "", title: "" }), error: "VS product id is required" } }));
      return;
    }
    setDrafts((m) => ({ ...m, [v.sync_variant_id]: { ...d, saving: true, error: undefined } }));
    const { error } = await supabase
      .from("dropship_skus" as any)
      .upsert(buildRow(v, d.vs_product_id, d.title), { onConflict: "sku" });
    setDrafts((m) => ({ ...m, [v.sync_variant_id]: { ...d, saving: false, saved: !error, error: error?.message } }));
    if (!error) loadExisting();
  };

  const removeOne = async (v: Variant) => {
    const e = existingByVendorVariant.get(String(v.sync_variant_id));
    if (!e) return;
    if (!confirm(`Remove mapping for ${v.sku || v.external_id || v.sync_variant_id}?`)) return;
    const { error } = await supabase.from("dropship_skus" as any).delete().eq("id", e.id);
    if (!error) {
      setDrafts((m) => {
        const next = { ...m };
        delete next[v.sync_variant_id];
        return next;
      });
      loadExisting();
    }
  };

  const autoLinkBySku = async () => {
    if (vsProducts.length === 0) await loadVsProducts();
    const list = vsProducts.length > 0 ? vsProducts : (await supabase.functions.invoke("vinoshipper-list-products", { body: {} })).data?.products ?? [];
    const bySku = new Map((list as VsProduct[]).map((p) => [p.sku.trim().toLowerCase(), p]));
    let matched = 0;
    const missing: string[] = [];
    for (const v of variants) {
      const keys = [v.sku, v.external_id].filter(Boolean).map((s) => String(s).trim().toLowerCase());
      const hit = keys.map((k) => bySku.get(k)).find(Boolean);
      if (!hit) {
        missing.push(`${v.sync_variant_id} (${v.sku ?? v.external_id ?? "no sku"})`);
        continue;
      }
      setDrafts((m) => ({
        ...m,
        [v.sync_variant_id]: { vs_product_id: hit.id, title: hit.name || v.name || "", saving: true },
      }));
      const { error } = await supabase
        .from("dropship_skus" as any)
        .upsert(buildRow(v, hit.id, hit.name || v.name || ""), { onConflict: "sku" });
      setDrafts((m) => ({
        ...m,
        [v.sync_variant_id]: { vs_product_id: hit.id, title: hit.name || v.name || "", saving: false, saved: !error, error: error?.message },
      }));
      if (!error) matched += 1;
    }
    setAutoStatus({ matched, missing });
    loadExisting();
  };

  const createTestOrder = async () => {
    setTestRun({ running: true, log: [] });
    const pushStep = (step: string, ok: boolean, detail: unknown) =>
      setTestRun((s) => ({ ...s, log: [...s.log, { step, ok, detail }] }));

    // 1. Pick a mapped Printful row (must have vendor_variant_id + vs product id).
    const usable = existing.find(
      (e) => e.is_active && e.vendor_variant_id && e.vinoshipper_product_id,
    );
    if (!usable) {
      pushStep("pick mapped Printful sku", false, {
        error: "No usable Printful mapping. Save at least one variant with a VS productId first.",
      });
      setTestRun((s) => ({ ...s, running: false }));
      return;
    }
    pushStep("pick mapped Printful sku", true, {
      sku: usable.sku,
      sync_variant_id: usable.vendor_variant_id,
      vs_product_id: usable.vinoshipper_product_id,
    });

    // 2. Pick a wine row for context (informational — Printful won't ship it).
    const { data: wine } = await supabase
      .from("wine_products")
      .select("id, name, vinoshipper_product_id")
      .not("vinoshipper_product_id", "is", null)
      .limit(1)
      .maybeSingle();
    pushStep("pick context wine", true, wine ?? { note: "no wine_products row found — merch-only test" });

    // 3. Synthesize a VS order id (unique so dispatch insert doesn't collide).
    const vsOrderId = `sim-vs-${Date.now()}`;
    setTestRun((s) => ({ ...s, vsOrderId }));

    // 4. Dispatch to Printful (simulated).
    const dispatchBody = {
      vs_order_id: vsOrderId,
      simulate: true,
      recipient: {
        name: "Test Rescue Dog",
        address1: "1 Bone Lane",
        city: "Austin",
        state_code: "TX",
        country_code: "US",
        zip: "78701",
        email: "test+printful@rescuedogwines.com",
      },
      items: [{
        sku: usable.sku,
        variant_id: /^\d+$/.test(usable.vendor_variant_id!) ? Number(usable.vendor_variant_id) : usable.vendor_variant_id,
        variant_id_type: "sync" as const,
        name: usable.product_title ?? usable.sku,
        quantity: 1,
      }],
    };
    const { data: dispatch, error: dErr } = await supabase.functions.invoke("printful-dispatch", { body: dispatchBody });
    if (dErr || !dispatch?.ok) {
      pushStep("dispatch → Printful (simulated)", false, dErr ?? dispatch);
      setTestRun((s) => ({ ...s, running: false }));
      return;
    }
    const printfulOrderId = dispatch.printful_order_id as string;
    setTestRun((s) => ({ ...s, printfulOrderId }));
    pushStep("dispatch → Printful (simulated)", true, { printful_order_id: printfulOrderId, wine_in_order: !!wine });

    // 5. Fire package_shipped webhook (simulated VS tracking relay).
    const tracking = `TEST${Date.now()}`;
    const { data: shipped, error: sErr } = await supabase.functions.invoke("printful-webhook", {
      body: {
        type: "package_shipped",
        simulate: true,
        data: {
          order: { id: printfulOrderId, external_id: `vs_${vsOrderId}` },
          shipment: {
            carrier: "USPS",
            service: "Ground Advantage",
            tracking_number: tracking,
            tracking_url: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${tracking}`,
            ship_date: new Date().toISOString(),
          },
        },
      },
    });
    pushStep("webhook → package_shipped → VS relay", !sErr && shipped?.ok, sErr ?? shipped);

    // 6. Fire delivered.
    const { data: delivered, error: delErr } = await supabase.functions.invoke("printful-webhook", {
      body: {
        type: "order_updated",
        simulate: true,
        data: { order: { id: printfulOrderId, external_id: `vs_${vsOrderId}`, status: "delivered" } },
      },
    });
    pushStep("webhook → delivered", !delErr && delivered?.ok, delErr ?? delivered);

    setTestRun((s) => ({ ...s, running: false }));
  };

  const visible = variants.filter((v) => {
    if (filter === "all") return true;
    const hasMap = existingByVendorVariant.has(String(v.sync_variant_id));
    return filter === "mapped" ? hasMap : !hasMap;
  });

  const mappedCount = variants.filter((v) => existingByVendorVariant.has(String(v.sync_variant_id))).length;
  const hasUsableMapping = existing.some((e) => e.is_active && e.vendor_variant_id && e.vinoshipper_product_id);

  return (
    <main className="mx-auto max-w-6xl p-8 space-y-6">
      <header className="space-y-2">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-bold">Printful Premium — Variant Mappings</h1>
          <Link to="/v3/admin/printful-sim" className="text-sm underline text-muted-foreground">
            ← Back to full simulator
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          Maps each Printful <code>sync_variant_id</code> to a Vinoshipper <code>productId</code>.
          Required for any merch item to clear checkout and dispatch. Saves are idempotent.
        </p>
      </header>

      <section className="border p-4 space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <label className="text-sm col-span-1">
            Printful store id (optional)
            <input
              className="block w-full border px-2 py-1 mt-1"
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              placeholder="auto-scans all stores"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={listVariants} disabled={loadingVariants} className="border px-3 py-2 text-sm disabled:opacity-40">
            {loadingVariants ? "Loading…" : "Load Printful variants"}
          </button>
          <button onClick={loadVsProducts} disabled={loadingVs} className="border px-3 py-2 text-sm disabled:opacity-40">
            {loadingVs ? "Loading…" : "Load Vinoshipper products"}
          </button>
          <button
            onClick={autoLinkBySku}
            disabled={variants.length === 0}
            className="bg-primary text-primary-foreground px-3 py-2 text-sm disabled:opacity-40"
          >
            Auto-link all by SKU
          </button>
          <button onClick={loadExisting} className="border px-3 py-2 text-sm">
            Refresh saved mappings
          </button>
        </div>
        {autoStatus && (
          <div className="border border-border p-3 text-xs">
            <strong>Auto-link:</strong> {autoStatus.matched} saved, {autoStatus.missing.length} unmatched
            {autoStatus.missing.length > 0 && (
              <ul className="list-disc pl-5 mt-2 text-muted-foreground">
                {autoStatus.missing.map((m) => <li key={m}>{m}</li>)}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="border p-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-sm">End-to-end Printful test order</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Picks the first usable Printful mapping plus a context wine product, then runs
              <code> dispatch → package_shipped → delivered </code>
              against simulated VS payloads. Safe to run repeatedly. No real Printful or Vinoshipper writes.
            </p>
          </div>
          <button
            onClick={createTestOrder}
            disabled={testRun.running || !hasUsableMapping}
            className="bg-primary text-primary-foreground px-3 py-2 text-sm disabled:opacity-40 whitespace-nowrap"
            title={!hasUsableMapping ? "Save at least one mapping first" : "Run the full dispatch loop"}
          >
            {testRun.running ? "Running…" : "Create test order"}
          </button>
        </div>
        {testRun.log.length > 0 && (
          <div className="border border-border bg-muted/30 p-3 text-xs space-y-2">
            {testRun.vsOrderId && (
              <div className="font-mono">
                vs_order_id: <strong>{testRun.vsOrderId}</strong>
                {testRun.printfulOrderId && <> · printful_order_id: <strong>{testRun.printfulOrderId}</strong></>}
              </div>
            )}
            <ol className="space-y-2">
              {testRun.log.map((s, i) => (
                <li key={i} className="border-l-2 pl-2" style={{ borderColor: s.ok ? "rgb(34 197 94)" : "rgb(239 68 68)" }}>
                  <div className="font-medium">{s.ok ? "✓" : "✗"} {s.step}</div>
                  <pre className="mt-1 text-[10px] whitespace-pre-wrap break-words text-muted-foreground">
                    {JSON.stringify(s.detail, null, 2)}
                  </pre>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>

      <section className="border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm">
            {loadingExisting ? "Loading saved mappings…" : (
              <>
                <strong>{existing.length}</strong> saved Printful mapping{existing.length === 1 ? "" : "s"}
                {variants.length > 0 && <> · <strong>{mappedCount}</strong> of {variants.length} loaded variants mapped</>}
              </>
            )}
          </div>
          <div className="flex gap-1 text-xs">
            {(["all", "mapped", "unmapped"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`border px-2 py-1 ${filter === f ? "bg-foreground text-background" : ""}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {variants.length === 0 ? (
          <p className="text-sm text-muted-foreground">Load Printful variants to begin editing mappings.</p>
        ) : (
          <div className="border border-border max-h-[600px] overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="text-left p-2">sync_variant_id</th>
                  <th className="text-left p-2">SKU / external_id</th>
                  <th className="text-left p-2">Name</th>
                  <th className="text-left p-2">VS productId</th>
                  <th className="text-left p-2">Title</th>
                  <th className="text-left p-2 w-[180px]">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((v) => {
                  const d = drafts[v.sync_variant_id] ?? { vs_product_id: "", title: "" };
                  const isMapped = existingByVendorVariant.has(String(v.sync_variant_id));
                  return (
                    <tr key={v.sync_variant_id} className="border-t border-border align-top">
                      <td className="p-2 font-mono">{v.sync_variant_id}</td>
                      <td className="p-2 font-mono">{v.sku || v.external_id || "—"}</td>
                      <td className="p-2">{v.name || "—"}</td>
                      <td className="p-2">
                        <input
                          className="w-full border px-2 py-1"
                          value={d.vs_product_id}
                          onChange={(e) => setDrafts((m) => ({
                            ...m,
                            [v.sync_variant_id]: { ...d, vs_product_id: e.target.value, saved: false, error: undefined },
                          }))}
                          placeholder="VS productId"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          className="w-full border px-2 py-1"
                          value={d.title}
                          onChange={(e) => setDrafts((m) => ({
                            ...m,
                            [v.sync_variant_id]: { ...d, title: e.target.value, saved: false },
                          }))}
                          placeholder={v.name || "Product title"}
                        />
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        <button
                          onClick={() => saveOne(v)}
                          disabled={d.saving}
                          className="bg-primary text-primary-foreground px-2 py-1 mr-1 disabled:opacity-40"
                        >
                          {d.saving ? "…" : isMapped ? "Update" : "Save"}
                        </button>
                        {isMapped && (
                          <button onClick={() => removeOne(v)} className="border px-2 py-1 text-destructive">
                            Remove
                          </button>
                        )}
                        {d.saved && <span className="text-green-600 ml-2">✓</span>}
                        {d.error && <div className="text-destructive mt-1">{d.error}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {vsProducts.length > 0 && (
        <section className="border p-4">
          <details>
            <summary className="text-sm font-semibold cursor-pointer">
              VS product reference ({vsProducts.length})
            </summary>
            <div className="mt-3 max-h-64 overflow-auto border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left p-2">productId</th>
                    <th className="text-left p-2">SKU</th>
                    <th className="text-left p-2">Name</th>
                  </tr>
                </thead>
                <tbody>
                  {vsProducts.map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="p-2 font-mono">{p.id}</td>
                      <td className="p-2 font-mono">{p.sku || "—"}</td>
                      <td className="p-2">{p.name || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      )}
    </main>
  );
}