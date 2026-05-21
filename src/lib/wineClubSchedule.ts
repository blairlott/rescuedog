/**
 * Wine club shipment cadence.
 *
 * Matches the published FAQ:
 *  - Quarterly clubs: time shipments to arrive before Valentine's Day,
 *    Mother's Day, end of summer, and Thanksgiving.
 *  - Yearly club: arrives around Thanksgiving.
 *  - Bi-Annual: late spring + before Thanksgiving.
 *  - Monthly: ships ~15th of each month.
 *
 * Dates here are the *ship* dates (we target delivery a few days later).
 */

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Quarterly ship targets (month index 0-11, day). Ship ~10 days ahead of the holiday.
const QUARTERLY_SHIP_DAYS: Array<[number, number]> = [
  [1, 4],   // Feb 4 → arrives before Valentine's Day (Feb 14)
  [4, 1],   // May 1 → arrives before Mother's Day (2nd Sun of May)
  [7, 20],  // Aug 20 → end of summer
  [10, 14], // Nov 14 → arrives before Thanksgiving
];

// Bi-Annual: late spring + before Thanksgiving.
const BIANNUAL_SHIP_DAYS: Array<[number, number]> = [
  [4, 1],   // May 1
  [10, 14], // Nov 14
];

// Yearly: ships in time to arrive around Thanksgiving.
const YEARLY_SHIP_DAYS: Array<[number, number]> = [
  [10, 14], // Nov 14
];

function nextFromTargets(targets: Array<[number, number]>, from = new Date()): Date {
  const year = from.getFullYear();
  for (const [m, d] of targets) {
    const candidate = new Date(year, m, d);
    if (candidate > from) return candidate;
  }
  const [m, d] = targets[0];
  return new Date(year + 1, m, d);
}

/** Returns the next expected ship date for a given tier frequency, as an ISO date string. */
export function getNextShipmentDateForFrequency(frequency: string | null | undefined): string {
  const f = (frequency ?? "").toLowerCase();
  const now = new Date();

  if (f.includes("year")) return iso(nextFromTargets(YEARLY_SHIP_DAYS, now));
  if (f.includes("bi") || f.includes("biannual") || f.includes("semi")) {
    return iso(nextFromTargets(BIANNUAL_SHIP_DAYS, now));
  }
  if (f.includes("quarter")) return iso(nextFromTargets(QUARTERLY_SHIP_DAYS, now));

  // Monthly (default): next month, 15th.
  const monthly = new Date(now.getFullYear(), now.getMonth() + 1, 15);
  return iso(monthly);
}

/** Human label for the cadence (e.g. "Ships quarterly · next ~Feb 4"). */
export function describeShipmentCadence(frequency: string | null | undefined): string {
  const f = (frequency ?? "").toLowerCase();
  const next = getNextShipmentDateForFrequency(frequency);
  const nice = new Date(next + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

  if (f.includes("year")) return `Yearly shipment · arrives around Thanksgiving (next ships ~${nice})`;
  if (f.includes("bi") || f.includes("semi")) return `Bi-Annual shipments · next ships ~${nice}`;
  if (f.includes("quarter")) return `Quarterly shipments · next ships ~${nice}`;
  return `Monthly shipments · next ships ~${nice}`;
}