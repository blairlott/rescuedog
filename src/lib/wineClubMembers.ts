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