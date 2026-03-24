import { Link } from "react-router-dom";
import { Search, Menu, X, User, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { CartDrawer } from "./CartDrawer";
import rdwLogo from "@/assets/rdw-logo.png";

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-background">
      {/* Announcement Bar */}
      <div className="bg-primary text-primary-foreground text-center py-2.5 px-4">
        <p className="text-sm tracking-wide">
          Use code STOCKUP for 20% off your order of 12 bottles or more (shipping included)!
        </p>
      </div>

      {/* Main Header */}
      <div className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          {/* Left: Search */}
          <div className="flex items-center gap-3">
            <button className="md:hidden p-1 text-foreground" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <button className="hidden md:block p-1 text-foreground hover:text-primary transition-colors">
              <Search className="h-5 w-5" />
            </button>
          </div>

          {/* Center: Logo */}
          <Link to="/" className="flex items-center gap-3">
            <span className="text-xl md:text-2xl font-bold tracking-brand uppercase text-foreground">
              Rescue Dog
            </span>
            {/* Paw print icon placeholder - using text */}
            <svg viewBox="0 0 40 40" className="h-8 w-8 md:h-10 md:w-10 text-primary" fill="currentColor">
              <circle cx="12" cy="8" r="4" />
              <circle cx="28" cy="8" r="4" />
              <circle cx="6" cy="20" r="4" />
              <circle cx="34" cy="20" r="4" />
              <ellipse cx="20" cy="28" rx="10" ry="8" />
            </svg>
            <span className="text-xl md:text-2xl font-bold tracking-brand uppercase text-foreground">
              Wines
            </span>
          </Link>

          {/* Right: Account + Cart */}
          <div className="flex items-center gap-3">
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
              {[
                { label: "SHOP WINES", to: "/wines" },
                { label: "WINE CLUB", to: "/wines" },
                { label: "FIND A STORE", to: "/shop" },
                { label: "MERCH", to: "/shop" },
                { label: "ABOUT", to: "/" },
                { label: "MISSION", to: "/" },
              ].map((item) => (
                <li key={item.label}>
                  <Link
                    to={item.to}
                    className="text-sm font-medium tracking-brand uppercase text-foreground hover:text-primary transition-colors"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </div>

      {/* Mobile Nav */}
      {mobileMenuOpen && (
        <nav className="md:hidden border-b border-border bg-background px-4 py-4 space-y-3">
          {[
            { label: "SHOP WINES", to: "/wines" },
            { label: "WINE CLUB", to: "/wines" },
            { label: "FIND A STORE", to: "/shop" },
            { label: "MERCH", to: "/shop" },
            { label: "ABOUT", to: "/" },
            { label: "MISSION", to: "/" },
            { label: "WHOLESALE / B2B", to: "/wholesale" },
          ].map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className="block text-sm font-medium tracking-brand uppercase text-foreground"
              onClick={() => setMobileMenuOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
