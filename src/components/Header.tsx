import { Link, useLocation } from "react-router-dom";
import { Search, Menu, X, User, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { CartDrawer } from "./CartDrawer";
import rdwLogo from "@/assets/rdw-logo.png";
import rescueDogLogo from "@/assets/rescue-dog-logo.png";
import { isRescueDogDomain } from "@/lib/productUtils";

interface NavItem {
  label: string;
  to: string;
  external?: boolean;
}

const navItems: NavItem[] = [
  { label: "SHOP WINES", to: "/wines" },
  { label: "WINE CLUB", to: "/club" },
  { label: "FIND A STORE", to: "/store-locator" },
  { label: "MERCH", to: "/merch" },
  { label: "ABOUT", to: "/about" },
  { label: "MISSION", to: "/mission" },
  { label: "EVENTS", to: "/events" },
];

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const merchPaths = ["/merch", "/about", "/mission", "/donation"];
  const isMerch = merchPaths.includes(location.pathname) || isRescueDogDomain();
  const logo = isMerch ? rescueDogLogo : "https://rescuedogwines.myshopify.com/cdn/shop/files/rdw_black_4x_7dece252-0ae7-4039-b832-0a86b7adec60.png?v=1742847391";
  const logoAlt = isMerch ? "Rescue Dog" : "Rescue Dog Wines";

  return (
    <header className="sticky top-0 z-50 bg-background">
      {/* Announcement Bar */}
      <div className="bg-primary text-primary-foreground text-center py-2.5 px-4">
        <p className="text-sm tracking-wide">
          {isMerch
            ? "50% of our profits supports rescue organizations."
            : "Use code STOCKUP for 20% off your order of 12 bottles or more (shipping included)!"}
        </p>
      </div>

      {/* Main Header */}
      <div className="border-b border-border">
        <div className="container mx-auto px-4 py-4 grid grid-cols-[72px_1fr_72px] md:grid-cols-[96px_1fr_96px] items-center gap-2">
          {/* Left: Search */}
          <div className="flex items-center gap-3 min-w-0">
            <button className="md:hidden p-1 text-foreground" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <button className="hidden md:block p-1 text-foreground hover:text-primary transition-colors">
              <Search className="h-5 w-5" />
            </button>
          </div>

          {/* Center: Logo */}
          <Link to={isMerch ? "/merch" : "/"} className="flex justify-center px-1 md:px-2 min-w-0">
            <img
              src={logo}
              alt={logoAlt}
              className="w-full max-w-[320px] md:max-w-[500px] h-auto object-contain"
            />
          </Link>

          {/* Right: Account + Cart */}
          <div className="flex items-center justify-end gap-3 min-w-0">
            <Link to="#" className="hidden md:block p-1 text-foreground hover:text-primary transition-colors">
              <User className="h-5 w-5" />
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
                      {item.label}
                    </a>
                  ) : (
                    <Link
                      to={item.to}
                      className={`text-sm font-medium tracking-brand uppercase transition-colors ${
                        location.pathname === item.to ? "text-primary" : "text-foreground hover:text-primary"
                      }`}
                    >
                      {item.label}
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
          {[...navItems, { label: "WHOLESALE / B2B", to: "/wholesale" } as NavItem].map((item) => (
            item.external ? (
              <a
                key={item.label}
                href={item.to}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sm font-medium tracking-brand uppercase text-foreground"
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.label}
              </a>
            ) : (
              <Link
                key={item.label}
                to={item.to}
                className="block text-sm font-medium tracking-brand uppercase text-foreground"
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.label}
              </Link>
            )
          ))}
        </nav>
      )}
    </header>
  );
}
