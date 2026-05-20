/**
 * Server-side mirror of src/lib/internalUsers.ts — keep both lists in sync.
 * Used to suppress paid-media conversion forwarding (GA4 MP + Meta CAPI)
 * for test / internal staff accounts.
 */
export const INTERNAL_EMAILS: ReadonlySet<string> = new Set([
  "blair.lott@gmail.com",
  "info@rescuedogwines.com",
]);

export function isInternalEmail(email?: string | null): boolean {
  if (!email) return false;
  return INTERNAL_EMAILS.has(email.trim().toLowerCase());
}