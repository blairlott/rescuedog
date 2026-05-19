import { Link, useLocation } from "react-router-dom";
import { Menu, X, User, LogIn } from "lucide-react";
import { HeaderSearch } from "./HeaderSearch";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useState } from "react";
import { CartDrawer } from "./CartDrawer";
import rdwLogo from "@/assets/rdw-logo.png";
import rescueDogLogo from "@/assets/rescue-dog-logo-hd.png";
import { isRescueDogDomain } from "@/lib/productUtils";
import { useCmsContent, getCmsValue } from "@/hooks/useCmsContent";
import { CmsEditButton } from "./cms/CmsEditButton";
import { CmsEditDialog, CmsField } from "./cms/CmsEditDialog";
import { InlineBannerEditor } from "./cms/InlineBannerEditor";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useTranslation } from "react-i18next";

interface NavItem {
  label: string;
  i18nKey: string;
  to: string;
  external?: boolean;
}

const navItems: NavItem[] = [
  { label: "SHOP WINES", i18nKey: "nav.shop_wines", to: "/wines" },
  { label: "WINE CLUB", i18nKey: "nav.wine_club", to: "/club" },
  { label: "FIND A STORE", i18nKey: "nav.find_a_store", to: "/store-locator" },
  { label: "MERCH", i18nKey: "nav.merch", to: "/merch" },
  { label: "ABOUT", i18nKey: "nav.about", to: "/about" },
  { label: "MISSION", i18nKey: "nav.mission", to: "/mission" },
  { label: "DONATION", i18nKey: "nav.donation", to: "/donation" },
  { label: "EVENTS", i18nKey: "nav.events", to: "/events" },
  { label: "AMBASSADORS", i18nKey: "nav.ambassadors", to: "/ambassadors" },
];

