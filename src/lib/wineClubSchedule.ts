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

/**
 * Returns the human window the next shipment is targeted for — never a
 * specific date. Ship timing flexes with weather and we don't want to
 * lock members into a date we may need to move.
 */
export function describeNextShipmentWindow(frequency: string | null | undefined): string {
  const f = (frequency ?? "").toLowerCase();

  if (f.includes("year")) return "around Thanksgiving";
  if (f.includes("month")) return "later this month";

  // Quarterly / bi-annual share the same holiday targets; pick whichever is next.
  const targets = f.includes("bi") || f.includes("semi") ? BIANNUAL_SHIP_DAYS : QUARTERLY_SHIP_DAYS;
  const next = nextFromTargets(targets);
  const m = next.getMonth();
  if (m === 0 || m === 1) return "before Valentine's Day";
  if (m === 2 || m === 3 || m === 4) return "before Mother's Day";
  if (m === 5 || m === 6 || m === 7) return "around the end of summer";
  return "before Thanksgiving";
}

/** Cadence label without committing to a specific date. */
export function describeShipmentCadence(frequency: string | null | undefined): string {
  const f = (frequency ?? "").toLowerCase();
  const window = describeNextShipmentWindow(frequency);
  if (f.includes("year")) return `Yearly shipment · arrives ${window}`;
  if (f.includes("bi") || f.includes("semi")) return `Bi-Annual shipments · next arrives ${window}`;
  if (f.includes("quarter")) return `Quarterly shipments · next arrives ${window}`;
  return `Monthly shipments · next arrives ${window}`;
}