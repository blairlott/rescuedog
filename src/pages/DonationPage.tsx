import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Heart, Upload, X, HandHeart, ArrowRight } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";

const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","Florida","Georgia",
  "Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland",
  "Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey",
  "New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina",
  "South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming","Washington, D.C.",
];

const SERVICE_OPTIONS = [
  "Dog foster/adoption (all ages)",
  "Senior dogs foster/adoption",
  "Spay/neuter clinic",
  "Free or low-cost vaccines/health clinic",
  "Free or low-cost behavioral training",
  "Animal cruelty prevention",
  "Financial assistance to keep pets at risk of surrender in their homes",
];

const MAX_FILE_SIZE = 12 * 1024 * 1024; // 12 MB
const ALLOWED_TYPES = [
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const DonationPage = () => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Organization Info
  const [orgName, setOrgName] = useState("");
  const [isNonprofit, setIsNonprofit] = useState("");
  const [services, setServices] = useState<string[]>([]);
  const [mailingStreet, setMailingStreet] = useState("");
  const [mailingCity, setMailingCity] = useState("");
  const [mailingState, setMailingState] = useState("");
  const [mailingZip, setMailingZip] = useState("");
  const [ein, setEin] = useState("");
  const [irsLetterFile, setIrsLetterFile] = useState<File | null>(null);

  // Primary Contact
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [telephone, setTelephone] = useState("");
  const [email, setEmail] = useState("");

  // Event Info
  const [isVirtual, setIsVirtual] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueStreet, setVenueStreet] = useState("");
  const [venueCity, setVenueCity] = useState("");
  const [venueState, setVenueState] = useState("");
  const [venueZip, setVenueZip] = useState("");
  const [eventName, setEventName] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventUrl, setEventUrl] = useState("");
  const [howHeard, setHowHeard] = useState("");
  const [whoKnow, setWhoKnow] = useState("");
  const [partneredBefore, setPartneredBefore] = useState("");
  const [participatedBefore, setParticipatedBefore] = useState("");
  const [numAttendees, setNumAttendees] = useState("");
  const [otherBeverages, setOtherBeverages] = useState("");
  const [sponsorBenefits, setSponsorBenefits] = useState("");
  const [sponsorshipFile, setSponsorshipFile] = useState<File | null>(null);

  // Additional
  const [howIntendToUse, setHowIntendToUse] = useState("");
  const [dataConsent, setDataConsent] = useState(false);
  const [personalAck, setPersonalAck] = useState(false);
  const [affiliateInterest, setAffiliateInterest] = useState("");
  const [servicesOther, setServicesOther] = useState("");
  const [servicesOtherChecked, setServicesOtherChecked] = useState(false);

  const toggleService = (service: string) => {
    setServices((prev) =>
      prev.includes(service) ? prev.filter((s) => s !== service) : [...prev, service]
    );
  };

  const validateFile = (file: File): string | null => {
    if (file.size > MAX_FILE_SIZE) return `File "${file.name}" exceeds 12 MB limit.`;
    if (!ALLOWED_TYPES.includes(file.type)) return `File "${file.name}" must be PDF, TXT, or DOC.`;
    return null;
  };

  const handleFileSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (f: File | null) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const error = validateFile(file);
    if (error) {
      toast({ title: "Invalid file", description: error, variant: "destructive" });
      e.target.value = "";
      return;
    }
    setter(file);
  };

  const uploadFile = async (file: File, prefix: string): Promise<string | null> => {
    const ext = file.name.split('.').pop();
    const path = `${prefix}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from('donation-documents')
      .upload(path, file, { contentType: file.type });
    if (error) {
      console.error('Upload error:', error);
      return null;
    }
    return path;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dataConsent || !personalAck) {
      toast({ title: "Required", description: "Please accept the consent and acknowledgement checkboxes.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);

    try {
      // Upload files
      let irsLetterPath: string | null = null;
      let sponsorshipFilePath: string | null = null;

      if (irsLetterFile) {
        irsLetterPath = await uploadFile(irsLetterFile, 'irs-letters');
        if (!irsLetterPath) throw new Error('Failed to upload IRS letter');
      }

      if (sponsorshipFile) {
        sponsorshipFilePath = await uploadFile(sponsorshipFile, 'sponsorship-files');
        if (!sponsorshipFilePath) throw new Error('Failed to upload sponsorship file');
      }

      // Insert donation request
      const { data: donation, error: insertError } = await supabase
        .from('donation_requests')
        .insert({
          org_name: orgName,
          is_nonprofit: isNonprofit,
          services: servicesOtherChecked && servicesOther ? [...services, `Other: ${servicesOther}`] : services,
          mailing_street: mailingStreet,
          mailing_city: mailingCity,
          mailing_state: mailingState,
          mailing_zip: mailingZip,
          ein,
          first_name: firstName,
          last_name: lastName,
          telephone,
          email,
          is_virtual: isVirtual,
          venue_name: venueName,
          venue_street: venueStreet,
          venue_city: venueCity,
          venue_state: venueState,
          venue_zip: venueZip,
          event_name: eventName,
          event_description: eventDescription,
          event_date: eventDate || null,
          event_url: eventUrl || null,
          how_heard: howHeard || null,
          who_know: whoKnow || null,
          partnered_before: partneredBefore || null,
          participated_before: participatedBefore || null,
          num_attendees: numAttendees || null,
          other_beverages: otherBeverages || null,
          sponsor_benefits: sponsorBenefits,
          how_intend_to_use: howIntendToUse || null,
          affiliate_interest: affiliateInterest || null,
          irs_letter_path: irsLetterPath,
          sponsorship_file_path: sponsorshipFilePath,
        })
        .select('id')
        .single();

      if (insertError) throw insertError;

      // Trigger email notification
      if (donation?.id) {
        await supabase.functions.invoke('send-donation-notification', {
          body: { donationRequestId: donation.id },
        });
      }

      toast({
        title: "Request submitted!",
        description: "We'll review your donation request and get back to you soon.",
      });

      // Reset form
      setOrgName(""); setIsNonprofit(""); setServices([]); setMailingStreet(""); setMailingCity("");
      setMailingState(""); setMailingZip(""); setEin(""); setIrsLetterFile(null);
      setFirstName(""); setLastName(""); setTelephone(""); setEmail("");
      setIsVirtual(""); setVenueName(""); setVenueStreet(""); setVenueCity("");
      setVenueState(""); setVenueZip(""); setEventName(""); setEventDescription("");
      setEventDate(""); setEventUrl(""); setHowHeard(""); setWhoKnow("");
      setPartneredBefore(""); setParticipatedBefore(""); setNumAttendees("");
      setOtherBeverages(""); setSponsorBenefits(""); setSponsorshipFile(null);
      setHowIntendToUse(""); setDataConsent(false); setPersonalAck(false);
      setAffiliateInterest("");
    } catch (error) {
      console.error('Submission error:', error);
      toast({
        title: "Submission failed",
        description: "Something went wrong. Please try again or contact us directly.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative h-[40vh] min-h-[300px] flex items-center bg-foreground">
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=1920')] bg-cover bg-center opacity-50" />
          <div className="relative container mx-auto px-4 text-center">
            <h1 className="text-4xl md:text-6xl font-bold text-primary-foreground mb-4">Partner With Rescue Dog Wines</h1>
            <p className="text-primary-foreground/80 text-lg max-w-2xl mx-auto">
              If you would like to request a donation, fill out the form below. Please submit wine donation requests around 4–6 weeks prior to your event to allow ample time for review and processing.
            </p>
          </div>
        </section>

        {/* Form */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto">
              <div className="bg-secondary border border-border p-6 mb-10">
                <div className="flex items-start gap-4">
                  <Heart className="h-8 w-8 text-primary flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-bold text-foreground mb-2">Important Information</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-2">
                      Please submit wine donation requests around 4–6 weeks prior to your event. If you request several months in advance, our response may be significantly delayed. We appreciate your understanding that we are a small, family-owned winery with limited resources.
                    </p>
                    <p className="text-sm text-muted-foreground leading-relaxed font-medium">
                      Please note: We can only donate to registered 501(c) organizations.
                    </p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-12">
                {/* Organization Information */}
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-foreground border-b border-border pb-3">Organization Information</h2>

                  <div>
                    <Label htmlFor="orgName">Organization Name *</Label>
                    <Input id="orgName" value={orgName} onChange={(e) => setOrgName(e.target.value)} required />
                  </div>

                  <div>
                    <Label>Are You a Nonprofit? *</Label>
                    <div className="flex gap-4 mt-2">
                      {["Yes", "No"].map((opt) => (
                        <label key={opt} className="flex items-center gap-2 cursor-pointer text-sm">
                          <input type="radio" name="nonprofit" value={opt} checked={isNonprofit === opt} onChange={(e) => setIsNonprofit(e.target.value)} required className="accent-primary" />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label>Types of Services Your Rescue Organization Provides</Label>
                    <div className="grid grid-cols-1 gap-2 mt-2">
                      {SERVICE_OPTIONS.map((service) => (
                        <label key={service} className="flex items-start gap-2 cursor-pointer text-sm text-foreground">
                          <Checkbox checked={services.includes(service)} onCheckedChange={() => toggleService(service)} className="mt-0.5" />
                          {service}
                        </label>
                      ))}
                      <label className="flex items-start gap-2 cursor-pointer text-sm text-foreground">
                        <Checkbox
                          checked={servicesOtherChecked}
                          onCheckedChange={(v) => {
                            setServicesOtherChecked(v === true);
                            if (!v) setServicesOther("");
                          }}
                          className="mt-0.5"
                        />
                        Other
                      </label>
                      {servicesOtherChecked && (
                        <Input
                          placeholder="Please specify..."
                          value={servicesOther}
                          onChange={(e) => setServicesOther(e.target.value)}
                          className="ml-6 max-w-sm"
                        />
                      )}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="mailingStreet">Mailing Street *</Label>
                    <Input id="mailingStreet" value={mailingStreet} onChange={(e) => setMailingStreet(e.target.value)} required />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="mailingCity">Mailing City *</Label>
                      <Input id="mailingCity" value={mailingCity} onChange={(e) => setMailingCity(e.target.value)} required />
                    </div>
                    <div>
                      <Label htmlFor="mailingState">Mailing State *</Label>
                      <Select value={mailingState} onValueChange={setMailingState} required>
                        <SelectTrigger id="mailingState">
                          <SelectValue placeholder="Select state" />
                        </SelectTrigger>
                        <SelectContent>
                          {US_STATES.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="mailingZip">Mailing ZIP *</Label>
                      <Input id="mailingZip" value={mailingZip} onChange={(e) => setMailingZip(e.target.value)} required />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="ein">EIN Number</Label>
                    <Input id="ein" value={ein} onChange={(e) => setEin(e.target.value)} />
                  </div>

                  <div>
                    <Label>IRS Determination Letter (501c) Upload</Label>
                    <p className="text-xs text-muted-foreground mb-2">Max file size 12 MB. Accepted: PDF, TXT, DOC</p>
                    {irsLetterFile ? (
                      <div className="flex items-center gap-2 p-3 bg-secondary border border-border rounded-md">
                        <Upload className="h-4 w-4 text-primary flex-shrink-0" />
                        <span className="text-sm text-foreground truncate flex-1">{irsLetterFile.name}</span>
                        <button type="button" onClick={() => setIrsLetterFile(null)} className="p-1 hover:bg-muted rounded">
                          <X className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </div>
                    ) : (
                      <Input
                        type="file"
                        accept=".pdf,.txt,.doc,.docx"
                        onChange={(e) => handleFileSelect(e, setIrsLetterFile)}
                        className="cursor-pointer"
                      />
                    )}
                  </div>
                </div>

                {/* Organization Primary Contact */}
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-foreground border-b border-border pb-3">Organization Primary Contact</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="firstName">First Name *</Label>
                      <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                    </div>
                    <div>
                      <Label htmlFor="lastName">Last Name *</Label>
                      <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="telephone">Telephone *</Label>
                      <Input id="telephone" type="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} required />
                    </div>
                    <div>
                      <Label htmlFor="email">Email *</Label>
                      <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    </div>
                  </div>
                </div>

                {/* Event Information */}
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-foreground border-b border-border pb-3">Event Information</h2>

                  <div>
                    <Label>Is This a Virtual Event? *</Label>
                    <div className="flex gap-4 mt-2">
                      {["Yes", "No"].map((opt) => (
                        <label key={opt} className="flex items-center gap-2 cursor-pointer text-sm">
                          <input type="radio" name="virtual" value={opt} checked={isVirtual === opt} onChange={(e) => setIsVirtual(e.target.value)} required className="accent-primary" />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="venueName">Venue Name</Label>
                    <Input id="venueName" value={venueName} onChange={(e) => setVenueName(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="venueStreet">Street</Label>
                    <Input id="venueStreet" value={venueStreet} onChange={(e) => setVenueStreet(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="venueCity">City</Label>
                      <Input id="venueCity" value={venueCity} onChange={(e) => setVenueCity(e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="venueState">State</Label>
                      <Select value={venueState} onValueChange={setVenueState}>
                        <SelectTrigger id="venueState">
                          <SelectValue placeholder="Select state" />
                        </SelectTrigger>
                        <SelectContent>
                          {US_STATES.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="venueZip">ZIP/Postal Code</Label>
                      <Input id="venueZip" value={venueZip} onChange={(e) => setVenueZip(e.target.value)} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="eventName">Event Name *</Label>
                      <Input id="eventName" value={eventName} onChange={(e) => setEventName(e.target.value)} required />
                    </div>
                    <div>
                      <Label htmlFor="eventDate">Event Date</Label>
                      <Input id="eventDate" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="eventDescription">Event Description *</Label>
                    <Textarea id="eventDescription" rows={4} value={eventDescription} onChange={(e) => setEventDescription(e.target.value)} required />
                  </div>

                  <div>
                    <Label htmlFor="eventUrl">Event URL</Label>
                    <Input id="eventUrl" type="url" value={eventUrl} onChange={(e) => setEventUrl(e.target.value)} placeholder="https://" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="howHeard">How Did You Hear About Us?</Label>
                      <Input id="howHeard" value={howHeard} onChange={(e) => setHowHeard(e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="whoKnow">Who Do You Know at Rescue Dog Wines?</Label>
                      <Input id="whoKnow" value={whoKnow} onChange={(e) => setWhoKnow(e.target.value)} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Has This Organization Partnered With Rescue Dog Wines in the Past?</Label>
                      <div className="flex gap-4 mt-2">
                        {["Yes", "No"].map((opt) => (
                          <label key={opt} className="flex items-center gap-2 cursor-pointer text-sm">
                            <input type="radio" name="partnered" value={opt} checked={partneredBefore === opt} onChange={(e) => setPartneredBefore(e.target.value)} className="accent-primary" />
                            {opt}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Label>Has Rescue Dog Wines Participated in This Event in the Past? *</Label>
                      <div className="flex gap-4 mt-2">
                        {["Yes", "No"].map((opt) => (
                          <label key={opt} className="flex items-center gap-2 cursor-pointer text-sm">
                            <input type="radio" name="participated" value={opt} checked={participatedBefore === opt} onChange={(e) => setParticipatedBefore(e.target.value)} required className="accent-primary" />
                            {opt}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="numAttendees">Number of Attendees Who Are of Legal Drinking Age</Label>
                      <Input id="numAttendees" type="number" min="0" value={numAttendees} onChange={(e) => setNumAttendees(e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="otherBeverages">Other Beverages Served</Label>
                      <Input id="otherBeverages" value={otherBeverages} onChange={(e) => setOtherBeverages(e.target.value)} />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="sponsorBenefits">Sponsor Benefits *</Label>
                    <Textarea id="sponsorBenefits" rows={3} value={sponsorBenefits} onChange={(e) => setSponsorBenefits(e.target.value)} required />
                  </div>
                </div>

                {/* Additional Information */}
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-foreground border-b border-border pb-3">Additional Sponsorship Information</h2>

                  <div>
                    <Label>Upload File</Label>
                    <p className="text-xs text-muted-foreground mb-2">Max file size 12 MB. Accepted: PDF, TXT, DOC</p>
                    {sponsorshipFile ? (
                      <div className="flex items-center gap-2 p-3 bg-secondary border border-border rounded-md">
                        <Upload className="h-4 w-4 text-primary flex-shrink-0" />
                        <span className="text-sm text-foreground truncate flex-1">{sponsorshipFile.name}</span>
                        <button type="button" onClick={() => setSponsorshipFile(null)} className="p-1 hover:bg-muted rounded">
                          <X className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </div>
                    ) : (
                      <Input
                        type="file"
                        accept=".pdf,.txt,.doc,.docx"
                        onChange={(e) => handleFileSelect(e, setSponsorshipFile)}
                        className="cursor-pointer"
                      />
                    )}
                  </div>

                  <div>
                    <Label htmlFor="howIntendToUse">How Do You Intend To Use This Donation?</Label>
                    <Textarea id="howIntendToUse" rows={3} value={howIntendToUse} onChange={(e) => setHowIntendToUse(e.target.value)} />
                  </div>

                  <div className="space-y-4">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <Checkbox checked={dataConsent} onCheckedChange={(v) => setDataConsent(v === true)} className="mt-0.5" />
                      <span className="text-sm text-foreground leading-relaxed">
                        <strong>Data Consent for Rescue Dog Wines *</strong><br />
                        I hereby consent for Rescue Dog Wines to process and store the personal information provided in this form, in compliance with the Privacy Policy of Rescue Dog Wines. The information collected through this form will be used exclusively for the purpose of addressing and fulfilling your request.
                      </span>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer">
                      <Checkbox checked={personalAck} onCheckedChange={(v) => setPersonalAck(v === true)} className="mt-0.5" />
                      <span className="text-sm text-foreground leading-relaxed">
                        <strong>Personal Acknowledgement and Agreement *</strong><br />
                        By submitting this form, I acknowledge and agree to the following terms: Neither I nor the beneficiary charity is associated with any liquor license holder or part of the alcohol industry. In the event of a product donation, the product will not be sold at the event (unless permitted by state regulations), and any remaining product will be removed from the event location at its conclusion. I release Rescue Dog Wines from any liability and waive the right to initiate legal action concerning any matters related to this donation. I understand that alcohol is a regulated product and pledge to ensure its responsible use and consumption in strict accordance with all applicable local, state, and federal laws.
                      </span>
                    </label>
                  </div>

                  <div>
                    <Label>Would you like to learn more about our affiliate program for rescue organizations? *</Label>
                    <div className="flex gap-4 mt-2">
                      {["Yes", "No"].map((opt) => (
                        <label key={opt} className="flex items-center gap-2 cursor-pointer text-sm">
                          <input type="radio" name="affiliate" value={opt} checked={affiliateInterest === opt} onChange={(e) => setAffiliateInterest(e.target.value)} required className="accent-primary" />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground italic">
                  * Denotes Required Field. Confirmation emails are sent from web@rescuedogwines.com and might be hidden by your junk/spam filters.
                </p>

                <Button
                  type="submit"
                  size="lg"
                  disabled={isSubmitting}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-brand text-sm font-bold px-10 py-6"
                >
                  {isSubmitting ? "Submitting..." : "Submit Donation Form"}
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
