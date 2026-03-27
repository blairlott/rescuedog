import { useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Wine, Package, Truck, Gift, Star, RefreshCw, ArrowRight, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link } from "react-router-dom";

const tiers = [
  {
    id: "explorer",
    name: "Explorer",
    bottles: 3,
    pricePerShipment: 59.99,
    originalPrice: 74.99,
    description: "Perfect for casual sippers. Discover new wines each delivery.",
    icon: Wine,
    popular: false,
  },
  {
    id: "enthusiast",
    name: "Enthusiast",
    bottles: 6,
    pricePerShipment: 109.99,
    originalPrice: 149.99,
    description: "Our most popular choice. A half-case of curated selections with the best value.",
    icon: Package,
    popular: true,
  },
  {
    id: "collector",
    name: "Collector",
    bottles: 12,
    pricePerShipment: 199.99,
    originalPrice: 299.99,
    description: "The ultimate wine experience. A full case with premium selections and maximum savings.",
    icon: Star,
    popular: false,
  },
];

const frequencies = [
  { value: "monthly", label: "Monthly", discount: "Best Value" },
  { value: "bimonthly", label: "Every 2 Months", discount: "" },
  { value: "quarterly", label: "Quarterly", discount: "" },
];

const wineTypes = ["Red", "White", "Rosé", "Sparkling", "Surprise Me"];

