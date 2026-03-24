import { Link } from "react-router-dom";
import { Wine, Menu, X } from "lucide-react";
import { useState } from "react";
import { CartDrawer } from "./CartDrawer";

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <Wine className="h-7 w-7 text-primary" />
          <span className="font-display text-xl font-bold text-foreground tracking-tight">
            Rescue Dog Wines
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8">
          <Link to="/" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Home
          </Link>
          <Link to="/wines" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Wines
          </Link>
          <Link to="/shop" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Shop All
          </Link>
          <Link to="/wholesale" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Wholesale / B2B
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <CartDrawer />
          <button
            className="md:hidden p-2 text-foreground"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileMenuOpen && (
        <nav className="md:hidden border-t border-border bg-background px-4 py-4 space-y-3">
          <Link to="/" className="block text-sm font-medium text-foreground" onClick={() => setMobileMenuOpen(false)}>Home</Link>
          <Link to="/wines" className="block text-sm font-medium text-foreground" onClick={() => setMobileMenuOpen(false)}>Wines</Link>
          <Link to="/shop" className="block text-sm font-medium text-foreground" onClick={() => setMobileMenuOpen(false)}>Shop All</Link>
          <Link to="/wholesale" className="block text-sm font-medium text-foreground" onClick={() => setMobileMenuOpen(false)}>Wholesale / B2B</Link>
        </nav>
      )}
    </header>
  );
}
