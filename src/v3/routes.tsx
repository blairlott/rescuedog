import { lazy } from "react";
import { Route } from "react-router-dom";
import { V3_DROPSHIP_ENABLED } from "./flag";

const V3Landing = lazy(() => import("./pages/V3Landing"));
const V3Shop = lazy(() => import("./pages/V3Shop"));
const V3Merch = lazy(() => import("./pages/V3Merch"));
const V3Cart = lazy(() => import("./pages/V3Cart"));
const V3CheckoutSuccess = lazy(() => import("./pages/V3CheckoutSuccess"));
const V3AdminMigration = lazy(() => import("./pages/V3AdminMigration"));

export function v3Routes() {
  if (!V3_DROPSHIP_ENABLED) return null;
  return [
    <Route key="v3" path="/v3" element={<V3Landing />} />,
    <Route key="v3-shop" path="/v3/shop" element={<V3Shop />} />,
    <Route key="v3-merch" path="/v3/merch" element={<V3Merch />} />,
    <Route key="v3-cart" path="/v3/cart" element={<V3Cart />} />,
    <Route key="v3-success" path="/v3/checkout/success" element={<V3CheckoutSuccess />} />,
    <Route key="v3-mig" path="/v3/admin/migration" element={<V3AdminMigration />} />,
  ];
}