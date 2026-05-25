/**
 * Single source of truth for "is this email a staff/back-office account?".
 * Customer auth surfaces must reject these emails; back-office surfaces require them.
 * Keep in sync with src/pages/AdminPortalPage.tsx and any other staff login gates.
 */
const STAFF_DOMAINS = ["rescuedogwines.com"];

export function isStaffEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase().trim();
  return STAFF_DOMAINS.some((d) => e.endsWith("@" + d));
}

export const STAFF_EMAIL_MESSAGE =
  "This email belongs to a staff account. Sign in at /admin instead.";