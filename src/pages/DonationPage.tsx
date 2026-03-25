import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Heart } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const DonationPage = () => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    orgName: "",
    contactName: "",
    email: "",
    phone: "",
    city: "",
    state: "",
    website: "",
    eventDate: "",
    eventDescription: "",
    taxId: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast({
      title: "Request submitted!",
      description: "We'll review your donation request and get back to you soon.",
    });
    setFormData({ orgName: "", contactName: "", email: "", phone: "", city: "", state: "", website: "", eventDate: "", eventDescription: "", taxId: "" });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative h-[40vh] min-h-[300px] flex items-center bg-foreground">
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=1920')] bg-cover bg-center opacity-50" />
          <div className="relative container mx-auto px-4 text-center">
            <h1 className="text-4xl md:text-6xl font-bold text-primary-foreground mb-4">Donation Request</h1>
            <p className="text-primary-foreground/80 text-lg max-w-2xl mx-auto">
              Partner with Rescue Dog Wines — request a wine donation for your rescue organization's fundraising event.
            </p>
          </div>
        </section>

        {/* Info + Form */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto">
              <div className="bg-secondary border border-border p-6 mb-10">
                <div className="flex items-start gap-4">
                  <Heart className="h-8 w-8 text-primary flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-bold text-foreground mb-2">Important Information</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Donation requests are currently only available for organizations in California. Please provide 501(c)(3) documentation. We appreciate your understanding that we are a small, family-owned winery with limited resources.
                    </p>
                  </div>
                </div>
              </div>

              <h2 className="text-2xl font-bold text-foreground mb-6">Submit a Request</h2>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="orgName">Organization Name *</Label>
                    <Input id="orgName" value={formData.orgName} onChange={(e) => setFormData({ ...formData, orgName: e.target.value })} required />
                  </div>
                  <div>
                    <Label htmlFor="contactName">Contact Name *</Label>
                    <Input id="contactName" value={formData.contactName} onChange={(e) => setFormData({ ...formData, contactName: e.target.value })} required />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="donEmail">Email *</Label>
                    <Input id="donEmail" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required />
                  </div>
                  <div>
                    <Label htmlFor="donPhone">Phone</Label>
                    <Input id="donPhone" type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="city">City *</Label>
                    <Input id="city" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} required />
                  </div>
                  <div>
                    <Label htmlFor="state">State *</Label>
                    <Input id="state" value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })} required />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="website">Organization Website</Label>
                    <Input id="website" type="url" value={formData.website} onChange={(e) => setFormData({ ...formData, website: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="taxId">501(c)(3) Tax ID *</Label>
                    <Input id="taxId" value={formData.taxId} onChange={(e) => setFormData({ ...formData, taxId: e.target.value })} required />
                  </div>
                </div>
                <div>
                  <Label htmlFor="eventDate">Event Date</Label>
                  <Input id="eventDate" type="date" value={formData.eventDate} onChange={(e) => setFormData({ ...formData, eventDate: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="eventDescription">Event Description & How You Plan to Use the Donation *</Label>
                  <Textarea id="eventDescription" rows={5} value={formData.eventDescription} onChange={(e) => setFormData({ ...formData, eventDescription: e.target.value })} required />
                </div>
                <Button type="submit" size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-brand text-sm font-bold px-10 py-6">
                  Submit Request
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

export default DonationPage;
