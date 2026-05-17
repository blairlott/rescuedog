import { lazy } from "react";
import { Route } from "react-router-dom";
import { V2_STORE_ENABLED } from "./flag";

const V2Landing = lazy(() => import("./pages/V2Landing"));
const V2Shop = lazy(() => import("./pages/V2Shop"));
const V2Cart = lazy(() => import("./pages/V2Cart"));
const V2CheckoutVerify = lazy(() => import("./pages/V2CheckoutVerify"));
const V2CheckoutSuccess = lazy(() => import("./pages/V2CheckoutSuccess"));

/**
 * Returns the `/v2/*` route subtree when the flag is on, otherwise nothing
 * (the wildcard `*` route in App.tsx will 404 the path). Kept as an array
 * so App.tsx can spread it into its <Routes>.
 */
export function v2Routes() {
  if (!V2_STORE_ENABLED) return null;
  return [
    <Route key="v2" path="/v2" element={<V2Landing />} />,
    <Route key="v2-shop" path="/v2/shop" element={<V2Shop />} />,
    <Route key="v2-cart" path="/v2/cart" element={<V2Cart />} />,
    <Route key="v2-verify" path="/v2/checkout/verify" element={<V2CheckoutVerify />} />,
    <Route key="v2-success" path="/v2/checkout/success" element={<V2CheckoutSuccess />} />,
  ];
}