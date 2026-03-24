import { Link } from "react-router-dom";

export function Footer() {
  return (
    <footer className="border-t border-border py-12 mt-16">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Shop */}
          <div>
            <h4 className="text-sm font-bold tracking-brand uppercase mb-4 text-foreground">Shop</h4>
            <ul className="space-y-2 text-sm text-foreground">
              <li><Link to="/wines" className="hover:text-primary transition-colors">Wine</Link></li>
              <li><Link to="/wines" className="hover:text-primary transition-colors">Wine Club</Link></li>
              <li><Link to="/shop" className="hover:text-primary transition-colors">Store Locator</Link></li>
              <li><Link to="/shop" className="hover:text-primary transition-colors">Rescue Gear</Link></li>
            </ul>
          </div>

          {/* Explore */}
          <div>
            <h4 className="text-sm font-bold tracking-brand uppercase mb-4 text-foreground">Explore</h4>
            <ul className="space-y-2 text-sm text-foreground">
              <li><Link to="/about" className="hover:text-primary transition-colors">About</Link></li>
              <li><Link to="/mission" className="hover:text-primary transition-colors">Mission</Link></li>
              <li><Link to="/events" className="hover:text-primary transition-colors">Events</Link></li>
              <li><Link to="/wholesale" className="hover:text-primary transition-colors">Trade & Media</Link></li>
            </ul>
          </div>

          {/* More */}
          <div>
            <h4 className="text-sm font-bold tracking-brand uppercase mb-4 text-foreground">More</h4>
            <ul className="space-y-2 text-sm text-foreground">
              <li><a href="#" className="hover:text-primary transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Refund Policy</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Shipping Policy</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Terms of Service</a></li>
            </ul>
          </div>

          {/* Newsletter */}
          <div>
            <h4 className="text-sm font-bold tracking-brand uppercase mb-4 text-foreground">Newsletter</h4>
            <form className="flex border-b border-foreground mb-4">
              <input
                type="email"
                placeholder="Enter email here"
                className="flex-1 bg-transparent py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <button type="submit" className="p-2 text-foreground hover:text-primary">→</button>
            </form>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Sign up with your email address to receive promotions, new release updates, and a code for 10% off your first order!
            </p>
            <div className="mt-6">
              <p className="text-xs font-bold tracking-brand uppercase text-foreground mb-3">
                Follow us @rescuedogwines
              </p>
              <div className="flex gap-4 text-foreground">
                <a href="https://facebook.com/rescuedogwines" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors text-lg">f</a>
                <a href="https://pinterest.com/rescuedogwines" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors text-lg">p</a>
                <a href="https://instagram.com/rescuedogwines" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors text-lg">ig</a>
                <a href="https://linkedin.com/company/rescuedogwines" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors text-lg">in</a>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-border mt-8 pt-8 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()}, RescueDogWines.</p>
        </div>
      </div>
    </footer>
  );
}
