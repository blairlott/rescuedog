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
          <Link to="/" className="flex-1 flex justify-center px-4">
            <img src={rdwLogo} alt="Rescue Dog Wines" className="h-10 md:h-14 max-w-[280px] md:max-w-[400px] w-auto object-contain" />
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
