import { PenLine, Users, Wine, Truck, Megaphone, type LucideIcon } from "lucide-react";

export interface AdminArea {
  key: string;
  to: string;
  title: string;
  desc: string;
  icon: LucideIcon;
  roles: string[];
}

export const ADMIN_AREAS: AdminArea[] = [
  {
    key: "cms",
    to: "/cms",
    title: "Content (CMS)",
    desc: "Edit marketing copy, partners, branding.",
    icon: PenLine,
    roles: ["owner", "admin", "cms_editor"],
  },
  {
    key: "crm",
    to: "/crm",
    title: "Sales (CRM)",
    desc: "Accounts, routes, ambassadors, compliance.",
    icon: Users,
    roles: [
      "owner", "admin", "national_manager", "regional_manager",
      "state_manager", "brand_ambassador", "ambassador_manager", "crm_user",
    ],
  },
  {
    key: "club",
    to: "/club/admin",
    title: "Wine Club",
    desc: "Members, shipments, curations.",
    icon: Wine,
    roles: ["owner", "admin", "wine_club_manager"],
  },
  {
    key: "dropship",
    to: "/crm/dropship",
    title: "Dropship",
    desc: "Partners, orders, payouts.",
    icon: Truck,
    roles: ["owner", "admin", "dropship_manager"],
  },
  {
    key: "kennel",
    to: "/kennel",
    title: "The Kennel",
    desc: "Ad ops command center — spend, ROAS, recommendations.",
    icon: Megaphone,
    roles: ["owner", "admin", "ad_ops_manager"],
  },
];

export const hasAreaAccess = (area: AdminArea, roles: string[]) =>
  area.roles.some((r) => roles.includes(r));

export const findArea = (key: string) =>
  ADMIN_AREAS.find((a) => a.key === key);