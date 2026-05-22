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

/**
 * Guest → Club conversion pathways.
 *
 * Sourced 100% from `vs_transactions`. For every distinct customer_email we
 * find:
 *   - first guest order (any non-WINE_CLUB order_type)
 *   - first WINE_CLUB order
 *   - all guest spend before the club order
 *   - the "gateway SKU" — the most recent guest order's invoice
 *
 * A "converter" is an email with at least one guest order BEFORE their first
 * club order. Pure-club emails (joined on first interaction) are tracked
 * separately as `directJoiners`.
 */
export type ConverterRow = {
  email: string;
  firstGuestAt: string;
  firstClubAt: string;
  daysToConvert: number;
  guestOrders: number;
  guestSpendCents: number;
  gatewayState: string | null;
  gatewayChannel: string | null; // ONLINE | POS | EVENT | OTHER
  gatewayInvoice: string | null;
};

export type ConversionPathways = {
  totalEmails: number;
  converters: number;
  directJoiners: number;
  guestOnly: number;
  conversionRate: number; // converters / (converters + guestOnly)
  medianDaysToConvert: number | null;
  medianGuestOrders: number | null;
  medianGuestSpendCents: number | null;
  daysBuckets: { label: string; count: number }[]; // 0-7, 8-30, 31-90, 91-180, 180+
  ordersBuckets: { label: string; count: number }[]; // 1, 2, 3, 4-5, 6+
  topStates: { state: string; count: number }[];
  channelMix: { channel: string; count: number }[];
  monthOfYear: { month: string; count: number }[]; // Jan..Dec converter signups
  converters_sample: ConverterRow[]; // top 50 most recent
  alaCarte: AlaCarteSummary;
};

export type AlaCarteCohort =
  | "guestOnly"      // never joined the club
  | "preConversion"  // à la carte before they joined the club
  | "postConversion" // à la carte after joining (member add-on)
  | "directMember";  // joined club first, à la carte later

export type AlaCarteSummary = {
  totalOrders: number;
  totalRevenueCents: number;
  uniqueBuyers: number;
  aovCents: number;
  byCohort: { cohort: AlaCarteCohort; orders: number; buyers: number; revenueCents: number }[];
  channelMix: { channel: string; orders: number; revenueCents: number }[];
  topStates: { state: string; orders: number; revenueCents: number }[];
  memberAddonRate: number; // share of converters/directMembers who placed at least one post-join à la carte order
};

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function channelOf(orderType: string | null, saleLocation: string | null): string {
  const ot = (orderType ?? "").toUpperCase();
  if (ot === "POS") return "POS";
  if (ot === "EVENT") return "EVENT";
  if (ot === "ONLINE") return "ONLINE";
  const sl = (saleLocation ?? "").toLowerCase();
  if (sl.includes("tasting") || sl.includes("event")) return "EVENT";
  if (sl.includes("tasting room") || sl.includes("winery")) return "POS";
  return ot || "OTHER";
}

