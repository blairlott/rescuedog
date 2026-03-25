import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PageHero } from "@/components/PageHero";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wine, Truck, Users, Mail, MapPin, Globe, FileText, Download, Image } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const regions = [
  { value: "ca-west", label: "California & Western Region", contact: "Jake Lenz" },
  { value: "us-national", label: "US National & Other States", contact: "Jana Ritter" },
  { value: "international", label: "International", contact: "Jana Ritter" },
];

const bottleShots = [
  { name: "2023 Red Blend", url: "https://rescuedogwines.com/wp-content/uploads/2026/01/9-25-25-RedBlend-BS_SMALL-imgupscaler.ai_Sharpen_4K-1.png" },
  { name: "2023 Cabernet Sauvignon", url: "https://rescuedogwines.com/wp-content/uploads/2026/01/9-25-25-Cabernet-BS-SMALL_imgupscaler.ai_Sharpen_4K.png" },
  { name: "2024 Sauvignon Blanc", url: "https://rescuedogwines.com/wp-content/uploads/2025/10/2024-SB-LP-design.png" },
  { name: "2024 Chardonnay", url: "https://rescuedogwines.com/wp-content/uploads/2025/12/9-25-25-Chardonnay-BS-SMALL_imgupscaler.ai_Sharpen_4K-1.png" },
  { name: "2024 Rosé Estate Grown Grenache", url: "https://rescuedogwines.com/wp-content/uploads/2026/01/9-25-25-Rose-BS-SMALL_imgupscaler.ai_Sharpen_4K.png" },
  { name: "2021 Pinot Noir", url: "https://rescuedogwines.com/wp-content/uploads/2023/09/RescueDogWines2021PinotNoir.png" },
  { name: "NV Demi-Sec Sparkling Wine", url: "https://rescuedogwines.com/wp-content/uploads/2023/09/Rescue-Dog-Wines-NV-Demi-Sec-Sparkling.png" },
  { name: "NV Sparkling Rosé", url: "https://rescuedogwines.com/wp-content/uploads/2023/09/Rescue-Dog-Wines-NV-Sparkling-Rose.png" },
];

