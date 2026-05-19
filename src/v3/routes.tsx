import { lazy } from "react";
import { Route } from "react-router-dom";
import { V3_DROPSHIP_ENABLED } from "./flag";
import { PreviewPasswordGate } from "@/components/PreviewPasswordGate";

const V3Landing = lazy(() => import("./pages/V3Landing"));
const V3Shop = lazy(() => import("./pages/V3Shop"));
const V3Merch = lazy(() => import("./pages/V3Merch"));
const V3Cart = lazy(() => import("./pages/V3Cart"));
const V3CheckoutSuccess = lazy(() => import("./pages/V3CheckoutSuccess"));
const V3AdminMigration = lazy(() => import("./pages/V3AdminMigration"));
const V3PrintfulSim = lazy(() => import("./pages/V3PrintfulSim"));
const V3PrintfulMappings = lazy(() => import("./pages/V3PrintfulMappings"));
const V3PartnersRedirect = lazy(() => import("./pages/V3PartnersRedirect"));
const V3VsLiveTest = lazy(() => import("./pages/V3VsLiveTest"));

const gate = (node: React.ReactNode) => <PreviewPasswordGate>{node}</PreviewPasswordGate>;

export function v3Routes() {
  if (!V3_DROPSHIP_ENABLED) return null;
  return [
    <Route key="v3" path="/v3" element={gate(<V3Landing />)} />,
    <Route key="v3-shop" path="/v3/shop" element={gate(<V3Shop />)} />,
    <Route key="v3-merch" path="/v3/merch" element={gate(<V3Merch />)} />,
    <Route key="v3-cart" path="/v3/cart" element={gate(<V3Cart />)} />,
    <Route key="v3-success" path="/v3/checkout/success" element={gate(<V3CheckoutSuccess />)} />,
    <Route key="v3-mig" path="/v3/admin/migration" element={gate(<V3AdminMigration />)} />,
    <Route key="v3-pf-sim" path="/v3/admin/printful-sim" element={gate(<V3PrintfulSim />)} />,
    <Route key="v3-pf-map" path="/v3/admin/printful-sim/mappings" element={gate(<V3PrintfulMappings />)} />,
    <Route key="v3-partners" path="/v3/admin/partners" element={gate(<V3PartnersRedirect />)} />,
    <Route key="v3-vs-live" path="/v3/admin/vs-live-test" element={gate(<V3VsLiveTest />)} />,
  ];
}