export async function fetchConversionPathways(): Promise<ConversionPathways> {
  const PAGE = 1000;
  type Row = {
    customer_email: string | null;
    transaction_date: string | null;
    order_type: string | null;
    sale_location: string | null;
    gross_value: number | null;
    ship_to_state: string | null;
    invoice: string | null;
  };

  type EmailAgg = {
    firstGuestAt: string | null;
    lastGuestAt: string | null;
    firstClubAt: string | null;
    guestOrders: number;
    guestSpendCents: number;
    gatewayState: string | null;
    gatewayChannel: string | null;
    gatewayInvoice: string | null;
    gatewayDate: string | null;
  };

  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
  const emails = new Map<string, EmailAgg>();

  for (let from = 0; from < 300000; from += PAGE) {
    const { data, error } = await supabase
      .from("vs_transactions" as never)
      .select(
        "customer_email, transaction_date, order_type, sale_location, gross_value, ship_to_state, invoice",
      )
      .not("customer_email", "is", null)
      .order("transaction_date", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) break;
    const rows = (data ?? []) as unknown as Row[];
    for (const r of rows) {
      const email = norm(r.customer_email);
      const d = r.transaction_date?.slice(0, 10);
      if (!email || !d) continue;
      const isClub = (r.order_type ?? "").toUpperCase() === "WINE_CLUB";
      let agg = emails.get(email);
      if (!agg) {
        agg = {
          firstGuestAt: null,
          lastGuestAt: null,
          firstClubAt: null,
          guestOrders: 0,
          guestSpendCents: 0,
          gatewayState: null,
          gatewayChannel: null,
          gatewayInvoice: null,
          gatewayDate: null,
        };
        emails.set(email, agg);
      }
      if (isClub) {
        if (!agg.firstClubAt || d < agg.firstClubAt) agg.firstClubAt = d;
      } else {
        agg.guestOrders += 1;
        agg.guestSpendCents += Math.round(Number(r.gross_value ?? 0) * 100);
        if (!agg.firstGuestAt || d < agg.firstGuestAt) agg.firstGuestAt = d;
        // Track most recent guest order as "gateway" (closest to conversion)
        if (!agg.gatewayDate || d > agg.gatewayDate) {
          agg.gatewayDate = d;
          agg.gatewayState = (r.ship_to_state ?? "").trim().toUpperCase() || null;
          agg.gatewayChannel = channelOf(r.order_type, r.sale_location);
          agg.gatewayInvoice = r.invoice ?? null;
        }
        if (!agg.lastGuestAt || d > agg.lastGuestAt) agg.lastGuestAt = d;
      }
    }
    if (rows.length < PAGE) break;
  }

  const converters: ConverterRow[] = [];
  let directJoiners = 0;
  let guestOnly = 0;

  for (const [email, a] of emails.entries()) {
    const hasGuest = !!a.firstGuestAt;
    const hasClub = !!a.firstClubAt;
    if (hasClub && !hasGuest) {
      directJoiners += 1;
      continue;
    }
    if (hasClub && hasGuest && a.firstGuestAt! < a.firstClubAt!) {
      const days = Math.max(
        0,
        Math.round(
          (new Date(a.firstClubAt + "T00:00:00Z").getTime() -
            new Date(a.firstGuestAt + "T00:00:00Z").getTime()) /
            86400000,
        ),
      );
      converters.push({
        email,
        firstGuestAt: a.firstGuestAt!,
        firstClubAt: a.firstClubAt!,
        daysToConvert: days,
        guestOrders: a.guestOrders,
        guestSpendCents: a.guestSpendCents,
        gatewayState: a.gatewayState,
        gatewayChannel: a.gatewayChannel,
        gatewayInvoice: a.gatewayInvoice,
      });
      continue;
    }
    if (hasGuest && !hasClub) guestOnly += 1;
  }

  const dayBucketDefs = [
    { label: "0–7d", min: 0, max: 7 },
    { label: "8–30d", min: 8, max: 30 },
    { label: "31–90d", min: 31, max: 90 },
    { label: "91–180d", min: 91, max: 180 },
    { label: "180d+", min: 181, max: Infinity },
  ];
  const daysBuckets = dayBucketDefs.map((b) => ({
    label: b.label,
    count: converters.filter((c) => c.daysToConvert >= b.min && c.daysToConvert <= b.max).length,
  }));

  const orderBucketDefs = [
    { label: "1", test: (n: number) => n === 1 },
    { label: "2", test: (n: number) => n === 2 },
    { label: "3", test: (n: number) => n === 3 },
    { label: "4–5", test: (n: number) => n >= 4 && n <= 5 },
    { label: "6+", test: (n: number) => n >= 6 },
  ];
  const ordersBuckets = orderBucketDefs.map((b) => ({
    label: b.label,
    count: converters.filter((c) => b.test(c.guestOrders)).length,
  }));

  const stateCounts = new Map<string, number>();
  const channelCounts = new Map<string, number>();
  const monthCounts = new Map<string, number>();
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  for (const c of converters) {
    if (c.gatewayState) stateCounts.set(c.gatewayState, (stateCounts.get(c.gatewayState) ?? 0) + 1);
    if (c.gatewayChannel) channelCounts.set(c.gatewayChannel, (channelCounts.get(c.gatewayChannel) ?? 0) + 1);
    const m = MONTHS[new Date(c.firstClubAt + "T00:00:00Z").getUTCMonth()];
    monthCounts.set(m, (monthCounts.get(m) ?? 0) + 1);
  }

  const topStates = Array.from(stateCounts.entries())
    .map(([state, count]) => ({ state, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const channelMix = Array.from(channelCounts.entries())
    .map(([channel, count]) => ({ channel, count }))
    .sort((a, b) => b.count - a.count);

  const monthOfYear = MONTHS.map((m) => ({ month: m, count: monthCounts.get(m) ?? 0 }));

  const sample = [...converters]
    .sort((a, b) => (a.firstClubAt < b.firstClubAt ? 1 : -1))
    .slice(0, 50);

  return {
    totalEmails: emails.size,
    converters: converters.length,
    directJoiners,
    guestOnly,
    conversionRate:
      converters.length + guestOnly > 0
        ? converters.length / (converters.length + guestOnly)
        : 0,
    medianDaysToConvert: median(converters.map((c) => c.daysToConvert)),
    medianGuestOrders: median(converters.map((c) => c.guestOrders)),
    medianGuestSpendCents: median(converters.map((c) => c.guestSpendCents)),
    daysBuckets,
    ordersBuckets,
    topStates,
    channelMix,
    monthOfYear,
    converters_sample: sample,
  };
}