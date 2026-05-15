import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Seo } from "@/components/Seo";

export default function PoliciesPage() {
  const { hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo(0, 0);
    }
  }, [hash]);

  return (
    <>
      <Seo
        title="Our Policies | Rescue Dog Wines"
        description="Privacy, shipping, returns, membership, accessibility, and terms & conditions for Rescue Dog Wines."
        path="/policies"
        jsonLd={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebPage",
              name: "Our Policies",
              description:
                "Privacy, shipping, returns, membership, accessibility, and terms & conditions for Rescue Dog Wines.",
              url: "https://rescuedogwines.com/policies",
              inLanguage: "en-US",
              isPartOf: {
                "@type": "WebSite",
                name: "Rescue Dog Wines",
                url: "https://rescuedogwines.com",
              },
              hasPart: [
                { "@type": "WebPageElement", name: "Privacy Policy", url: "https://rescuedogwines.com/policies#privacy" },
                { "@type": "WebPageElement", name: "Membership", url: "https://rescuedogwines.com/policies#membership" },
                { "@type": "WebPageElement", name: "Shipping Policy", url: "https://rescuedogwines.com/policies#shipping" },
                { "@type": "WebPageElement", name: "Refund & Return Policy", url: "https://rescuedogwines.com/policies#refund" },
                { "@type": "WebPageElement", name: "Accessibility", url: "https://rescuedogwines.com/policies#accessibility" },
                { "@type": "WebPageElement", name: "Terms & Conditions", url: "https://rescuedogwines.com/policies#terms" },
              ],
            },
            {
              "@type": "FAQPage",
              mainEntity: [
                {
                  "@type": "Question",
                  name: "Do you ship wine to my state?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Rescue Dog Wines ships direct-to-consumer to U.S. states where we are licensed under that state's DTC wine rules. Available states are shown at checkout; if your state is not listed, we cannot ship wine there.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Is shipping included?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Yes — shipping is included on orders of six or more bottles. Smaller orders are charged shipping at checkout.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Do I have to be 21 to order?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Yes. All wine purchases require the buyer and the recipient to be 21 or older. An adult signature is required at delivery.",
                  },
                },
                {
                  "@type": "Question",
                  name: "What is The Pack?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "The Pack is the Rescue Dog Wines membership program. It is access-based — members get early releases, member-only allocations, and curated club shipments. It is not a percentage-discount program.",
                  },
                },
                {
                  "@type": "Question",
                  name: "How does buying wine help dog rescue?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "A portion of every bottle sold is contributed to companion-animal welfare organizations and rescue partners we work with directly, supporting our mission of helping dogs find their forever home.",
                  },
                },
                {
                  "@type": "Question",
                  name: "What is your return policy?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "If a bottle arrives damaged or flawed, contact us within 30 days of delivery and we will replace it or issue a refund. Federal and state law restricts the return of alcohol once accepted.",
                  },
                },
              ],
            },
          ],
        }}
      />
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-12 space-y-12">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-brand text-muted-foreground">Legal</p>
          <h1 className="font-display text-3xl md:text-4xl font-bold uppercase tracking-brand">
            Our Policies
          </h1>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-xs uppercase tracking-brand text-muted-foreground pt-2">
            <a href="#privacy" className="hover:text-primary">Privacy</a>
            <a href="#membership" className="hover:text-primary">Membership</a>
            <a href="#shipping" className="hover:text-primary">Shipping</a>
            <a href="#refund" className="hover:text-primary">Returns</a>
            <a href="#accessibility" className="hover:text-primary">Accessibility</a>
            <a href="#terms" className="hover:text-primary">Terms</a>
          </nav>
        </header>

        <section id="privacy" className="space-y-3 text-sm leading-relaxed scroll-mt-24">
          <h2 className="font-display text-2xl font-bold uppercase tracking-brand">Privacy Policy</h2>
          <p>
            This privacy notice discloses the privacy practices for rescuedogwines.com. This privacy
            notice applies solely to information collected by this web site. It will notify you of the
            following:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>What personally identifiable information is collected from you through the web site, how it is used and with whom it may be shared.</li>
            <li>What choices are available to you regarding the use of your data.</li>
            <li>The security procedures in place to protect the misuse of your information.</li>
            <li>How you can correct any inaccuracies in the information.</li>
          </ul>

          <h3 className="font-display text-base font-bold uppercase tracking-brand pt-2">Information Collection, Use, and Sharing</h3>
          <p>
            We are the sole owners of the information collected on this site. We only have access to
            collect information that you voluntarily give us via email or other direct contact from
            you. We will not sell or rent this information to anyone.
          </p>
          <p>
            We will use your information to respond to you regarding the reason you contacted us. We
            will not share your information with any third party outside of our organization, other
            than as necessary to fulfill your request (e.g., to ship an order) or as described in the
            Advertising and Marketing section below.
          </p>
          <p>
            Unless you ask us not to, we may contact you via email in the future to tell you about
            specials, new products or services, or changes to this privacy policy.
          </p>

          <h3 className="font-display text-base font-bold uppercase tracking-brand pt-2">Advertising and Marketing</h3>
          <p>
            We share customer information (including email addresses, phone numbers, purchase data,
            and website activity) with third-party advertising platforms such as Meta/Facebook and
            Google Ads for targeted advertising, conversion tracking, and campaign optimization. This
            may be considered a "sale" or "sharing" of personal information under state privacy laws.
          </p>
          <p>
            You may opt out of this data sharing by contacting us at info@rescuedogwines.com, or by
            adjusting your preferences directly with Meta (
            <a className="underline" href="https://www.facebook.com/adpreferences" target="_blank" rel="noopener noreferrer">facebook.com/adpreferences</a>
            ) and Google (
            <a className="underline" href="https://adssettings.google.com/" target="_blank" rel="noopener noreferrer">adssettings.google.com</a>
            ).
          </p>

          <h3 className="font-display text-base font-bold uppercase tracking-brand pt-2">Your Access to and Control Over Information</h3>
          <p>You may opt out of any future contacts from us at any time. You can do the following at any time by contacting us via the email address or phone number given on our website:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>See what data we have about you, if any.</li>
            <li>Change/correct any data we have about you.</li>
            <li>Have us delete any data we have about you.</li>
            <li>Express any concern you have about our use of your data.</li>
          </ul>
          <p>
            We take precautions to protect your information. When you submit sensitive information via
            the website, your information is protected both online and offline.
          </p>
          <p>
            Wherever we collect sensitive information (such as credit card data), that information is
            encrypted and transmitted to us in a secure way. You can verify this by looking for a
            closed lock icon at the bottom of your web browser, or looking for "https" at the
            beginning of the address of the web page.
          </p>
          <p>
            While we use encryption to protect sensitive information transmitted online, we also
            protect your information offline. Only employees who need the information to perform a
            specific job (for example, billing or customer service) are granted access to personally
            identifiable information. The computers and servers in which we store personally
            identifiable information are kept in a secure environment.
          </p>
          <p className="font-bold">
            If you feel that we are not abiding by this privacy policy, you should contact us
            immediately via telephone at 866-678-8466.
          </p>
        </section>

        <section id="membership" className="space-y-3 text-sm leading-relaxed scroll-mt-24">
          <h2 className="font-display text-2xl font-bold uppercase tracking-brand">Membership</h2>
          <p><strong>Shipping Schedule:</strong> Winter, Spring, Summer, Autumn.</p>
          <p>
            Your membership is ongoing and consists of one or four shipments per year, depending on
            the club membership selected. Wines are of winemaker's choice.
          </p>
          <p>
            An adult signature is required for delivery. Please submit a convenient address where an
            adult will be present for deliveries, and note that if your wine is returned to us, you
            will be charged the shipping cost required to resend the package.
          </p>
          <p>
            We communicate with our wine club members mainly through email.{" "}
            <strong>Please supply a valid email and add info@rescuedogwines.com to your contacts.</strong>
          </p>
          <p>
            If you fail to receive emails, check your spam folder or contact us to make sure we have
            your correct email. Upon receiving your Membership Email, make sure to set up your account
            online. Online, take advantage of placing orders at your own convenience while still
            receiving your discount. Please notify Rescue Dog Wines of any account changes to ensure
            club delivery. Changes can be made online through your membership account.
          </p>
        </section>

        <section id="shipping" className="space-y-3 text-sm leading-relaxed scroll-mt-24">
          <h2 className="font-display text-2xl font-bold uppercase tracking-brand">Shipping Policy</h2>
          <p>
            By placing an order for an alcoholic beverage through the Rescue Dog Wines website, you
            formally represent that you are at least 21 years of age and that the intended recipient
            of the shipment is at least 21 years of age.
          </p>
          <p>
            Additionally, all shipments of alcoholic beverages within the United States require an
            adult signature at the time of delivery. No wines can be left on porches or doorsteps.
            Therefore, we recommend that a daytime/business address be provided for wine shipments.
          </p>

          <h3 className="font-display text-base font-bold uppercase tracking-brand pt-2">Shipping</h3>
          <p>
            In partnership with our ecommerce partner Vinoshipper, we are able to ship to most states
            in the United States.
          </p>
          <p>
            Orders shipped via standard ground method should arrive within 7 to 15 days from the date
            of your order.
          </p>
          <p>
            We take great caution in shipping our wines, as they are sensitive to cold and hot
            weather. Because of this, shipment schedules may be altered, at the last minute, due to
            temperature changes across the US. Ideal shipping temperatures are between 45–75 degrees
            Fahrenheit.
          </p>
          <p>
            You will be emailed tracking information once we make your shipping label. Please check
            directly with the carrier for the most accurate delivery estimate so that you can{" "}
            <strong>ensure someone aged 21+ is present to sign for your wine.</strong>
          </p>
          <p>
            The carrier will make <strong>three delivery attempts</strong> before returning the
            package. <strong>Packages cannot be held at UPS facilities after three delivery attempts.</strong>{" "}
            If you know you will not be able to sign at the time of the delivery, please contact the
            carrier directly.
          </p>
          <p className="font-bold">Suggestions to ensure a successful delivery:</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Choose a UPS Access Point during checkout (packages held 7 days).</li>
            <li>Use UPS MyChoice to change delivery date after first attempt.</li>
            <li>Use UPS MyChoice to redirect to an alternate address (work/neighbor).</li>
          </ol>
          <p>
            If your wine is not successfully delivered and is returned to us, orders will be
            cancelled and refunded (less shipping and return fees) after 3 delivery attempts. Please
            note that if your wine is returned to us, you will be charged the shipping cost required
            to resend the package.
          </p>

          <h3 className="font-display text-base font-bold uppercase tracking-brand pt-2">Winter and Summer Shipping</h3>
          <p>
            When states across the country are experiencing temperatures higher than 80 degrees
            Fahrenheit, or are near or below freezing, we hold shipments to avoid compromising the
            quality of the wine.
          </p>
          <p>
            We evaluate safe shipping methods depending on local departing temperatures, time and
            temperature in transit and arrival temperatures.
          </p>
          <p>
            Please feel free to make orders over the winter and summer months, and we will store your
            order, free of cost, until appropriate temperatures arrive.
          </p>
        </section>

        <section id="refund" className="space-y-3 text-sm leading-relaxed scroll-mt-24">
          <h2 className="font-display text-2xl font-bold uppercase tracking-brand">Refund &amp; Return Policy</h2>
          <p>
            Rescue Dog Wines guarantees quality products and service. Your satisfaction is our first
            priority. If you are dissatisfied with your order, please contact us within 30 days of
            receipt of your order for assistance.
          </p>
        </section>

        <section id="accessibility" className="space-y-3 text-sm leading-relaxed scroll-mt-24">
          <h2 className="font-display text-2xl font-bold uppercase tracking-brand">Accessibility</h2>
          <p>
            Rescuedogwines.com strives to ensure that its services are accessible to people with
            disabilities. Rescuedogwines.com has invested a significant amount of resources to help
            ensure that its website is made easier to use and more accessible for people with
            disabilities, with the strong belief that every person has the right to live with
            dignity, equality, comfort and independence.
          </p>

          <h3 className="font-display text-base font-bold uppercase tracking-brand pt-2">Disclaimer</h3>
          <p>
            Rescuedogwines.com continues its efforts to constantly improve the accessibility of its
            site and services in the belief that it is our collective moral obligation to allow
            seamless, accessible and unhindered use also for those of us with disabilities.
          </p>
          <p>
            In an ongoing effort to continually improve and remediate accessibility issues, we also
            regularly scan Rescuedogwines.com with UserWay's Accessibility Scanner to identify and
            fix every possible accessibility barrier on our site. Despite our efforts to make all
            pages and content on Rescuedogwines.com fully accessible, some content may not have yet
            been fully adapted to the strictest accessibility standards. This may be a result of not
            having found or identified the most appropriate technological solution.
          </p>

          <h3 className="font-display text-base font-bold uppercase tracking-brand pt-2">Here For You</h3>
          <p>
            If you are experiencing difficulty with any content on Rescuedogwines.com or require
            assistance with any part of our site, please contact us during normal business hours and
            we will be happy to assist.
          </p>

          <h3 className="font-display text-base font-bold uppercase tracking-brand pt-2">Contact Us</h3>
          <p>
            If you wish to report an accessibility issue, have any questions or need assistance,
            please contact us at: <a className="underline" href="mailto:info@rescuedogwines.com">info@rescuedogwines.com</a>.
          </p>
        </section>

        <section id="terms" className="space-y-3 text-sm leading-relaxed scroll-mt-24">
          <h2 className="font-display text-2xl font-bold uppercase tracking-brand">Terms &amp; Conditions</h2>
          <p>
            By accessing the Rescue Dog Wines website, you agree to the terms and conditions
            appearing in this document and you accept our Privacy Policy.
          </p>

          <h3 className="font-display text-base font-bold uppercase tracking-brand pt-2">State Restrictions and Limits</h3>
          <p>
            Many states restrict the amount of wine a consumer can have shipped from a winery or all
            wineries in aggregate. By placing an order on Rescue Dog Wines' website you formally
            represent that you have not exceeded any of your state's limits on aggregate purchases
            and/or shipments.
          </p>

          <h3 className="font-display text-base font-bold uppercase tracking-brand pt-2">Age Restrictions and Signature Requirements</h3>
          <p>
            By placing an order for an alcoholic beverage through Rescue Dog Wines' website, you
            formally represent that you are at least 21 years of age and that the intended recipient
            of the shipment is at least 21 years of age. Additionally, all shipments of alcoholic
            beverages within the United States require an adult signature at the time of delivery.
            No wines can be left on porches or doorsteps.
          </p>
          <p>
            If there is anything you do not understand, please email your inquiry to{" "}
            <a className="underline" href="mailto:info@rescuedogwines.com">info@rescuedogwines.com</a>.
          </p>
        </section>

        <p className="text-xs text-muted-foreground border-t border-border pt-4">
          Last updated: {new Date().toLocaleDateString()}
        </p>
      </main>
      <Footer />
    </>
  );
}