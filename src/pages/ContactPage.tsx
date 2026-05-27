import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { MapPin, Mail, Phone, Truck } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import rdwHero from "@/assets/migrated/rdw-hero.jpg";

const ContactPage = () => {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    interests: [] as string[],
    message: "",
    hearAbout: "",
  });

  const interestOptions = [
    "Support with an Order",
    "Questions",
    "Wholesaling",
    "Media Inquiry",
    "Other Subject",
  ];

  const toggleInterest = (interest: string) => {
    setFormData((prev) => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter((i) => i !== interest)
        : [...prev.interests, interest],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const id = crypto.randomUUID();
      const { error: insertError } = await supabase.from("contact_submissions").insert({
        id,
        name: formData.name,
        email: formData.email,
        phone: formData.phone || null,
        interests: formData.interests,
        message: formData.message,
        hear_about: formData.hearAbout || null,
      });
      if (insertError) throw insertError;

      // Fire-and-forget: admin notification + customer confirmation. Don't block the UX.
      void supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "contact-form-admin-notification",
          recipientEmail: "info@rescuedogwines.com",
          idempotencyKey: `contact-admin-${id}`,
          templateData: {
            name: formData.name,
            email: formData.email,
            phone: formData.phone,
            interests: formData.interests,
            message: formData.message,
            hearAbout: formData.hearAbout,
            submissionId: id,
          },
        },
      });
      void supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "contact-form-confirmation",
          recipientEmail: formData.email,
          idempotencyKey: `contact-confirm-${id}`,
          templateData: { name: formData.name },
        },
      });

      toast({
        title: "Message sent!",
        description: "We'll get back to you as soon as possible.",
      });
      setFormData({ name: "", email: "", phone: "", interests: [], message: "", hearAbout: "" });
    } catch (err) {
      console.error("Contact form submission failed", err);
      toast({
        title: "Couldn't send your message",
        description: "Please try again, or email info@rescuedogwines.com directly.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col">
      <Seo
        title="Contact Rescue Dog Wines"
        description="Get in touch with Rescue Dog Wines — questions, orders, wholesale, and media inquiries. Sustainably crafted Lodi wines that help rescue dogs."
        path="/contact"
        breadcrumbs={[{ name: "Home", path: "/" }, { name: "Contact", path: "/contact" }]}
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "LocalBusiness",
          name: "Rescue Dog Wines",
          url: "https://rescuedogwines.com/contact",
          email: "hello@rescuedogwines.com",
          telephone: "+1-209-365-6150",
          address: {
            "@type": "PostalAddress",
            addressLocality: "Lodi",
            addressRegion: "CA",
            addressCountry: "US",
          },
          areaServed: "US",
        }}
      />
      <Header />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative h-[50vh] min-h-[400px] flex items-center bg-foreground">
          <div
            className="absolute inset-0 bg-cover bg-center opacity-50"
            style={{ backgroundImage: `url(${rdwHero})` }}
          />
          <div className="relative container mx-auto px-4 text-center">
            <p className="text-primary-foreground/80 text-sm tracking-brand uppercase mb-2">Contact Us</p>
            <h1 className="text-4xl md:text-6xl font-bold text-primary-foreground mb-4">Questions & Support</h1>
            <p className="text-primary-foreground/80 text-lg max-w-2xl mx-auto">
              Whether you're inquiring about our wines, interested in partnering with us, or need assistance with your order, we're here to help.
            </p>
          </div>
        </section>

        {/* Contact Info Cards */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
              <div className="border border-border p-6">
                <MapPin className="h-8 w-8 text-primary mb-4" />
                <h3 className="font-bold text-foreground mb-2">Location</h3>
                <p className="text-sm text-muted-foreground">Acampo, CA</p>
              </div>
              <div className="border border-border p-6">
                <Mail className="h-8 w-8 text-primary mb-4" />
                <h3 className="font-bold text-foreground mb-2">Mailing Address</h3>
                <p className="text-sm text-muted-foreground">1461 Main Street #968<br />St. Helena, CA 94574</p>
              </div>
              <div className="border border-border p-6">
                <Truck className="h-8 w-8 text-primary mb-4" />
                <h3 className="font-bold text-foreground mb-2">Delivery Issues</h3>
                <p className="text-sm text-muted-foreground">All wine shipments require an adult signature (21+) with valid ID.</p>
                <a href="mailto:shipping@domowineservices.com" className="text-sm text-primary hover:underline mt-2 inline-block">shipping@domowineservices.com</a>
              </div>
              <div className="border border-border p-6">
                <Phone className="h-8 w-8 text-primary mb-4" />
                <h3 className="font-bold text-foreground mb-2">Winery Operations</h3>
                <p className="text-sm text-muted-foreground">(Trade Issues Only)<br />510-629-1503</p>
              </div>
            </div>

            {/* Contact Form */}
            <div className="max-w-2xl mx-auto">
              <h2 className="text-sm font-bold tracking-brand uppercase text-muted-foreground mb-2">Reach Out</h2>
              <h3 className="text-3xl font-bold text-foreground mb-8">Send Us a Message</h3>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Name *</Label>
                    <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                  </div>
                  <div>
                    <Label htmlFor="email">Email *</Label>
                    <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required />
                  </div>
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                </div>
                <div>
                  <Label className="mb-3 block">I'm Interested In... <span className="text-muted-foreground font-normal">(Check all that apply)</span></Label>
                  <div className="flex flex-wrap gap-4">
                    {interestOptions.map((option) => (
                      <label key={option} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox checked={formData.interests.includes(option)} onCheckedChange={() => toggleInterest(option)} />
                        <span className="text-sm text-foreground">{option}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <Label htmlFor="message">Tell Us What You're Looking For *</Label>
                  <Textarea id="message" rows={5} value={formData.message} onChange={(e) => setFormData({ ...formData, message: e.target.value })} required />
                </div>
                <div>
                  <Label htmlFor="hearAbout">How Did You Hear About Rescue Dog Wines?</Label>
                  <Input id="hearAbout" value={formData.hearAbout} onChange={(e) => setFormData({ ...formData, hearAbout: e.target.value })} />
                </div>
                <Button type="submit" size="lg" disabled={submitting} className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-brand text-sm font-bold px-10 py-6">
                  {submitting ? "Sending..." : "Send Message"}
                </Button>
              </form>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default ContactPage;
