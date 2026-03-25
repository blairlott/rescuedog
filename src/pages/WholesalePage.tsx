import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PageHero } from "@/components/PageHero";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Wine, Truck, Users, Phone, Mail, MapPin, Globe, FileText, Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const salesContacts = [
  {
    name: "Jana Ritter",
    title: "National Commercial Director",
    scope: "USA & International Trade",
    icon: Globe,
  },
  {
    name: "Jake Lenz",
    title: "Western Region Head of Sales",
    scope: "California & Western Region",
    icon: MapPin,
  },
];

const WholesalePage = () => {
  const [formData, setFormData] = useState({ name: '', business: '', email: '', phone: '', message: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Thank you! Our team will be in touch shortly.", { position: "top-center" });
    setFormData({ name: '', business: '', email: '', phone: '', message: '' });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <PageHero
          title="Trade & Wholesale"
          subtitle="Partner with Rescue Dog Wines. Every bottle makes a difference for our furry friends."
        />

        {/* Distribution Info */}
        <section className="py-16">
          <div className="container mx-auto px-4 max-w-4xl">
            <h2 className="font-display text-3xl font-bold text-foreground text-center mb-10">Distribution</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-card border border-border rounded-lg p-8 text-center">
                <MapPin className="h-8 w-8 text-primary mx-auto mb-4" />
                <h3 className="font-display text-xl font-bold mb-2">California</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  We self-distribute directly to restaurants and retailers throughout California via Lott Family Cellars, Inc. / Rescue Dog Wines.
                </p>
              </div>
              <div className="bg-card border border-border rounded-lg p-8 text-center">
                <Globe className="h-8 w-8 text-primary mx-auto mb-4" />
                <h3 className="font-display text-xl font-bold mb-2">All Other States</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Outside of California, we are proudly partnered with <strong>Zonin1821</strong> for distribution across the United States.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Sales Leadership */}
        <section className="py-16 bg-card">
          <div className="container mx-auto px-4 max-w-4xl">
            <h2 className="font-display text-3xl font-bold text-foreground text-center mb-10">Sales Leadership</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {salesContacts.map((contact) => (
                <div key={contact.name} className="border border-border rounded-lg p-6 text-center bg-background">
                  <contact.icon className="h-8 w-8 text-primary mx-auto mb-3" />
                  <h3 className="font-display text-lg font-bold">{contact.name}</h3>
                  <p className="text-sm text-primary/80 font-medium mb-1">{contact.title}</p>
                  <p className="text-sm text-muted-foreground">{contact.scope}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Why Partner */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <h2 className="font-display text-3xl font-bold text-foreground text-center mb-10">Why Partner With Us</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
              {[
                { icon: Wine, title: "Award-Winning Wines", desc: "Critically acclaimed wines your customers will love" },
                { icon: Truck, title: "Flexible Fulfillment", desc: "Direct delivery in CA or via Zonin1821 nationally" },
                { icon: Users, title: "Dedicated Support", desc: "Personal sales reps for your region" },
                { icon: FileText, title: "Marketing Support", desc: "Co-branded materials & tasting event assistance" },
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
        <section className="py-16 bg-card">
          <div className="container mx-auto px-4 max-w-2xl">
            <h2 className="font-display text-3xl font-bold text-foreground text-center mb-3">Get In Touch</h2>
            <p className="text-muted-foreground text-center mb-8">
              Interested in carrying Rescue Dog Wines? Fill out the form below and our sales team will reach out.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Your Name *</label>
                  <Input required value={formData.name} onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))} placeholder="John Smith" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Business Name *</label>
                  <Input required value={formData.business} onChange={(e) => setFormData(p => ({ ...p, business: e.target.value }))} placeholder="Smith's Restaurant" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Email *</label>
                  <Input required type="email" value={formData.email} onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))} placeholder="john@business.com" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Phone</label>
                  <Input value={formData.phone} onChange={(e) => setFormData(p => ({ ...p, phone: e.target.value }))} placeholder="(555) 123-4567" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Tell us what you're looking to achieve *</label>
                <Textarea required value={formData.message} onChange={(e) => setFormData(p => ({ ...p, message: e.target.value }))} rows={4} placeholder="Wine preferences, estimated volume, delivery requirements..." />
              </div>
              <Button type="submit" size="lg" className="w-full">
                <Mail className="mr-2 h-4 w-4" />Submit Inquiry
              </Button>
            </form>

            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center text-sm text-muted-foreground">
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
