// Canonical deep-links into the Vinoshipper member portal. These are the URLs
// hosted by Vinoshipper (https://vinoshipper.com/account/*) where members
// authenticate with the email + password they used when their order/membership
// was created. We use these for compliance-sensitive flows that Lovable Cloud
// cannot perform itself: card-on-file updates, billing/shipping address edits,
// and the full subscription lifecycle.
//
// Pass `vinoshipper_customer_id` when you have it — VS will route the member
// to the appropriate panel after login. We never include that ID in user-facing
// copy; it's only here so the deep-link can be made specific when possible.

const BASE = "https://vinoshipper.com/account";

export type VsPortalSection =
  | "overview"
  | "payment_methods"
  | "addresses"
  | "orders"
  | "subscriptions"
  | "shipments"
  | "preferences";

const PATHS: Record<VsPortalSection, string> = {
  overview: "",
  payment_methods: "/payment-methods",
  addresses: "/addresses",
  orders: "/orders",
  subscriptions: "/subscriptions",
  shipments: "/subscriptions",
  preferences: "/preferences",
};

export function vinoshipperPortalUrl(
  section: VsPortalSection = "overview",
  _vinoshipperCustomerId?: string | null,
) {
  return `${BASE}${PATHS[section] ?? ""}`;
}

export const VS_PORTAL_LABELS: Record<VsPortalSection, { title: string; description: string }> = {
  overview: {
    title: "Member Portal",
    description: "Sign in to your Vinoshipper account to manage every billing detail.",
  },
  payment_methods: {
    title: "Update Card on File",
    description: "Add, replace, or remove the credit card used for shipments.",
  },
  addresses: {
    title: "Update Shipping Address",
    description: "Change where your next shipment ships — opens the secure portal.",
  },
  orders: {
    title: "Order History & Invoices",
    description: "View receipts and reprint invoices for past Vinoshipper orders.",
  },
  subscriptions: {
    title: "Manage Subscriptions",
    description: "Switch tier, change frequency, skip, or pause shipments.",
  },
  shipments: {
    title: "Upcoming Shipments",
    description: "See what's queued up for your next billing cycle.",
  },
  preferences: {
    title: "Email & Notification Preferences",
    description: "Control what Vinoshipper emails you about your account.",
  },
};