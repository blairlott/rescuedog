import { Wine, Heart } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-primary text-primary-foreground py-12 mt-16">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Wine className="h-6 w-6" />
              <span className="font-display text-lg font-bold">Rescue Dog Wines</span>
            </div>
            <p className="text-primary-foreground/70 text-sm leading-relaxed">
              Great wine with a great purpose. A portion of every purchase goes to support dog rescue organizations.
            </p>
          </div>
          <div>
            <h4 className="font-display font-semibold mb-4">Quick Links</h4>
            <ul className="space-y-2 text-sm text-primary-foreground/70">
              <li><a href="/wines" className="hover:text-primary-foreground transition-colors">Our Wines</a></li>
              <li><a href="/shop" className="hover:text-primary-foreground transition-colors">Shop All</a></li>
              <li><a href="/wholesale" className="hover:text-primary-foreground transition-colors">Wholesale</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-display font-semibold mb-4">B2B & Wholesale</h4>
            <p className="text-primary-foreground/70 text-sm leading-relaxed">
              Interested in carrying Rescue Dog Wines? Contact us for wholesale pricing and bulk orders.
            </p>
          </div>
        </div>
        <div className="border-t border-primary-foreground/20 mt-8 pt-8 text-center text-sm text-primary-foreground/50">
          <p className="flex items-center justify-center gap-1">
            Made with <Heart className="h-3 w-3 text-destructive" /> for rescue dogs everywhere
          </p>
        </div>
      </div>
    </footer>
  );
}
