// Shared helpers for talking to the Vinoshipper REST API.
// Docs: https://developer.vinoshipper.com/reference
//
// Auth: supports two modes (auto-detected from which secrets are present):
//   1. Basic auth — VINOSHIPPER_API_KEY_ID + VINOSHIPPER_API_SECRET (preferred,
//      matches VS dashboard "API Keys" page).
//   2. Bearer token — VINOSHIPPER_API_KEY (legacy fallback).
//
// Live vs simulation is gated by the VS_LIVE_MODE env var (see vsLiveMode()).

const VS_BASE_URL = "https://vinoshipper.com/api/v3";

/** Single source of truth for "are we calling the real Vinoshipper API?" */
export function vsLiveMode(): boolean {
  const v = Deno.env.get("VS_LIVE_MODE");
  return v === "true" || v === "1";
}

function buildAuthHeader(): string {
  const id = Deno.env.get("VINOSHIPPER_API_KEY_ID");
  const secret = Deno.env.get("VINOSHIPPER_API_SECRET");
  if (id && secret) {
    return `Basic ${btoa(`${id}:${secret}`)}`;
  }
  const bearer = Deno.env.get("VINOSHIPPER_API_KEY");
  if (bearer) return `Bearer ${bearer}`;
  throw new VinoshipperError(
    500,
    "Vinoshipper credentials not configured (need VINOSHIPPER_API_KEY_ID + VINOSHIPPER_API_SECRET, or VINOSHIPPER_API_KEY)",
    null,
  );
}

export interface VsRequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

export class VinoshipperError extends Error {
  status: number;
  details: unknown;
  constructor(status: number, message: string, details: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function vsFetch<T = unknown>(
  path: string,
  opts: VsRequestOptions = {},
): Promise<T> {
  const url = new URL(`${VS_BASE_URL}${path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: buildAuthHeader(),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!res.ok) {
    throw new VinoshipperError(res.status, `Vinoshipper ${res.status}`, parsed);
  }
  return parsed as T;
}

// ----- Webhook payload shape (from docs) -----
export type VsWebhookSubject = "ORDER" | "CUSTOMER" | "CLUB_MEMBERSHIP";
export type VsWebhookEvent =
  | "APPROVED"
  | "CREATED"
  | "UPDATED"
  | "CANCELLED"
  | "DELETED"
  | "CARD_DECLINED"
  | "TRACKING_NUMBER";

export interface VsWebhookPayload {
  identifier: string;
  subject: VsWebhookSubject;
  event: VsWebhookEvent;
}

// ----- Order creation (placeholder shape — refine after reading docs in detail) -----
export interface VsOrderLineItem {
  productId: string | number;
  quantity: number;
}

export interface VsCreateOrderInput {
  customerId?: string | number;
  orderNumber?: string;
  lineItems: VsOrderLineItem[];
  couponCode?: string;
  shippingAddress?: {
    firstName: string;
    lastName: string;
    address1: string;
    address2?: string;
    city: string;
    state: string;
    zip: string;
    phone?: string;
    email?: string;
  };
}

export async function vsCreateOrder(input: VsCreateOrderInput) {
  return vsFetch("/orders", { method: "POST", body: input });
}

// ----- Coupon -----
export interface VsCreateCouponInput {
  code: string;
  discountPercent?: number;
  discountAmount?: number;
  // Refine with real schema from docs once we have access.
}

export async function vsCreateCoupon(input: VsCreateCouponInput) {
  return vsFetch("/coupons", { method: "POST", body: input });
}

// ----- Customer + Club membership -----
export interface VsCreateCustomerInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  shippingAddress?: VsCreateOrderInput["shippingAddress"];
}

export async function vsCreateCustomer(input: VsCreateCustomerInput) {
  return vsFetch("/customers", { method: "POST", body: input });
}

/**
 * Look up an existing Vinoshipper customer by email.
 * Returns the first matching customer, or null if none found.
 * Endpoint shape may need to be confirmed against the real Vinoshipper docs;
 * we call /customers?email= and accept either a list or a single object response.
 */
export async function vsFindCustomerByEmail(
  email: string,
): Promise<{ id: string | number } | null> {
  try {
    const result = await vsFetch<unknown>("/customers", {
      method: "GET",
      query: { email },
    });
    if (Array.isArray(result)) {
      const first = result[0] as { id?: string | number } | undefined;
      return first?.id !== undefined ? { id: first.id } : null;
    }
    if (result && typeof result === "object" && "id" in (result as Record<string, unknown>)) {
      const id = (result as { id?: string | number }).id;
      return id !== undefined ? { id } : null;
    }
    return null;
  } catch (err) {
    if (err instanceof VinoshipperError && err.status === 404) return null;
    throw err;
  }
}

export interface VsCreateClubMembershipInput {
  customerId: string | number;
  clubId: string | number; // Vinoshipper-side club product/tier id
  startDate?: string;
  notes?: string;
}

export async function vsCreateClubMembership(input: VsCreateClubMembershipInput) {
  return vsFetch("/club-memberships", { method: "POST", body: input });
}

// ----- Webhook registration -----
export interface VsRegisterWebhookInput {
  url: string;
  subjects: VsWebhookSubject[];
}

export async function vsRegisterWebhook(input: VsRegisterWebhookInput) {
  return vsFetch("/webhooks", { method: "POST", body: input });
}