export function Header() {
  const { t } = useTranslation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [editSection, setEditSection] = useState<"logos" | "banner" | null>(null);
  const location = useLocation();
  const { user } = useCustomerAuth();
  const { data: roleInfo } = useUserRole();
  const isStaff =
    !!roleInfo &&
    (roleInfo.isAdminOrOwner ||
      (roleInfo.isSalesRep === true && roleInfo.roles.length > 0) ||
      roleInfo.roles.some((r) =>
        ["national_manager", "regional_manager", "state_manager", "brand_ambassador", "ambassador_manager", "wine_club_manager", "dropship_manager", "cms_editor", "crm_user"].includes(r)
      ));
  const { content, upsert } = useCmsContent("header");
  const merchPaths = ["/merch", "/about", "/mission", "/donation"];
  const isMerch = merchPaths.includes(location.pathname) || isRescueDogDomain();

  const getVal = (key: string, field: string, fallback: string) => getCmsValue(content, key, field, fallback);

  const wineLogo = getVal("logos", "wine_logo", "https://rescuedogwines.myshopify.com/cdn/shop/files/rdw_black_4x_7dece252-0ae7-4039-b832-0a86b7adec60.png?v=1742847391");
  const merchLogo = getVal("logos", "merch_logo", rescueDogLogo);
  const logo = isMerch ? merchLogo : wineLogo;
  const logoAlt = isMerch ? "Rescue Dog" : "Rescue Dog Wines";

  const handleSave = (sectionKey: string) => (values: Record<string, string>) => {
    upsert.mutate({ sectionKey, content: values }, {
      onSuccess: () => setEditSection(null),
    });
  };

  const wineBannerText = getVal("banner", "wine_banner", "Shipping included on 6+ btls · Use STOCKUP for 20% off 12+ btls");
  const merchBannerText = getVal("banner", "merch_banner", "50% of our profits supports rescue organizations.");
  const activeBannerText = isMerch ? merchBannerText : wineBannerText;
  const activeBannerKey = isMerch ? "merch_banner" : "wine_banner";

  const saveBannerInline = (next: string) => {
    upsert.mutate({
      sectionKey: "banner",
      content: {
        wine_banner: wineBannerText,
        merch_banner: merchBannerText,
        [activeBannerKey]: next,
      },
    });
  };

  const sectionFields: Record<string, { title: string; fields: CmsField[] }> = {
    logos: {
      title: "Site Logos",
      fields: [
        { key: "wine_logo", label: "Wine Site Logo URL", type: "url", value: wineLogo },
        { key: "merch_logo", label: "Merch Site Logo URL", type: "url", value: merchLogo },
      ],
    },
      banner: {
      title: "Announcement Banner",
      fields: [
        { key: "wine_banner", label: "Wine Site Banner Text", type: "text", value: getVal("banner", "wine_banner", "Shipping included on 6+ btls · Use STOCKUP for 20% off 12+ btls") },
        { key: "merch_banner", label: "Merch Site Banner Text", type: "text", value: getVal("banner", "merch_banner", "50% of our profits supports rescue organizations.") },
      ],
    },
  };

  return (
    <header className="sticky top-0 z-50 bg-background">
      {/* Announcement Bar */}
      <div className="bg-primary text-primary-foreground text-center py-2.5 px-4 relative">
        <CmsEditButton onClick={() => setEditSection("banner")} label="Edit Banner" scope="branding" />
        <InlineBannerEditor
          value={activeBannerText}
          onSave={saveBannerInline}
          isSaving={upsert.isPending}
          ariaLabel={isMerch ? "Merch banner text" : "Wine banner text"}
        />
      </div>

      {/* Main Header */}
      <div className="border-b border-border">
        <div className="container mx-auto px-4 py-4 grid grid-cols-[72px_1fr_72px] md:grid-cols-[96px_1fr_96px] items-center gap-2">
          {/* Left: Search */}
          <div className="flex items-center gap-3 min-w-0">
            <button className="md:hidden p-1 text-foreground" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="md:hidden">
              <LanguageSwitcher compact />
            </div>
            <HeaderSearch className="hidden md:block p-1 text-foreground hover:text-primary transition-colors" />
          </div>

          {/* Center: Logo */}
          <div className="relative flex justify-center px-1 md:px-2 min-w-0">
            <CmsEditButton onClick={() => setEditSection("logos")} label="Edit Logo" scope="branding" />
            <Link to={isMerch ? "/merch" : "/"} className="flex justify-center min-w-0">
              <span className={`relative inline-flex items-center overflow-visible leading-none ${isMerch ? "pb-3 md:pb-4" : "pb-1"}`}>
                <img
                  src={logo}
                  alt={logoAlt}
                  className={`block w-full h-auto object-contain ${isMerch ? "max-w-[180px] md:max-w-[280px]" : "max-w-[320px] md:max-w-[500px]"}`}
                />
                {isMerch && (
                  <span className="absolute top-[18%] -right-3 md:-right-4 text-[0.5rem] md:text-[0.6rem] font-semibold text-muted-foreground leading-none">TM</span>
                )}
                {!isMerch && (
                  <span className="absolute top-[18%] -right-2 md:-right-3 text-[0.45rem] md:text-[0.55rem] font-semibold text-foreground leading-none">®</span>
                )}
              </span>
            </Link>
          </div>

          {/* Right: Account + Cart */}
          <div className="flex items-center justify-end gap-3 min-w-0">
            <div className="hidden md:inline-flex">
              <LanguageSwitcher compact />
            </div>
            <Link
              to={user ? "/account" : "/login"}
              className="p-1 text-foreground hover:text-primary transition-colors"
              title={user ? t("nav.account") : t("nav.sign_in")}
              aria-label={user ? "Account" : "Sign in"}
            >
              {user ? <User className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}
            </Link>
            <CartDrawer />
          </div>
        </div>

        {/* Desktop Nav */}
        <nav className="hidden md:block border-t border-border">
          <div className="container mx-auto px-4">
            <ul className="flex items-center justify-center gap-8 py-3">
              {navItems.map((item) => (
                <li key={item.label}>
                  {item.external ? (
                    <a
                      href={item.to}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium tracking-brand uppercase text-foreground hover:text-primary transition-colors"
                    >
                      {t(item.i18nKey, item.label)}
                    </a>
                  ) : (
                    <Link
                      to={item.to}
                      className={`text-sm font-medium tracking-brand uppercase transition-colors ${
                        location.pathname === item.to ? "text-primary" : "text-foreground hover:text-primary"
                      }`}
                    >
                      {t(item.i18nKey, item.label)}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </div>

      {/* Mobile Nav */}
      {mobileMenuOpen && (
        <nav className="md:hidden border-b border-border bg-background px-4 py-4 space-y-3">
          {[...navItems, { label: "WHOLESALE / B2B", i18nKey: "nav.wholesale", to: "/wholesale" } as NavItem].map((item) => (
            item.external ? (
              <a
                key={item.label}
                href={item.to}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sm font-medium tracking-brand uppercase text-foreground"
                onClick={() => setMobileMenuOpen(false)}
              >
                {t(item.i18nKey, item.label)}
              </a>
            ) : (
              <Link
                key={item.label}
                to={item.to}
                className="block text-sm font-medium tracking-brand uppercase text-foreground"
                onClick={() => setMobileMenuOpen(false)}
              >
                {t(item.i18nKey, item.label)}
              </Link>
            )
          ))}
          <div className="pt-2 mt-2 border-t border-border space-y-3">
              <Link
                to="/admin"
                className="block text-xs font-medium tracking-brand uppercase text-muted-foreground"
                onClick={() => setMobileMenuOpen(false)}
              >
                ADMIN
              </Link>
              <Link
                to="/crm/login"
                className="block text-xs font-medium tracking-brand uppercase text-muted-foreground"
                onClick={() => setMobileMenuOpen(false)}
              >
                RDW SALES PORTAL
              </Link>
              <Link
                to="/intelligence"
                className="block text-xs font-medium tracking-brand uppercase text-muted-foreground"
                onClick={() => setMobileMenuOpen(false)}
              >
                COMMAND CENTER
              </Link>
          </div>
          <div className="pt-2 border-t border-border">
            <LanguageSwitcher />
          </div>
        </nav>
      )}

      {/* CMS Edit Dialogs */}
      {editSection && sectionFields[editSection] && (
        <CmsEditDialog
          open={!!editSection}
          onOpenChange={(open) => { if (!open) setEditSection(null); }}
          title={sectionFields[editSection].title}
          fields={sectionFields[editSection].fields}
          onSave={handleSave(editSection)}
          isSaving={upsert.isPending}
        />
      )}
    </header>
  );
}
