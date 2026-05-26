import { NavLink } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  FileText,
  ChefHat,
  Image as ImageIcon,
  Sparkles,
  Heart,
  Users,
  Settings,
  Download,
  Plug,
  SlidersHorizontal,
  FlaskConical,
  LayoutTemplate,
  ShoppingBag,
  ListChecks,
  PenLine,
} from "lucide-react";

export type CmsTabValue =
  | "content"
  | "library"
  | "pairings"
  | "merch-images"
  | "creative-queue"
  | "rescues"
  | "users"
  | "settings"
  | "import"
  | "integrations"
  | "dev-controls";

const TABS: { value: CmsTabValue; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "content", label: "Content", icon: FileText },
  { value: "library", label: "Blog & Events", icon: FileText },
  { value: "pairings", label: "Pairings", icon: ChefHat },
  { value: "merch-images", label: "Merch Images", icon: ImageIcon },
  { value: "creative-queue", label: "Creative Queue", icon: Sparkles },
  { value: "rescues", label: "Rescues", icon: Heart },
  { value: "users", label: "Users", icon: Users },
  { value: "settings", label: "Settings", icon: Settings },
  { value: "import", label: "Import", icon: Download },
  { value: "integrations", label: "Integrations", icon: Plug },
  { value: "dev-controls", label: "Dev Controls", icon: SlidersHorizontal },
];

const TOOLS: { to: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { to: "/cms/heroes#wine", label: "Main Header (Wine)", icon: LayoutTemplate },
  { to: "/cms/heroes#merch", label: "Merch Header", icon: ShoppingBag },
  { to: "/cms/experiments", label: "Experiments", icon: FlaskConical },
  { to: "/cms/opportunities", label: "Optimization Queue", icon: ListChecks },
];

export function CmsSidebar({
  activeTab,
  onTabChange,
}: {
  activeTab: CmsTabValue;
  onTabChange: (v: CmsTabValue) => void;
}) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="inline-flex items-center justify-center w-7 h-7 bg-primary/10 rounded-full shrink-0">
            <PenLine className="h-3.5 w-3.5 text-primary" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-sm font-bold text-sidebar-foreground leading-tight truncate">CMS</div>
              <div className="text-[10px] text-sidebar-foreground/60 truncate">Content Manager</div>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Manage</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {TABS.map((t) => (
                <SidebarMenuItem key={t.value}>
                  <SidebarMenuButton
                    isActive={activeTab === t.value}
                    tooltip={t.label}
                    onClick={() => onTabChange(t.value)}
                  >
                    <t.icon className="h-4 w-4" />
                    <span>{t.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {TOOLS.map((t) => (
                <SidebarMenuItem key={t.to}>
                  <SidebarMenuButton asChild tooltip={t.label}>
                    <NavLink to={t.to}>
                      <t.icon className="h-4 w-4" />
                      <span>{t.label}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}