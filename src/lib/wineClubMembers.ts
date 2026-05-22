import { supabase } from "@/integrations/supabase/client";

type VsActiveEmailRow = { customer_email: string | null };
type VsGiftRow = {
  customer_email: string | null;
  customer_last_name: string | null;
  customer_street: string | null;
  customer_zip: string | null;
  ship_to_last_name: string | null;
  ship_to_street: string | null;
  ship_to_zip: string | null;
  order_type: string | null;
};

export async function fetchActiveVsMemberEmails() {
  const PAGE = 1000;
  const emails = new Set<string>();

  for (let from = 0; from < 50000; from += PAGE) {
    const { data, error } = await supabase
      .from("vs_transactions" as never)
      .select("customer_email")
      .eq("active_club_member", true)
      .not("customer_email", "is", null)
      .order("customer_email", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) break;
    const rows = (data ?? []) as unknown as VsActiveEmailRow[];
    for (const r of rows) {
      const email = r.customer_email?.trim().toLowerCase();
      if (email) emails.add(email);
    }
    if (rows.length < PAGE) break;
  }

  return emails;
}

/**
 * Vinoshipper doesn't flag gift memberships, so we infer them from active
 * club transactions where the shipping address differs from the buyer's
 * address. Each distinct gift recipient is counted as one additional
 * member on top of the purchaser. Returns a Set of stable recipient
 * identity keys (lastname|street|zip).
 */
