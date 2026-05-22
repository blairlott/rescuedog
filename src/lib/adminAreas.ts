import { PenLine, Users, Wine, Truck, Megaphone, DollarSign, type LucideIcon } from "lucide-react";

export interface AdminArea {
  key: string;
  to: string;
  title: string;
  desc: string;
  icon: LucideIcon;
  roles: string[];
}

// Note: the read-only `viewer` and `executive` roles get appended to every
// area's allowed roles below so backend viewers can navigate the portal.
// They cannot edit/publish — write-side gating is enforced separately.
const READ_ONLY_BACKEND_ROLES = ["viewer", "executive"] as const;

const RAW_ADMIN_AREAS: AdminArea[] = [
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
    to: "/dropship",
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
    roles: ["owner", "admin", "ad_ops_manager", "executive", "kennel_viewer"],
  },
  {
    key: "finance",
    to: "/finance",
    title: "Finance",
    desc: "CFO dashboard — P&L, cash, ROAS, MRR, Vinoshipper sales.",
    icon: DollarSign,
    roles: ["owner", "admin", "executive", "cfo"],
  },
];

export const ADMIN_AREAS: AdminArea[] = RAW_ADMIN_AREAS.map((area) => ({
  ...area,
  roles: Array.from(new Set([...area.roles, ...READ_ONLY_BACKEND_ROLES])),
}));

export const hasAreaAccess = (area: AdminArea, roles: string[]) =>
  area.roles.some((r) => roles.includes(r));

export const findArea = (key: string) =>
  ADMIN_AREAS.find((a) => a.key === key);

// Human-friendly labels for the roles a user can request, grouped by area.
// The viewer/executive read-only roles are intentionally excluded — those
// are granted directly by an admin, not requested by end users.
export const REQUESTABLE_ROLES_BY_AREA: Record<string, { value: string; label: string }[]> = {
  cms: [
    { value: "cms_editor", label: "CMS Editor (edit content)" },
    { value: "admin", label: "Admin (full CMS control)" },
  ],
  crm: [
    { value: "crm_user", label: "CRM User (general sales access)" },
    { value: "brand_ambassador", label: "Brand Ambassador / Sales Rep" },
    { value: "state_manager", label: "State Manager" },
    { value: "regional_manager", label: "Regional Manager" },
    { value: "national_manager", label: "National Manager" },
    { value: "ambassador_manager", label: "Ambassador Manager" },
    { value: "admin", label: "Admin (full CRM control)" },
  ],
  club: [
    { value: "wine_club_manager", label: "Wine Club Manager" },
    { value: "admin", label: "Admin (full Wine Club control)" },
  ],
  dropship: [
    { value: "dropship_manager", label: "Dropship Manager" },
    { value: "admin", label: "Admin (full Dropship control)" },
  ],
  kennel: [
    { value: "kennel_viewer", label: "Kennel Viewer (read-only)" },
    { value: "ad_ops_manager", label: "Ad Ops Manager" },
    { value: "admin", label: "Admin (full Kennel control)" },
  ],
  finance: [
    { value: "cfo", label: "CFO (Finance dashboard access)" },
    { value: "admin", label: "Admin (full Finance control)" },
  ],
};