const SubscribePage = () => {
  const [selectedTier, setSelectedTier] = useState("enthusiast");
  const [frequency, setFrequency] = useState("monthly");
  const [preferences, setPreferences] = useState<string[]>(["Surprise Me"]);
  const [formData, setFormData] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const togglePreference = (pref: string) => {
    setPreferences(prev =>
      prev.includes(pref)
        ? prev.filter(p => p !== pref)
        : [...prev.filter(p => p !== "Surprise Me"), pref]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.firstName || !formData.lastName || !formData.email) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);
    try {
      const tier = tiers.find(t => t.id === selectedTier);
      const { error } = await supabase.from("subscription_signups").insert({
        first_name: formData.firstName,
        last_name: formData.lastName,
        email: formData.email,
        phone: formData.phone || null,
        subscription_type: "curated_box",
        tier: selectedTier,
        frequency,
        wine_preferences: preferences,
        discount_percent: Math.round(((tier!.originalPrice - tier!.pricePerShipment) / tier!.originalPrice) * 100),
      } as any);

      if (error) throw error;
      setIsSubmitted(true);
      toast.success("Subscription request submitted! We'll be in touch soon.");
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center py-16">
          <div className="text-center max-w-md mx-auto px-4">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-950/50 flex items-center justify-center mx-auto mb-6">
              <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-4">You're All Set!</h1>
            <p className="text-muted-foreground mb-6">
              We've received your subscription request. Our team will reach out within 24 hours to finalize your first shipment.
            </p>
            <div className="flex gap-3 justify-center">
              <Button asChild variant="outline">
                <Link to="/">Continue Shopping</Link>
              </Button>
              <Button asChild>
                <Link to="/club">Explore Wine Club</Link>
              </Button>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const selectedTierData = tiers.find(t => t.id === selectedTier)!;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative py-16 md:py-24 bg-foreground text-background">
          <div className="container mx-auto px-4 text-center">
            <div className="inline-flex items-center gap-2 bg-primary/20 text-primary-foreground px-4 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wider mb-6">
              <RefreshCw className="w-3.5 h-3.5" />
              Subscribe & Save
            </div>
            <h1 className="text-4xl md:text-6xl font-bold mb-4">
              Wine, Delivered on <span className="text-primary">Your Schedule</span>
            </h1>
            <p className="text-background/70 text-lg max-w-2xl mx-auto mb-8">
              Choose your perfect box, set your delivery frequency, and save up to 33% on every shipment. 
              Cancel or skip anytime — no commitments.
            </p>
            <div className="flex flex-wrap gap-6 justify-center text-sm text-background/60">
              {[
                { icon: Truck, text: "Shipping Included" },
                { icon: Gift, text: "Save Up to 33%" },
                { icon: RefreshCw, text: "Skip or Cancel Anytime" },
              ].map(p => (
                <div key={p.text} className="flex items-center gap-2">
                  <p.icon className="w-4 h-4" />
                  <span>{p.text}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Tier Selection */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="text-center mb-10">
              <h2 className="text-sm font-bold tracking-wider uppercase text-muted-foreground mb-3">Step 1</h2>
              <h3 className="text-3xl font-bold text-foreground">Choose Your Box</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {tiers.map(tier => (
                <button
                  key={tier.id}
                  onClick={() => setSelectedTier(tier.id)}
                  className={`relative text-left p-6 border-2 transition-all duration-200 ${
                    selectedTier === tier.id
                      ? 'border-primary bg-primary/5 shadow-lg'
                      : 'border-border hover:border-primary/30'
                  }`}
                >
                  {tier.popular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider px-3 py-1">
                      Most Popular
                    </span>
                  )}
                  <tier.icon className={`w-8 h-8 mb-4 ${selectedTier === tier.id ? 'text-primary' : 'text-muted-foreground'}`} />
                  <h4 className="text-xl font-bold text-foreground mb-1">{tier.name}</h4>
                  <p className="text-xs text-muted-foreground mb-4">{tier.bottles} bottles per shipment</p>
                  <div className="mb-3">
                    <span className="text-2xl font-bold text-foreground">${tier.pricePerShipment}</span>
                    <span className="text-sm text-muted-foreground line-through ml-2">${tier.originalPrice}</span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{tier.description}</p>
                  <div className="mt-4 text-xs font-semibold text-green-600 dark:text-green-400">
                    Save ${(tier.originalPrice - tier.pricePerShipment).toFixed(2)} per shipment
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Frequency & Preferences */}
        <section className="py-16 bg-secondary">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12">
              {/* Frequency */}
              <div>
                <h2 className="text-sm font-bold tracking-wider uppercase text-muted-foreground mb-3">Step 2</h2>
                <h3 className="text-2xl font-bold text-foreground mb-6">Delivery Frequency</h3>
                <div className="space-y-3">
                  {frequencies.map(f => (
                    <button
                      key={f.value}
                      onClick={() => setFrequency(f.value)}
                      className={`w-full flex items-center justify-between p-4 border transition-all ${
                        frequency === f.value
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/30'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          frequency === f.value ? 'border-primary' : 'border-muted-foreground'
                        }`}>
                          {frequency === f.value && <div className="w-2 h-2 rounded-full bg-primary" />}
                        </div>
                        <span className="font-medium">{f.label}</span>
                      </div>
                      {f.discount && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-sm">
                          {f.discount}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Wine Preferences */}
              <div>
                <h2 className="text-sm font-bold tracking-wider uppercase text-muted-foreground mb-3">Step 3</h2>
                <h3 className="text-2xl font-bold text-foreground mb-6">Wine Preferences</h3>
                <p className="text-sm text-muted-foreground mb-4">Select the types of wine you enjoy (pick as many as you like):</p>
                <div className="space-y-3">
                  {wineTypes.map(type => (
                    <label
                      key={type}
                      className={`flex items-center gap-3 p-3 border cursor-pointer transition-all ${
                        preferences.includes(type) ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                      }`}
                    >
                      <Checkbox
                        checked={preferences.includes(type)}
                        onCheckedChange={() => togglePreference(type)}
                      />
                      <span className="text-sm font-medium">{type}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Summary & Contact Form */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12">
              {/* Order Summary */}
              <div>
                <h2 className="text-sm font-bold tracking-wider uppercase text-muted-foreground mb-3">Summary</h2>
                <h3 className="text-2xl font-bold text-foreground mb-6">Your Subscription</h3>
                <div className="border border-border p-6 space-y-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Plan</span>
                    <span className="font-semibold">{selectedTierData.name} ({selectedTierData.bottles} bottles)</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Frequency</span>
                    <span className="font-semibold">{frequencies.find(f => f.value === frequency)?.label}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Preferences</span>
                    <span className="font-semibold text-right">{preferences.join(", ")}</span>
                  </div>
                  <div className="border-t border-border pt-4">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Regular Price</span>
                      <span className="text-muted-foreground line-through">${selectedTierData.originalPrice}</span>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="font-bold text-lg">Your Price</span>
                      <span className="font-bold text-lg text-primary">${selectedTierData.pricePerShipment}</span>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-sm text-green-600 dark:text-green-400 font-semibold">You Save</span>
                      <span className="text-sm text-green-600 dark:text-green-400 font-semibold">
                        ${(selectedTierData.originalPrice - selectedTierData.pricePerShipment).toFixed(2)} per shipment
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t border-border">
                    <Truck className="w-3.5 h-3.5" />
                    <span>Free shipping included on every delivery</span>
                  </div>
                </div>
              </div>

              {/* Contact Form */}
              <div>
                <h2 className="text-sm font-bold tracking-wider uppercase text-muted-foreground mb-3">Step 4</h2>
                <h3 className="text-2xl font-bold text-foreground mb-6">Your Information</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="firstName" className="text-xs font-medium">First Name *</Label>
                      <Input id="firstName" required value={formData.firstName} onChange={e => setFormData(d => ({ ...d, firstName: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="lastName" className="text-xs font-medium">Last Name *</Label>
                      <Input id="lastName" required value={formData.lastName} onChange={e => setFormData(d => ({ ...d, lastName: e.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-xs font-medium">Email *</Label>
                    <Input id="email" type="email" required value={formData.email} onChange={e => setFormData(d => ({ ...d, email: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="phone" className="text-xs font-medium">Phone (optional)</Label>
                    <Input id="phone" type="tel" value={formData.phone} onChange={e => setFormData(d => ({ ...d, phone: e.target.value }))} />
                  </div>
                  <Button type="submit" size="lg" className="w-full bg-primary hover:bg-primary/90 uppercase tracking-wider text-sm font-bold" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        Start My Subscription <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                  <p className="text-[10px] text-muted-foreground text-center">
                    By subscribing, you confirm you are 21+ years of age. You can skip or cancel anytime.
                  </p>
                </form>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default SubscribePage;
