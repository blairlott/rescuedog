// US states where Rescue Dog Wines can legally ship DTC wine.
// Source: based on common California winery DTC permits (review with compliance team).
// Update this list as licensing changes — single source of truth for the "ships to your state" badge.

export type StateCode = string;

export const SHIPS_TO_STATES: Record<StateCode, { name: string; limitNote?: string }> = {
  AK: { name: "Alaska" },
  AZ: { name: "Arizona" },
  CA: { name: "California" },
  CO: { name: "Colorado" },
  CT: { name: "Connecticut" },
  DC: { name: "District of Columbia" },
  FL: { name: "Florida" },
  GA: { name: "Georgia" },
  HI: { name: "Hawaii" },
  IA: { name: "Iowa" },
  ID: { name: "Idaho" },
  IL: { name: "Illinois" },
  IN: { name: "Indiana" },
  KS: { name: "Kansas" },
  LA: { name: "Louisiana" },
  MA: { name: "Massachusetts" },
  MD: { name: "Maryland" },
  ME: { name: "Maine" },
  MI: { name: "Michigan" },
  MN: { name: "Minnesota" },
  MO: { name: "Missouri" },
  NC: { name: "North Carolina" },
  ND: { name: "North Dakota" },
  NE: { name: "Nebraska" },
  NH: { name: "New Hampshire" },
  NJ: { name: "New Jersey" },
  NM: { name: "New Mexico" },
  NV: { name: "Nevada" },
  NY: { name: "New York" },
  OH: { name: "Ohio" },
  OR: { name: "Oregon" },
  PA: { name: "Pennsylvania" },
  SC: { name: "South Carolina" },
  TN: { name: "Tennessee" },
  TX: { name: "Texas" },
  VA: { name: "Virginia" },
  VT: { name: "Vermont" },
  WA: { name: "Washington" },
  WI: { name: "Wisconsin" },
  WV: { name: "West Virginia" },
  WY: { name: "Wyoming" },
};

// States we cannot ship to — surface clear messaging
export const NO_SHIP_STATES: Record<StateCode, string> = {
  AL: "Alabama", AR: "Arkansas", DE: "Delaware", KY: "Kentucky",
  MS: "Mississippi", MT: "Montana", OK: "Oklahoma", RI: "Rhode Island",
  SD: "South Dakota", UT: "Utah",
};

export const ALL_STATES: { code: string; name: string }[] = [
  ...Object.entries(SHIPS_TO_STATES).map(([code, v]) => ({ code, name: v.name })),
  ...Object.entries(NO_SHIP_STATES).map(([code, name]) => ({ code, name })),
].sort((a, b) => a.name.localeCompare(b.name));

export function canShipTo(code: string | null | undefined): boolean {
  if (!code) return false;
  return code.toUpperCase() in SHIPS_TO_STATES;
}
