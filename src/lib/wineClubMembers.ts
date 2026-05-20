import { supabase } from "@/integrations/supabase/client";

type VsActiveEmailRow = { customer_email: string | null };

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