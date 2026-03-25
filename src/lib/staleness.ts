import { differenceInDays } from "date-fns";

export type StalenessLevel = "fresh" | "stale-30" | "stale-60" | "stale-90" | null;

export function getStaleness(lastOrderDate: string | null): StalenessLevel {
  if (!lastOrderDate) return null;
  const days = differenceInDays(new Date(), new Date(lastOrderDate));
  if (days >= 90) return "stale-90";
  if (days >= 60) return "stale-60";
  if (days >= 30) return "stale-30";
  return "fresh";
}

export function getStalenessLabel(level: StalenessLevel): string {
  switch (level) {
    case "stale-30": return "30+ days";
    case "stale-60": return "60+ days";
    case "stale-90": return "90+ days";
    case "fresh": return "Recent";
    default: return "No orders";
  }
}

export function getStalenessColor(level: StalenessLevel): string {
  switch (level) {
    case "stale-30": return "bg-yellow-100 text-yellow-800";
    case "stale-60": return "bg-orange-100 text-orange-800";
    case "stale-90": return "bg-red-100 text-red-800";
    case "fresh": return "bg-green-100 text-green-800";
    default: return "bg-muted text-muted-foreground";
  }
}