const techSheets = [
  { name: "2023 Red Blend", url: "https://rescuedogwines.com/wp-content/uploads/2026/01/TechSheetRescueDogWines2023RedBlend.pdf" },
  { name: "2023 Cabernet Sauvignon", url: "https://rescuedogwines.com/wp-content/uploads/2026/01/Tech-Sheet_RDW_2023-Cabernet-Sauvignon_DIGITAL.pdf" },
  { name: "2024 Chardonnay", url: "https://rescuedogwines.com/wp-content/uploads/2026/01/Tech-Sheet_RDW_2024-Chardonnay_DIGITAL.pdf" },
  { name: "2024 Rosé", url: "https://rescuedogwines.com/wp-content/uploads/2026/01/Tech-Sheet_RDW_2024-Rose-Estate-Grown-Grenache.pdf" },
  { name: "2024 Sauvignon Blanc", url: "https://rescuedogwines.com/wp-content/uploads/2026/01/Tech-Sheet-2024-Sauv-Blanc-.pdf" },
  { name: "2021 Pinot Noir", url: "https://rescuedogwines.com/wp-content/uploads/2024/04/Tech-Sheet_RDW_2021-Pinot-Noir_DIGITAL.pdf" },
  { name: "NV Demi-Sec Sparkling Wine", url: "https://rescuedogwines.com/wp-content/uploads/2024/04/Tech-Sheet_RDW_NV-Sparkling-Demi-Sec_DIGITAL.pdf" },
  { name: "NV Sparkling Rosé", url: "https://rescuedogwines.com/wp-content/uploads/2024/04/Tech-Sheet_RDW_NV-Sparkling-Rose_DIGITAL.pdf" },
];


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
  const [formData, setFormData] = useState({ name: '', business: '', email: '', phone: '', region: '', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedRegion = regions.find(r => r.value === formData.region);
    if (!selectedRegion) {
      toast.error("Please select a region.", { position: "top-center" });
      return;
    }

    setIsSubmitting(true);
    try {
      // Insert into database
      const id = crypto.randomUUID();
      const { error: insertError } = await supabase
        .from('wholesale_inquiries')
        .insert({
          id,
          name: formData.name,
          business: formData.business,
          email: formData.email,
          phone: formData.phone || null,
          region: formData.region,
          message: formData.message,
        });

      if (insertError) {
        throw new Error(insertError.message);
      }

      // Trigger notification emails
      const { error: fnError } = await supabase.functions.invoke('send-wholesale-notification', {
        body: { inquiryId: id },
      });

      if (fnError) {
        console.error('Notification error:', fnError);
        // Still show success — the inquiry was saved
      }

      toast.success(`Thank you! Your inquiry has been sent to ${selectedRegion.contact}.`, { position: "top-center" });
      setFormData({ name: '', business: '', email: '', phone: '', region: '', message: '' });
    } catch (err) {
      console.error('Submission error:', err);
      toast.error("Something went wrong. Please try again or email us directly.", { position: "top-center" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedRegion = regions.find(r => r.value === formData.region);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <PageHero
          title="Trade & Wholesale"
          subtitle="Partner with Rescue Dog Wines. Every bottle makes a difference for our furry friends."
        />

        {/* Jump to Brand Assets button */}
        <div className="bg-primary/5 py-4">
          <div className="container mx-auto px-4 text-center">
            <Button
              variant="destructive"
              size="lg"
              onClick={() => document.getElementById('brand-assets')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <Download className="mr-2 h-4 w-4" />
              Brand Assets & Tech Sheets
            </Button>
          </div>
        </div>


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
              Select your region below and your inquiry will be directed to the right sales contact.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Your Region *</label>
                <Select value={formData.region} onValueChange={(val) => setFormData(p => ({ ...p, region: val }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select your region..." />
                  </SelectTrigger>
                  <SelectContent>
                    {regions.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedRegion && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Your inquiry will be sent to <span className="font-medium text-foreground">{selectedRegion.contact}</span>
                  </p>
                )}
              </div>
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
              <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                <Mail className="mr-2 h-4 w-4" />
                {isSubmitting ? 'Submitting...' : 'Submit Inquiry'}
              </Button>
            </form>

            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><Mail className="h-4 w-4" /> info@rescuedogwines.com</span>
              <span className="flex items-center gap-1"><MapPin className="h-4 w-4" /> California, USA</span>
            </div>
          </div>
        </section>

        {/* Brand Assets */}
        <section id="brand-assets" className="py-16">
          <div className="container mx-auto px-4">
            <h2 className="font-display text-3xl font-bold text-foreground text-center mb-4">Brand Assets</h2>
            <p className="text-muted-foreground text-center mb-10 max-w-2xl mx-auto">
              Download bottle shots, tech sheets, and logo assets for your menus, marketing, and displays.
            </p>

            {/* Logo */}
            <div className="max-w-xs mx-auto mb-16 text-center">
              <h3 className="font-display text-xl font-bold text-foreground mb-4">Logo</h3>
              <a href="https://rescuedogwines.com/wp-content/uploads/2023/08/RDW-logo.png" target="_blank" rel="noopener noreferrer" className="block">
                <img
                  src="https://rescuedogwines.com/wp-content/uploads/2023/09/rescue-dog-wines-5.png"
                  alt="Rescue Dog Wines Logo"
                  className="mx-auto h-24 object-contain mb-3"
                />
                <span className="text-sm text-primary hover:underline flex items-center justify-center gap-1">
                  <Download className="h-3 w-3" /> Download Logo
                </span>
              </a>
            </div>

            {/* Bottle Shots */}
            <h3 className="font-display text-xl font-bold text-foreground text-center mb-6">Bottle Shots</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6 max-w-5xl mx-auto mb-16">
              {bottleShots.map((bottle) => (
                <a
                  key={bottle.name}
                  href={bottle.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group text-center"
                >
                  <div className="bg-white rounded-lg border border-border p-4 mb-2 group-hover:border-primary/40 transition-colors">
                    <img src={bottle.url} alt={bottle.name} className="h-48 object-contain mx-auto" loading="lazy" />
                  </div>
                  <p className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">{bottle.name}</p>
                </a>
              ))}
            </div>

            {/* Tech Sheets */}
            <h3 className="font-display text-xl font-bold text-foreground text-center mb-6">Tech Sheets</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
              {techSheets.map((sheet) => (
                <a
                  key={sheet.name}
                  href={sheet.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/40 bg-card transition-colors"
                >
                  <FileText className="h-5 w-5 text-primary shrink-0" />
                  <span className="text-sm text-foreground">{sheet.name}</span>
                </a>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default WholesalePage;
