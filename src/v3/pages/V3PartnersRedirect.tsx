import { Navigate } from "react-router-dom";

/**
 * /v3/admin/partners
 * Shortcut that sends users to the canonical Partner Ops console at /crm/dropship.
 * Kept as a v3 admin entry point for discoverability alongside the Printful sim.
 */
export default function V3PartnersRedirect() {
  return <Navigate to="/crm/dropship" replace />;
}