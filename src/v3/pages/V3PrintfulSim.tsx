import { Fragment, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * /v3/admin/printful-sim
 *
 * End-to-end Printful loop simulation. No real API keys required.
 *   1. Dispatch — fabricate a Printful order from a sample VS order id
 *   2. Ship    — fire a simulated `package_shipped` webhook with tracking
 *   3. Deliver — fire a simulated `order_updated` → delivered
 * Each step calls our edge functions in simulate=true mode so we can verify
 * the relay chain into the Vinoshipper tracking endpoint without writing to
 * real partner systems.
 */
export default function V3PrintfulSim() {
  const [vsOrderId, setVsOrderId] = useState("sim-vs-001");
  const [partnerOrderId, setPartnerOrderId] = useState<string>("");
  const [tracking, setTracking] = useState("1Z999AA10123456784");
  const [sku, setSku] = useState("RDW-HAT-RED");
  const [variantId, setVariantId] = useState("");
  const [productTemplateId, setProductTemplateId] = useState("");
  const [variantIdType, setVariantIdType] = useState<"auto" | "sync" | "external" | "catalog" | "template">("auto");
  const [log, setLog] = useState<string[]>([]);
  const [liveMode, setLiveMode] = useState(false);
  const [printfulStoreId, setPrintfulStoreId] = useState("");
  const [variants, setVariants] = useState<Array<{ sync_variant_id: number; external_id: string | null; sku: string | null; name?: string; store_id?: number }>>([]);
  const [templates, setTemplates] = useState<Array<{ id: number; title?: string; available_variant_ids?: number[]; mockup_file_url?: string }>>([]);
  const [mapDraft, setMapDraft] = useState<Record<number, { vs_product_id: string; title: string; saving?: boolean; saved?: boolean }>>({});
  const [vsProducts, setVsProducts] = useState<Array<{ id: string; sku: string; name: string; type?: string }>>([]);
  const [autoLinkLog, setAutoLinkLog] = useState<{ matched: number; missing: string[] } | null>(null);
  const PRINTFUL_PARTNER_ID = "70b93ed3-b26a-4ca0-b461-b1b0b44dd318";
  const simulate = !liveMode;

  const append = (label: string, payload: unknown) =>
    setLog((l) => [`[${new Date().toLocaleTimeString()}] ${label}\n${JSON.stringify(payload, null, 2)}`, ...l]);

  const listVariants = async () => {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const storeParam = printfulStoreId.trim() ? `&store_id=${encodeURIComponent(printfulStoreId.trim())}` : "";
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
    append("list_variants", data);
  };

  const listTemplates = async () => {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const url = `https://${projectId}.supabase.co/functions/v1/printful-dispatch?action=list_templates`;
    const { data: sess } = await supabase.auth.getSession();
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${sess.session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
    });
    const data = await res.json();
    setTemplates(data?.templates ?? []);
    append("list_templates", data);
  };

  const dispatch = async () => {
    const { data, error } = await supabase.functions.invoke("printful-dispatch", {
      body: {
        vs_order_id: vsOrderId,
        simulate,
        recipient: {
          name: "Test Rescue",
          address1: "1 Bone Lane",
          city: "Austin",
          state_code: "TX",
          country_code: "US",
          zip: "78701",
          email: "test@example.com",
        },
        ...(printfulStoreId.trim() ? { printful_store_id: printfulStoreId.trim() } : {}),
        items: [
          {
            sku,
            quantity: 1,
            variant_id_type: variantIdType,
            ...(variantId
              ? { variant_id: /^\d+$/.test(variantId) ? Number(variantId) : variantId }
              : {}),
            ...(productTemplateId.trim() ? { product_template_id: Number(productTemplateId.trim()) } : {}),
            ...(variantIdType === "catalog" ? { name: sku, retail_price: "0.01" } : {}),
          },
        ],
      },
    });
    if (error) return append("dispatch FAILED", error);
    setPartnerOrderId(data?.printful_order_id ?? "");
    append("dispatch", data);
  };

  const fireShipped = async () => {
    const { data, error } = await supabase.functions.invoke("printful-webhook", {
      body: {
        type: "package_shipped",
        simulate,
        data: {
          order: { id: partnerOrderId, external_id: `vs_${vsOrderId}` },
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
    append(error ? "shipped FAILED" : "package_shipped → VS relay", error ?? data);
  };

  const fireDelivered = async () => {
    const { data, error } = await supabase.functions.invoke("printful-webhook", {
      body: {
        type: "order_updated",
        simulate,
        data: { order: { id: partnerOrderId, external_id: `vs_${vsOrderId}`, status: "delivered" } },
      },
    });
    append(error ? "delivered FAILED" : "order_updated → delivered", error ?? data);
  };

  const saveMapping = async (v: { sync_variant_id: number; external_id: string | null; sku: string | null; name?: string }) => {
    const d = mapDraft[v.sync_variant_id];
    if (!d?.vs_product_id?.trim()) {
      append("mapping FAILED", { error: "Vinoshipper product id is required" });
      return;
    }
    setMapDraft((m) => ({ ...m, [v.sync_variant_id]: { ...d, saving: true } }));
    const row = {
      partner_id: PRINTFUL_PARTNER_ID,
      sku: v.external_id || v.sku || `pf-${v.sync_variant_id}`,
      partner_sku: v.sku,
      product_title: (d.title?.trim() || v.name || `Printful ${v.sync_variant_id}`).slice(0, 200),
      vinoshipper_product_id: d.vs_product_id.trim(),
      vendor_variant_id: String(v.sync_variant_id),
      fulfillment_mode: "printful" as const,
      is_active: true,
      cost_cents: 0,
      retail_cents: 0,
    };
    const { data, error } = await supabase.from("dropship_skus" as any).insert(row).select().single();
    setMapDraft((m) => ({ ...m, [v.sync_variant_id]: { ...d, saving: false, saved: !error } }));
    append(error ? "mapping FAILED" : "mapping saved", error ?? data);
  };

  const loadVsProducts = async () => {
    const { data, error } = await supabase.functions.invoke("vinoshipper-list-products", { body: {} });
    if (error) return append("vs list FAILED", error);
    setVsProducts(data?.products ?? []);
    append("vs products loaded", { count: data?.count, sample: (data?.products ?? []).slice(0, 3) });
  };

  const autoLinkBySku = async () => {
    if (vsProducts.length === 0) { await loadVsProducts(); }
    const list = vsProducts.length > 0 ? vsProducts : (await (async () => {
      const { data } = await supabase.functions.invoke("vinoshipper-list-products", { body: {} });
      return (data?.products ?? []) as typeof vsProducts;
    })());
    const bySku = new Map(list.map((p) => [p.sku.trim().toLowerCase(), p]));
    let matched = 0;
    const missing: string[] = [];
    for (const v of variants) {
      const keys = [v.sku, v.external_id].filter(Boolean).map((s) => String(s).trim().toLowerCase());
      const hit = keys.map((k) => bySku.get(k)).find(Boolean);
      if (!hit) {
        missing.push(`${v.sync_variant_id} (${v.sku ?? v.external_id ?? "no sku"})`);
        continue;
      }
      setMapDraft((m) => ({
        ...m,
        [v.sync_variant_id]: { vs_product_id: hit.id, title: hit.name || v.name || "", saving: true },
      }));
      const row = {
        partner_id: PRINTFUL_PARTNER_ID,
        sku: v.external_id || v.sku || `pf-${v.sync_variant_id}`,
        partner_sku: v.sku,
        product_title: (hit.name || v.name || `Printful ${v.sync_variant_id}`).slice(0, 200),
        vinoshipper_product_id: hit.id,
        vendor_variant_id: String(v.sync_variant_id),
        fulfillment_mode: "printful" as const,
        is_active: true,
        cost_cents: 0,
        retail_cents: 0,
      };
      const { error } = await supabase.from("dropship_skus" as any).insert(row);
      setMapDraft((m) => ({
        ...m,
        [v.sync_variant_id]: { vs_product_id: hit.id, title: hit.name || v.name || "", saving: false, saved: !error },
      }));
      if (!error) matched += 1;
    }
    setAutoLinkLog({ matched, missing });
    append("auto-link by SKU complete", { matched, missing_count: missing.length, missing });
  };

  return (
    <main className="mx-auto max-w-4xl p-8 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Printful — End-to-end simulation</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tests the full <code>VS order → printful-dispatch → partner ships → printful-webhook → VS tracking relay</code> loop
          using fabricated payloads. Safe to run repeatedly — no real Printful or Vinoshipper writes.
        </p>
      </header>

      <section className="border p-4 space-y-3">
        <h2 className="font-semibold">1. Inputs</h2>
        <label className="flex items-center gap-2 text-sm border p-2 bg-muted">
          <input
            type="checkbox"
            checked={liveMode}
            onChange={(e) => setLiveMode(e.target.checked)}
          />
          <span className="font-medium">
            LIVE MODE {liveMode ? "ON — real Printful API calls will be made" : "OFF (simulated)"}
          </span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            VS order id
            <input
              className="block w-full border px-2 py-1 mt-1"
              value={vsOrderId}
              onChange={(e) => setVsOrderId(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Tracking number
            <input
              className="block w-full border px-2 py-1 mt-1"
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
            />
          </label>
          <label className="text-sm">
            SKU
            <input
              className="block w-full border px-2 py-1 mt-1"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Printful variant id
            <input
              className="block w-full border px-2 py-1 mt-1"
              value={variantId}
              onChange={(e) => setVariantId(e.target.value)}
              placeholder="sync id, external id, or template catalog variant"
            />
          </label>
          <label className="text-sm">
            Product template id
            <input
              className="block w-full border px-2 py-1 mt-1"
              value={productTemplateId}
              onChange={(e) => setProductTemplateId(e.target.value)}
              placeholder="only for template orders"
            />
          </label>
          <label className="text-sm">
            ID type
            <select
              className="block w-full border px-2 py-1 mt-1 bg-background"
              value={variantIdType}
              onChange={(e) => setVariantIdType(e.target.value as typeof variantIdType)}
            >
              <option value="auto">Auto (lookup SKU in store)</option>
              <option value="sync">sync_variant_id (your store variant)</option>
              <option value="external">external_variant_id (your SKU/external id)</option>
              <option value="catalog">catalog variant_id (Printful catalog, no store)</option>
              <option value="template">product_template_id + catalog variant_id</option>
            </select>
          </label>
          <label className="text-sm">
            Printful store id
            <input
              className="block w-full border px-2 py-1 mt-1"
              value={printfulStoreId}
              onChange={(e) => setPrintfulStoreId(e.target.value)}
              placeholder="optional; auto-scans stores"
            />
          </label>
        </div>
        {partnerOrderId && (
          <p className="text-xs text-muted-foreground">
            Partner order id: <code>{partnerOrderId}</code>
          </p>
        )}
      </section>

      <section className="border p-4 space-y-3">
        <h2 className="font-semibold">2. Run steps in order</h2>
        <div className="flex gap-2 flex-wrap">
          <button onClick={listVariants} className="border px-3 py-2 text-sm">
            List my Printful variants
          </button>
          <button onClick={loadVsProducts} className="border px-3 py-2 text-sm">
            List Vinoshipper products
          </button>
          <button
            onClick={autoLinkBySku}
            disabled={variants.length === 0}
            className="bg-primary text-primary-foreground px-3 py-2 text-sm disabled:opacity-40"
          >
            Auto-link all by SKU
          </button>
          <button onClick={listTemplates} className="border px-3 py-2 text-sm">
            List product templates
          </button>
          <button onClick={dispatch} className="bg-primary text-primary-foreground px-3 py-2 text-sm">
            Dispatch to Printful
          </button>
          <button
            onClick={fireShipped}
            disabled={!partnerOrderId}
            className="bg-primary text-primary-foreground px-3 py-2 text-sm disabled:opacity-40"
          >
            Simulate package_shipped
          </button>
          <button
            onClick={fireDelivered}
            disabled={!partnerOrderId}
            className="bg-primary text-primary-foreground px-3 py-2 text-sm disabled:opacity-40"
          >
            Simulate delivered
          </button>
        </div>
        {autoLinkLog && (
          <div className="mt-3 border border-border p-3 text-xs space-y-1">
            <div>
              <strong>Auto-link result:</strong> {autoLinkLog.matched} mapped,{" "}
              {autoLinkLog.missing.length} unmatched
            </div>
            {autoLinkLog.missing.length > 0 && (
              <div className="text-muted-foreground">
                Unmatched Printful variants (no VS product with matching SKU):
                <ul className="list-disc pl-5 mt-1">
                  {autoLinkLog.missing.map((m) => <li key={m}>{m}</li>)}
                </ul>
                <p className="mt-2">
                  Fix: in Vinoshipper, create a non-wine product for each item and set its SKU to match the Printful SKU/external_id shown above, then re-run.
                </p>
              </div>
            )}
          </div>
        )}
        {vsProducts.length > 0 && (
          <div className="mt-3 border border-border max-h-64 overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="text-left p-2">VS product id</th>
                  <th className="text-left p-2">SKU</th>
                  <th className="text-left p-2">name</th>
                  <th className="text-left p-2">type</th>
                </tr>
              </thead>
              <tbody>
                {vsProducts.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="p-2 font-mono">{p.id}</td>
                    <td className="p-2 font-mono">{p.sku || "—"}</td>
                    <td className="p-2">{p.name || "—"}</td>
                    <td className="p-2">{p.type ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {variants.length > 0 && (
          <div className="mt-3 border border-border max-h-64 overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="text-left p-2">sync_variant_id</th>
                  <th className="text-left p-2">store_id</th>
                  <th className="text-left p-2">external_id</th>
                  <th className="text-left p-2">name</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => (
                  <Fragment key={v.sync_variant_id}>
                    <tr className="border-t border-border">
                      <td className="p-2 font-mono">{v.sync_variant_id}</td>
                      <td className="p-2 font-mono">{v.store_id ?? "—"}</td>
                      <td className="p-2 font-mono">{v.external_id ?? "—"}</td>
                      <td className="p-2">{v.name ?? v.sku ?? "—"}</td>
                      <td className="p-2 text-right whitespace-nowrap">
                        <button
                          className="underline mr-3"
                          onClick={() => {
                            setVariantId(String(v.sync_variant_id));
                            setVariantIdType("sync");
                            if (v.store_id) setPrintfulStoreId(String(v.store_id));
                          }}
                        >
                          use
                        </button>
                      </td>
                    </tr>
                    <tr className="border-t border-border bg-muted/30">
                      <td colSpan={5} className="p-2">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground">Map to VS →</span>
                          <input
                            className="border px-2 py-1 w-40"
                            placeholder="VS product id"
                            value={mapDraft[v.sync_variant_id]?.vs_product_id ?? ""}
                            onChange={(e) =>
                              setMapDraft((m) => ({
                                ...m,
                                [v.sync_variant_id]: { ...(m[v.sync_variant_id] ?? { vs_product_id: "", title: "" }), vs_product_id: e.target.value, saved: false },
                              }))
                            }
                          />
                          <input
                            className="border px-2 py-1 flex-1"
                            placeholder={`Title (default: ${v.name ?? v.sku ?? v.sync_variant_id})`}
                            value={mapDraft[v.sync_variant_id]?.title ?? ""}
                            onChange={(e) =>
                              setMapDraft((m) => ({
                                ...m,
                                [v.sync_variant_id]: { ...(m[v.sync_variant_id] ?? { vs_product_id: "", title: "" }), title: e.target.value, saved: false },
                              }))
                            }
                          />
                          <button
                            onClick={() => saveMapping(v)}
                            disabled={mapDraft[v.sync_variant_id]?.saving}
                            className="bg-primary text-primary-foreground px-3 py-1 disabled:opacity-40"
                          >
                            {mapDraft[v.sync_variant_id]?.saving ? "…" : mapDraft[v.sync_variant_id]?.saved ? "Saved ✓" : "Save mapping"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {templates.length > 0 && (
          <div className="mt-3 border border-border max-h-64 overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="text-left p-2">template_id</th>
                  <th className="text-left p-2">catalog variant_ids</th>
                  <th className="text-left p-2">title</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="p-2 font-mono">{t.id}</td>
                    <td className="p-2 font-mono">{t.available_variant_ids?.join(", ") ?? "—"}</td>
                    <td className="p-2">{t.title ?? "—"}</td>
                    <td className="p-2 text-right">
                      <button
                        className="underline"
                        onClick={() => {
                          setProductTemplateId(String(t.id));
                          setVariantId(String(t.available_variant_ids?.[0] ?? ""));
                          setVariantIdType("template");
                        }}
                      >
                        use
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="border p-4">
        <h2 className="font-semibold mb-2">3. Event log</h2>
        {log.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events yet. Hit Dispatch above.</p>
        ) : (
          <pre className="text-xs whitespace-pre-wrap max-h-[480px] overflow-auto bg-muted p-3">
            {log.join("\n\n———\n\n")}
          </pre>
        )}
      </section>
    </main>
  );
}