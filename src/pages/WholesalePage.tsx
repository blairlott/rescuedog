import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Building2, Wine, Truck, BadgePercent, Users, Phone, Mail, MapPin } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const tiers = [
  { name: "Starter", cases: "6–24 cases", discount: "10% off retail", icon: Wine },
  { name: "Restaurant", cases: "25–99 cases", discount: "15% off retail", icon: Users },
  { name: "Distributor", cases: "100+ cases", discount: "20%+ off retail", icon: Truck },
];

const WholesalePage = () => {
  const [formData, setFormData] = useState({ name: '', business: '', email: '', phone: '', message: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Thank you! We'll be in touch within 1-2 business days.", { position: "top-center" });
    setFormData({ name: '', business: '', email: '', phone: '', message: '' });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {/* Hero */}
        <section className="bg-primary py-20">
          <div className="container mx-auto px-4 text-center">
            <Building2 className="h-12 w-12 text-gold mx-auto mb-4" />
            <h1 className="font-display text-4xl md:text-5xl font-bold text-primary-foreground mb-4">
              Wholesale & B2B
            </h1>
            <p className="text-primary-foreground/80 text-lg max-w-2xl mx-auto">
              Partner with Rescue Dog Wines. Volume pricing, dedicated support, and a brand your customers will love.
            </p>
          </div>
        </section>

        {/* Pricing Tiers */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <h2 className="font-display text-3xl font-bold text-foreground text-center mb-10">Volume Pricing Tiers</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              {tiers.map((tier) => (
                <div key={tier.name} className="bg-card border border-border rounded-lg p-6 text-center hover:border-primary/30 transition-colors">
                  <tier.icon className="h-8 w-8 text-primary mx-auto mb-3" />
                  <h3 className="font-display text-xl font-bold mb-2">{tier.name}</h3>
                  <p className="text-muted-foreground text-sm mb-3">{tier.cases}</p>
                  <div className="flex items-center justify-center gap-1 text-gold font-semibold">
                    <BadgePercent className="h-4 w-4" />
                    {tier.discount}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section className="py-16 bg-card">
          <div className="container mx-auto px-4">
            <h2 className="font-display text-3xl font-bold text-foreground text-center mb-10">Why Partner With Us</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
              {[
                { icon: BadgePercent, title: "Volume Discounts", desc: "Up to 20%+ off retail pricing" },
                { icon: Truck, title: "Flexible Shipping", desc: "Direct delivery or distributor pickup" },
                { icon: Users, title: "Dedicated Account Rep", desc: "Personal support for your business" },
                { icon: Wine, title: "Marketing Support", desc: "Co-branded materials & tasting events" },
              ].map((item) => (
                <div key={item.title} className="text-center p-4">
                  <item.icon className="h-8 w-8 text-primary mx-auto mb-3" />
                  <h3 className="font-display font-semibold mb-1">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Contact Form */}
        <section className="py-16">
          <div className="container mx-auto px-4 max-w-2xl">
            <h2 className="font-display text-3xl font-bold text-foreground text-center mb-3">Get Started</h2>
            <p className="text-muted-foreground text-center mb-8">Fill out the form below and our team will reach out within 1-2 business days.</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Your Name</label>
                  <Input required value={formData.name} onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))} placeholder="John Smith" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Business Name</label>
                  <Input required value={formData.business} onChange={(e) => setFormData(p => ({ ...p, business: e.target.value }))} placeholder="Smith's Restaurant" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Email</label>
                  <Input required type="email" value={formData.email} onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))} placeholder="john@business.com" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Phone</label>
                  <Input value={formData.phone} onChange={(e) => setFormData(p => ({ ...p, phone: e.target.value }))} placeholder="(555) 123-4567" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Tell us about your needs</label>
                <Textarea required value={formData.message} onChange={(e) => setFormData(p => ({ ...p, message: e.target.value }))} rows={4} placeholder="Estimated volume, wine preferences, delivery requirements..." />
              </div>
              <Button type="submit" size="lg" className="w-full bg-primary hover:bg-primary/90">
                <Mail className="mr-2 h-4 w-4" />Submit Wholesale Inquiry
              </Button>
            </form>

            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><Phone className="h-4 w-4" /> Call us directly</span>
              <span className="flex items-center gap-1"><Mail className="h-4 w-4" /> info@rescuedogwines.com</span>
              <span className="flex items-center gap-1"><MapPin className="h-4 w-4" /> California, USA</span>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default WholesalePage;
