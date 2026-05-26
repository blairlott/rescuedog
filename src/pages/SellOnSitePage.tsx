import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Footer } from "@/components/Footer";
import { toast } from "sonner";
import { CheckCircle2, Store, ShieldCheck, Truck, BadgeCheck } from "lucide-react";

const CATEGORIES = ["Apparel", "Drinkware", "Pet Gear", "Home & Lifestyle", "Accessories", "Headwear", "Stickers & Stationery", "Food & Treats", "Other"];
const FULFILLMENT = [
  { v: "self_ship", l: "I ship from my own warehouse" },
  { v: "dropship", l: "Drop-ship via my own vendor" },
  { v: "warehouse_to_vinoshipper", l: "Send inventory to your fulfillment partner" },
  { v: "print_on_demand", l: "Print-on-demand (Printify, Printful, etc.)" },
];

export default function SellOnSitePage() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cats, setCats] = useState<string[]>([]);
  const [agreed, setAgreed] = useState(false);
  const [usFulfilled, setUsFulfilled] = useState(false);

  const toggleCat = (c: string) =>
    setCats((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!agreed) return toast.error("Please agree to the marketplace terms.");
    if (!usFulfilled) return toast.error("Marketplace partners must fulfill orders from within the United States.");
    setSubmitting(true);
    const f = new FormData(e.currentTarget);
    const payload = {
      business_name: String(f.get("business_name") ?? ""),
      contact_name: String(f.get("contact_name") ?? ""),
      contact_email: String(f.get("contact_email") ?? ""),
      contact_phone: String(f.get("contact_phone") ?? "") || null,
      website: String(f.get("website") ?? "") || null,
      business_type: String(f.get("business_type") ?? "") || null,
      ein_or_tax_id: String(f.get("ein_or_tax_id") ?? "") || null,
      years_in_business: Number(f.get("years_in_business") || 0) || null,
      product_categories: cats,
      product_description: String(f.get("product_description") ?? ""),
      est_monthly_units: Number(f.get("est_monthly_units") || 0) || null,
      fulfillment_model: String(f.get("fulfillment_model") ?? "self_ship"),
      shipping_regions: String(f.get("shipping_regions") ?? "")
        .split(",").map((s) => s.trim()).filter(Boolean),
      sample_product_urls: String(f.get("sample_product_urls") ?? "")
        .split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
      brand_story: String(f.get("brand_story") ?? "") || null,
      why_partner: String(f.get("why_partner") ?? "") || null,
      social_links: {
        instagram: String(f.get("instagram") ?? "") || null,
        facebook: String(f.get("facebook") ?? "") || null,
        tiktok: String(f.get("tiktok") ?? "") || null,
      },
      agreed_to_terms: true,
      fulfills_from_us: true,
    };
    const id = crypto.randomUUID();
    const { error } = await supabase
      .from("marketplace_partner_applications")
      .insert({ ...payload, id } as any);
    setSubmitting(false);
    if (error) return toast.error(error.message);

    // Fire-and-forget: admin notification + applicant confirmation.
    void supabase.functions.invoke("send-transactional-email", {
      body: {
        templateName: "marketplace-application-admin-notification",
        recipientEmail: "info@rescuedogwines.com",
        idempotencyKey: `marketplace-admin-${id}`,
        templateData: {
          businessName: payload.business_name,
          contactName: payload.contact_name,
          contactEmail: payload.contact_email,
          contactPhone: payload.contact_phone,
          website: payload.website,
          businessType: payload.business_type,
          yearsInBusiness: payload.years_in_business,
          categories: payload.product_categories,
          productDescription: payload.product_description,
          estMonthlyUnits: payload.est_monthly_units,
          fulfillmentModel: payload.fulfillment_model,
          shippingRegions: payload.shipping_regions,
          brandStory: payload.brand_story,
          whyPartner: payload.why_partner,
          submissionId: id,
        },
      },
    });
    if (payload.contact_email) {
      void supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "marketplace-application-confirmation",
          recipientEmail: payload.contact_email,
          idempotencyKey: `marketplace-confirm-${id}`,
          templateData: {
            businessName: payload.business_name,
            contactName: payload.contact_name,
          },
        },
      });
    }

    setSubmitted(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-dvh bg-background">
      {/* Hero */}
      <section className="bg-secondary/40 border-b border-border">
        <div className="container mx-auto px-4 py-16 max-w-5xl">
          <div className="flex items-center gap-2 text-xs uppercase tracking-brand text-muted-foreground mb-4">
            <Store className="h-4 w-4" /> Marketplace Partner Program
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-brand uppercase text-foreground mb-4">
            Sell on Rescue Dog
          </h1>
          <p className="text-base md:text-lg text-foreground/80 max-w-2xl">
            Join our curated marketplace of mission-aligned brands. Reach our wine-loving, dog-loving community — every approved product helps fund rescue partners.
          </p>
          <div className="grid sm:grid-cols-3 gap-4 mt-10">
            <Card className="p-4"><BadgeCheck className="h-5 w-5 text-primary mb-2" /><h3 className="font-bold text-sm uppercase tracking-brand">Curated</h3><p className="text-xs text-muted-foreground mt-1">Every brand & product is reviewed by our team.</p></Card>
            <Card className="p-4"><Truck className="h-5 w-5 text-primary mb-2" /><h3 className="font-bold text-sm uppercase tracking-brand">Flexible Fulfillment</h3><p className="text-xs text-muted-foreground mt-1">Self-ship, drop-ship, POD, or send inventory to us.</p></Card>
            <Card className="p-4"><ShieldCheck className="h-5 w-5 text-primary mb-2" /><h3 className="font-bold text-sm uppercase tracking-brand">One Checkout</h3><p className="text-xs text-muted-foreground mt-1">Customers buy through our unified cart. We pay you out monthly.</p></Card>
          </div>
        </div>
      </section>

      {/* Form / Success */}
      <section className="container mx-auto px-4 py-12 max-w-3xl">
        {submitted ? (
          <Card className="p-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-4" />
            <h2 className="text-2xl font-bold tracking-brand uppercase mb-2">Application Received</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Thanks! Our team reviews every application personally and will be in touch within 5 business days. If approved, you'll get a partner portal link to submit individual products for review.
            </p>
            <Button asChild className="mt-6"><Link to="/">Back to home</Link></Button>
          </Card>
        ) : (
          <form onSubmit={onSubmit} className="space-y-6">
            <Card className="p-6 space-y-4">
              <h3 className="text-lg font-bold tracking-brand uppercase">Business</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                <div><Label>Business name *</Label><Input name="business_name" required /></div>
                <div><Label>Website</Label><Input name="website" type="url" placeholder="https://" /></div>
                <div><Label>Business type</Label><Input name="business_type" placeholder="LLC, Sole prop, Brand, Maker" /></div>
                <div><Label>EIN / Tax ID</Label><Input name="ein_or_tax_id" /></div>
                <div><Label>Years in business</Label><Input name="years_in_business" type="number" min="0" /></div>
              </div>
            </Card>

            <Card className="p-6 space-y-4">
              <h3 className="text-lg font-bold tracking-brand uppercase">Contact</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                <div><Label>Your name *</Label><Input name="contact_name" required /></div>
                <div><Label>Email *</Label><Input name="contact_email" type="email" required /></div>
                <div><Label>Phone</Label><Input name="contact_phone" type="tel" /></div>
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                <div><Label>Instagram</Label><Input name="instagram" placeholder="@handle" /></div>
                <div><Label>Facebook</Label><Input name="facebook" /></div>
                <div><Label>TikTok</Label><Input name="tiktok" placeholder="@handle" /></div>
              </div>
            </Card>

            <Card className="p-6 space-y-4">
              <h3 className="text-lg font-bold tracking-brand uppercase">Products</h3>
              <div>
                <Label>Categories you sell *</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {CATEGORIES.map((c) => (
                    <button type="button" key={c} onClick={() => toggleCat(c)}
                      className={`text-xs px-3 py-1.5 border ${cats.includes(c) ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div><Label>Tell us about your products *</Label>
                <Textarea name="product_description" required rows={4} placeholder="What do you make? Materials, story, what makes it special..." />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div><Label>Estimated monthly units</Label><Input name="est_monthly_units" type="number" min="0" /></div>
                <div><Label>Shipping regions</Label><Input name="shipping_regions" placeholder="US, Canada" /></div>
              </div>
              <div><Label>Sample product URLs</Label>
                <Textarea name="sample_product_urls" rows={3} placeholder="One URL per line (or comma-separated)" />
              </div>
            </Card>

            <Card className="p-6 space-y-4">
              <h3 className="text-lg font-bold tracking-brand uppercase">Fulfillment</h3>
              <div className="border border-primary/40 bg-primary/5 p-3 text-sm">
                <strong className="block text-primary uppercase tracking-brand text-xs mb-1">US Fulfillment Required</strong>
                We only partner with brands and drop-shippers that pick, pack, and ship from within the United States. International-only fulfillment will be declined.
              </div>
              <div>
                <Label>How will you fulfill orders? *</Label>
                <div className="grid gap-2 mt-2">
                  {FULFILLMENT.map((o, i) => (
                    <label key={o.v} className="flex items-start gap-2 text-sm border border-border p-3 cursor-pointer hover:bg-muted/40">
                      <input type="radio" name="fulfillment_model" value={o.v} defaultChecked={i === 0} className="mt-1" />
                      <span>{o.l}</span>
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex items-start gap-3 text-sm">
                <Checkbox checked={usFulfilled} onCheckedChange={(v) => setUsFulfilled(Boolean(v))} className="mt-1" />
                <span>
                  I confirm that 100% of customer orders will ship from a warehouse, fulfillment center, or print provider located in the United States. *
                </span>
              </label>
            </Card>

            <Card className="p-6 space-y-4">
              <h3 className="text-lg font-bold tracking-brand uppercase">Story</h3>
              <div><Label>Brand story</Label>
                <Textarea name="brand_story" rows={3} />
              </div>
              <div><Label>Why do you want to partner with Rescue Dog?</Label>
                <Textarea name="why_partner" rows={3} />
              </div>
            </Card>

            <Card className="p-6 space-y-4">
              <label className="flex items-start gap-3 text-sm">
                <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(Boolean(v))} className="mt-1" />
                <span>
                  I agree to the marketplace partner terms: every product I submit must be approved by Rescue Dog admins before going live. Rescue Dog reserves the right to remove any product or partner at any time. Payouts processed monthly net of platform fees.
                </span>
              </label>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Submitting…" : "Submit Application"}
              </Button>
            </Card>
          </form>
        )}
      </section>

      <Footer />
    </div>
  );
}