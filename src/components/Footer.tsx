import { Link } from "react-router-dom";
import { T } from "@/components/T";
import { useIsMember } from "@/hooks/useIsMember";

export function Footer() {
  const { isMember } = useIsMember();
  return (
    <footer className="border-t border-border py-14 mt-20 bg-secondary/30">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Shop */}
          <div>
            <h4 className="text-sm font-bold tracking-brand uppercase mb-4 text-foreground"><T>Shop</T></h4>
            <ul className="space-y-2 text-sm text-foreground">
              <li><Link to="/wines" className="hover:text-primary transition-colors"><T>Wine</T></Link></li>
              <li><Link to="/club" className="hover:text-primary transition-colors"><T>Wine Club</T></Link></li>
              <li><Link to="/store-locator" className="hover:text-primary transition-colors"><T>Store Locator</T></Link></li>
              <li><Link to="/merch" className="hover:text-primary transition-colors"><T>Rescue Gear</T></Link></li>
            </ul>
          </div>

          {/* Explore */}
          <div>
            <h4 className="text-sm font-bold tracking-brand uppercase mb-4 text-foreground"><T>Explore</T></h4>
            <ul className="space-y-2 text-sm text-foreground">
              <li><Link to="/about" className="hover:text-primary transition-colors"><T>About</T></Link></li>
              <li><Link to="/mission" className="hover:text-primary transition-colors"><T>Mission</T></Link></li>
              <li><Link to="/vineyard" className="hover:text-primary transition-colors"><T>Vineyard</T></Link></li>
              <li><Link to="/events" className="hover:text-primary transition-colors"><T>Events</T></Link></li>
              <li><Link to="/compare" className="hover:text-primary transition-colors"><T>Compare Brands</T></Link></li>
              <li><Link to="/contact" className="hover:text-primary transition-colors"><T>Contact</T></Link></li>
            </ul>
          </div>

          {/* More */}
          <div>
            <h4 className="text-sm font-bold tracking-brand uppercase mb-4 text-foreground"><T>More</T></h4>
            <ul className="space-y-2 text-sm text-foreground">
              <li><Link to="/wholesale" className="hover:text-primary transition-colors"><T>Wholesale / B2B</T></Link></li>
              <li><Link to="/donation" className="hover:text-primary transition-colors"><T>Donation Request</T></Link></li>
              <li><Link to="/ambassadors" className="hover:text-primary transition-colors"><T>Become an Ambassador</T></Link></li>
              <li><Link to="/sell" className="hover:text-primary transition-colors"><T>Sell on Rescue Dog</T></Link></li>
              {isMember && (
                <li><Link to="/policies#membership" className="hover:text-primary transition-colors"><T>Membership Policy</T></Link></li>
              )}
              <li><Link to="/policies#privacy" className="hover:text-primary transition-colors"><T>Privacy Policy</T></Link></li>
              <li><Link to="/policies#refund" className="hover:text-primary transition-colors"><T>Refund Policy</T></Link></li>
              <li><Link to="/policies#shipping" className="hover:text-primary transition-colors"><T>Shipping Policy</T></Link></li>
              <li><Link to="/policies#terms" className="hover:text-primary transition-colors"><T>Terms of Service</T></Link></li>
              <li><Link to="/admin" className="hover:text-primary transition-colors"><T>Admin</T></Link></li>
            </ul>
          </div>

          {/* Newsletter */}
          <div>
            <h4 className="text-sm font-bold tracking-brand uppercase mb-4 text-foreground"><T>Newsletter</T></h4>
            <form className="flex border-b border-foreground mb-4">
              <input
                type="email"
                placeholder="Enter email here"
                className="flex-1 bg-transparent py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <button type="submit" className="p-2 text-foreground hover:text-primary">→</button>
            </form>
            <p className="text-xs text-muted-foreground leading-relaxed">
              <T>Sign up with your email address to receive promotions, new release updates, and a code for 10% off your first order!</T>
            </p>
            <div className="mt-6">
              <p className="text-xs font-bold tracking-brand uppercase text-foreground mb-3">
                <T>Follow us @rescuedogwines</T>
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

        <div className="border-t border-border mt-10 pt-8 text-xs text-muted-foreground tracking-wide">
          <p>© {new Date().getFullYear()} RescueDogWines. <T>All rights reserved.</T></p>
        </div>
      </div>
    </footer>
  );
}