export async function fetchActiveVsGiftRecipientKeys() {
  const PAGE = 1000;
  const recipients = new Set<string>();

  const norm = (s: string | null | undefined) =>
    (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

  for (let from = 0; from < 50000; from += PAGE) {
    const { data, error } = await supabase
      .from("vs_transactions" as never)
      .select(
        "customer_email, customer_last_name, customer_street, customer_zip, ship_to_last_name, ship_to_street, ship_to_zip, order_type",
      )
      .eq("active_club_member", true)
      // Second signal: VS tags one-off gift bottle purchases as
      // active_club_member too, so require an actual WINE_CLUB order
      // to qualify as a recurring gift membership.
      .eq("order_type", "WINE_CLUB")
      .order("customer_email", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) break;
    const rows = (data ?? []) as unknown as VsGiftRow[];
    for (const r of rows) {
      const buyerLast = norm(r.customer_last_name);
      const buyerStreet = norm(r.customer_street);
      const buyerZip = norm(r.customer_zip);
      const shipLast = norm(r.ship_to_last_name);
      const shipStreet = norm(r.ship_to_street);
      const shipZip = norm(r.ship_to_zip);
      if (!shipStreet || !shipZip) continue;
      const isGift =
        (buyerLast && shipLast && buyerLast !== shipLast) ||
        (buyerStreet && shipStreet && buyerStreet !== shipStreet) ||
        (buyerZip && shipZip && buyerZip !== shipZip);
      if (!isGift) continue;
      recipients.add(`${shipLast}|${shipStreet}|${shipZip}`);
    }
    if (rows.length < PAGE) break;
  }

  return recipients;
}

/**
 * Vinoshipper-sourced wine club timeline. Returns first-signup-date and
 * last-shipment-date for every distinct membership (per buyer email AND
 * per gift recipient address), plus revenue baselines for MRR.
 *
 * Why: Vinoshipper is our system of record for club shipments. We previously
 * derived history from the local `wine_club_memberships` table, which only
 * captures memberships originated on this site post-cutover. Reading directly
 * from VS gives us the full 2019→today picture.
 */
export type VsTimeline = {
  signupByDay: Map<string, number>;
  churnByDay: Map<string, number>;
  activeNow: number;
  monthlyRevenuePerMemberCents: number;
  avgShipmentCents: number;
  totalMemberships: number;
};

export async function fetchVsClubTimeline(): Promise<VsTimeline> {
  const PAGE = 1000;
  type Row = {
    customer_email: string | null;
    transaction_date: string | null;
    customer_last_name: string | null;
    customer_street: string | null;
    customer_zip: string | null;
    ship_to_last_name: string | null;
    ship_to_street: string | null;
    ship_to_zip: string | null;
    gross_value: number | null;
    active_club_member: boolean | null;
  };

  const norm = (s: string | null | undefined) =>
    (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

  type IdRec = { firstDate: string; lastDate: string; active: boolean };
  const ids = new Map<string, IdRec>();

  let recentTotalDollars = 0;
  let recentShipments = 0;
  const oneYearAgo = new Date(Date.now() - 365 * 86400000);

  for (let from = 0; from < 200000; from += PAGE) {
    const { data, error } = await supabase
      .from("vs_transactions" as never)
      .select(
        "customer_email, transaction_date, customer_last_name, customer_street, customer_zip, ship_to_last_name, ship_to_street, ship_to_zip, gross_value, active_club_member",
      )
      .eq("order_type", "WINE_CLUB")
      .order("transaction_date", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) break;
    const rows = (data ?? []) as unknown as Row[];
    for (const r of rows) {
      const d = r.transaction_date?.slice(0, 10);
      if (!d) continue;

      const email = norm(r.customer_email);
      if (email) {
        const key = `c:${email}`;
        const cur = ids.get(key);
        if (!cur) ids.set(key, { firstDate: d, lastDate: d, active: !!r.active_club_member });
        else {
          if (d < cur.firstDate) cur.firstDate = d;
          if (d > cur.lastDate) cur.lastDate = d;
          if (r.active_club_member) cur.active = true;
        }
      }

      const buyerLast = norm(r.customer_last_name);
      const buyerStreet = norm(r.customer_street);
      const buyerZip = norm(r.customer_zip);
      const shipLast = norm(r.ship_to_last_name);
      const shipStreet = norm(r.ship_to_street);
      const shipZip = norm(r.ship_to_zip);
      if (shipStreet && shipZip) {
        const isGift =
          (buyerLast && shipLast && buyerLast !== shipLast) ||
          (buyerStreet && shipStreet && buyerStreet !== shipStreet) ||
          (buyerZip && shipZip && buyerZip !== shipZip);
        if (isGift) {
          const key = `g:${shipLast}|${shipStreet}|${shipZip}`;
          const cur = ids.get(key);
          if (!cur) ids.set(key, { firstDate: d, lastDate: d, active: !!r.active_club_member });
          else {
            if (d < cur.firstDate) cur.firstDate = d;
            if (d > cur.lastDate) cur.lastDate = d;
            if (r.active_club_member) cur.active = true;
          }
        }
      }

      if (new Date(d + "T00:00:00Z") >= oneYearAgo) {
        recentTotalDollars += Number(r.gross_value ?? 0);
        recentShipments += 1;
      }
    }
    if (rows.length < PAGE) break;
  }

  // A membership is considered active if VS flags any of its transactions
  // as active_club_member, OR the last shipment was within ~1 quarter
  // (clubs ship roughly quarterly so anything stale > 120d is treated as churned).
  const STALE_DAYS = 120;
  const staleCutoff = new Date(Date.now() - STALE_DAYS * 86400000);

  const signupByDay = new Map<string, number>();
  const churnByDay = new Map<string, number>();
  let activeNow = 0;

  for (const rec of ids.values()) {
    signupByDay.set(rec.firstDate, (signupByDay.get(rec.firstDate) ?? 0) + 1);
    const isActive = rec.active || new Date(rec.lastDate + "T00:00:00Z") >= staleCutoff;
    if (isActive) activeNow += 1;
    else churnByDay.set(rec.lastDate, (churnByDay.get(rec.lastDate) ?? 0) + 1);
  }

  const avgShipmentCents = recentShipments > 0
    ? Math.round((recentTotalDollars / recentShipments) * 100)
    : 0;
  // Clubs ship ~4x/yr → ~1 every 3 months → monthly per-member revenue = shipment/3.
  const monthlyRevenuePerMemberCents = Math.round(avgShipmentCents / 3);

  return {
    signupByDay,
    churnByDay,
    activeNow,
    monthlyRevenuePerMemberCents,
    avgShipmentCents,
    totalMemberships: ids.size,
  };
}