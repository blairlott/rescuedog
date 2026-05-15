import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useState } from "react";
import { useCmsContent, getCmsValue } from "@/hooks/useCmsContent";
import { CmsEditButton } from "@/components/cms/CmsEditButton";
import { CmsEditDialog, CmsField } from "@/components/cms/CmsEditDialog";
import { CmsToolbar } from "@/components/cms/CmsToolbar";
import { T } from "@/components/T";

const defaultTeamMembers = [
  {
    name: "Daisy",
    title: "Our Inspiration",
    bio: "Everything started with Daisy, the bubbly rescue boxer who inspired the creation of Rescue Dog Wines. Daisy introduced herself to Laura Lott at an animal shelter in Atlanta in 2007 and made such a profound impression that Laura adopted her. Daisy's memory continues to inspire our creativity and passion to make exceptional wines worthy of rescue dogs.",
  },
  {
    name: "Laura Lott",
    title: "Cofounder & Chief Giving Officer",
    bio: "Laura graduated from Trinity University with a degree in French literature and also completed a master's degree from Thunderbird Graduate School. Laura worked as an HR specialist for many large organizations, including Motorola, Los Alamos National Lab, and Sears. She then left the corporate world and took a journey of exploration, investigating her creative side. She and Blair traveled to wine regions regularly, and one of the milestones preceding the founding of Rescue Dog Wines was a trip to France for a landmark birthday: three weeks traveling through vineyards in France and Spain.",
  },
  {
    name: "Blair Lott",
    title: "Cofounder & Chief Executive Officer",
    bio: "Blair spent the first years of his career working in the music world—writing and performing in Athens, Georgia and then moving to Nashville and later to Melbourne, Australia. He then transitioned into a career as a consumer insights and digital media consultant. During his three years in Australia he became immersed in the wine and food scene and intrigued with the idea of making wine his vocation. After moving back to Atlanta and marrying Laura, they decided to move to northern California to be closer to wine country.",
  },
  {
    name: "Susana Rodriguez Vasquez",
    title: "Chief Consulting Winemaker",
    bio: "Susana (Susy) Rodriguez Vasquez was born and raised in the town of Cochabamba, Bolivia. The daughter of professors, she was raised in the countryside where her love of agriculture was sparked. She made her way to the US on an internship at Cal Poly in organic crops, later becoming a liaison between winemakers and vineyards for Gallo. After receiving her Winemaker Certificate from UC Davis, Susy has spent the last 10 years making her mark as an exceptional winemaker. She has an impeccable palate for choosing the right grapes and revels in each step of the winemaking process, from crush to glass.",
  },
  {
    name: "Eric Donaldson",
    title: "Winemaker – Méthode Champenoise",
    bio: "The Lodi region's premier \"rockstar\" maker of Méthode Champenoise wines, Eric utilizes his finely tuned mastercraft skills to create our unique, ultra-premium sparkling wines. Eric is a graduate of Miami University in Oxford, Ohio and completed the UC Davis Extension Viticulture and Enology Program.",
  },
  {
    name: "TBD",
    title: "Chief Financial Officer",
    bio: "",
  },
];

type EditSection = "hero" | "story" | "stat" | "how_we_give" | "sustainability" | "partner_cta" | "wines_cta" | null;
type EditTeamIdx = number | null;

const AboutPage = () => {
  const { content, upsert } = useCmsContent("about");
  const [editSection, setEditSection] = useState<EditSection>(null);
  const [editTeamIdx, setEditTeamIdx] = useState<EditTeamIdx>(null);

  // Get team from CMS or defaults
  const teamMembers = content.team_members?.members || defaultTeamMembers;

  const getVal = (key: string, field: string, fallback: string) => getCmsValue(content, key, field, fallback);

  const handleSave = (sectionKey: string) => (values: Record<string, string>) => {
    upsert.mutate({ sectionKey, content: values }, {
      onSuccess: () => { setEditSection(null); setEditTeamIdx(null); },
    });
  };

  const handleTeamSave = (idx: number) => (values: Record<string, string>) => {
    const updated = [...teamMembers];
    updated[idx] = { name: values.name, title: values.title, bio: values.bio };
    upsert.mutate({ sectionKey: "team_members", content: { members: updated } }, {
      onSuccess: () => setEditTeamIdx(null),
    });
  };

  const sectionFields: Record<string, { title: string; fields: CmsField[] }> = {
    hero: {
      title: "Hero Section",
      fields: [
        { key: "title", label: "Title", type: "text", value: getVal("hero", "title", "About Rescue Dog Wines") },
        { key: "subtitle", label: "Subtitle", type: "textarea", value: getVal("hero", "subtitle", "Through wine sales and donations, our mission is to support the placement of as many rescue dogs as possible into loving homes.") },
        { key: "image", label: "Background Image URL", type: "url", value: getVal("hero", "image", "https://rescuedogwines.com/wp-content/uploads/2023/09/laura-blair-lott.jpeg") },
      ],
    },
    story: {
      title: "Our Story",
      fields: [
        { key: "heading", label: "Heading", type: "text", value: getVal("story", "heading", "Great Wine. Greater Purpose.") },
        { key: "paragraph1", label: "Paragraph 1", type: "textarea", value: getVal("story", "paragraph1", "Rescue Dog Wines Cofounders Blair and Laura Lott started planning their new life in wine country in 2015. They knew that they wanted to embrace sustainable growing practices and create a new, more rewarding lifestyle for themselves. In addition, the Lotts knew that they wanted enough land to grow wine grapes AND foster dogs.") },
        { key: "paragraph2", label: "Paragraph 2", type: "textarea", value: getVal("story", "paragraph2", "During this period of exploring many of California's wine regions, it dawned on the Lotts that they could combine their two passions—and Rescue Dog Wines was born!") },
        { key: "paragraph3", label: "Paragraph 3", type: "textarea", value: getVal("story", "paragraph3", "Fast forward several years and Rescue Dog Wines is pleased to offer a full portfolio of wines, many from our neighbors' sustainable vineyards or our Lodi Rules Certified Green vineyard in Acampo, California. We're proud that 50% of our profits support rescue organizations.") },
        { key: "image", label: "Image URL", type: "url", value: getVal("story", "image", "https://rescuedogwines.com/wp-content/uploads/2023/09/laura-blair-lott.jpeg") },
      ],
    },
    how_we_give: {
      title: "How We Give",
      fields: [
        { key: "heading", label: "Heading", type: "text", value: getVal("how_we_give", "heading", "How We Give") },
        { key: "paragraph1", label: "Paragraph 1", type: "textarea", value: getVal("how_we_give", "paragraph1", "We support rescue dogs in many ways, ranging from wine donations for fundraising events, to endowments, to volunteering our time and personally fostering dogs.") },
        { key: "paragraph2", label: "Paragraph 2", type: "textarea", value: getVal("how_we_give", "paragraph2", "Rescue Dog Wines prefers to donate wine for fundraising. We tend to donate locally in California or in other states where we have distribution, so our partners can donate on our behalf. If you're really close by, our team can potentially show up and pour our wines at your rescue organization's event!") },
      ],
    },
    sustainability: {
      title: "Sustainability",
      fields: [
        { key: "heading", label: "Heading", type: "text", value: getVal("sustainability", "heading", "Lodi Rules Certified") },
        { key: "paragraph1", label: "Paragraph 1", type: "textarea", value: getVal("sustainability", "paragraph1", "Our grapes are grown under the Lodi Rules Sustainable Winegrowing Program, one of the most rigorous third-party sustainability certifications in the wine industry.") },
        { key: "paragraph2", label: "Paragraph 2", type: "textarea", value: getVal("sustainability", "paragraph2", "This means our vineyards follow strict standards for pest management, soil health, water conservation, and habitat preservation — ensuring every bottle is as responsible as it is delicious.") },
        { key: "image", label: "Image URL", type: "url", value: getVal("sustainability", "image", "https://rescuedogwines.com/wp-content/uploads/2023/12/rdw-vineyard-5.jpg") },
      ],
    },
    partner_cta: {
      title: "Partner CTA",
      fields: [
        { key: "heading", label: "Heading", type: "text", value: getVal("partner_cta", "heading", "Partner with Us") },
        { key: "body", label: "Body Text", type: "textarea", value: getVal("partner_cta", "body", "If you'd like for us to consider your rescue organization for a donation, please complete our Donation Request form.") },
      ],
    },
    wines_cta: {
      title: "Wines CTA",
      fields: [
        { key: "heading", label: "Heading", type: "text", value: getVal("wines_cta", "heading", "Ready to Try Our Wines?") },
        { key: "body", label: "Body Text", type: "textarea", value: getVal("wines_cta", "body", "Every sip supports rescue dogs. Browse our award-winning collection today.") },
      ],
    },
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative h-[50vh] min-h-[400px] flex items-center bg-foreground">
          <CmsEditButton onClick={() => setEditSection("hero")} />
          <div className="absolute inset-0 bg-cover bg-center opacity-50" style={{ backgroundImage: `url('${getVal("hero", "image", "https://rescuedogwines.com/wp-content/uploads/2023/09/laura-blair-lott.jpeg")}')` }} />
          <div className="relative container mx-auto px-4 text-center">
            <h1 className="text-4xl md:text-6xl font-bold text-primary-foreground mb-4">
              {getVal("hero", "title", "About Rescue Dog Wines")}
            </h1>
            <p className="text-primary-foreground/80 text-lg max-w-2xl mx-auto">
              {getVal("hero", "subtitle", "Through wine sales and donations, our mission is to support the placement of as many rescue dogs as possible into loving homes.")}
            </p>
          </div>
        </section>

        {/* Story */}
        <section className="py-16 md:py-20 relative">
          <CmsEditButton onClick={() => setEditSection("story")} />
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-sm font-bold tracking-brand uppercase text-muted-foreground mb-3"><T>Our Story</T></h2>
                <h3 className="text-3xl font-bold text-foreground mb-6">
                  {getVal("story", "heading", "Great Wine. Greater Purpose.")}
                </h3>
                <p className="text-foreground leading-relaxed mb-4">
                  {getVal("story", "paragraph1", "Rescue Dog Wines Cofounders Blair and Laura Lott started planning their new life in wine country in 2015. They knew that they wanted to embrace sustainable growing practices and create a new, more rewarding lifestyle for themselves. In addition, the Lotts knew that they wanted enough land to grow wine grapes AND foster dogs.")}
                </p>
                <p className="text-foreground leading-relaxed mb-4">
                  {getVal("story", "paragraph2", "During this period of exploring many of California's wine regions, it dawned on the Lotts that they could combine their two passions—and Rescue Dog Wines was born!")}
                </p>
                <p className="text-foreground leading-relaxed">
                  {getVal("story", "paragraph3", "Fast forward several years and Rescue Dog Wines is pleased to offer a full portfolio of wines, many from our neighbors' sustainable vineyards or our Lodi Rules Certified Green vineyard in Acampo, California. We're proud that 50% of our profits support rescue organizations.")}
                </p>
              </div>
              <div className="aspect-[4/3] bg-secondary overflow-hidden">
                <img
                  src={getVal("story", "image", "https://rescuedogwines.com/wp-content/uploads/2023/09/laura-blair-lott.jpeg")}
                  alt="Blair and Laura Lott, Owners of Rescue Dog Wines"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </section>

        {/* 50% stat */}
        <section className="py-16 bg-primary text-primary-foreground">
          <div className="container mx-auto px-4 text-center">
            <p className="text-7xl md:text-9xl font-bold mb-4">50%</p>
            <p className="text-xl md:text-2xl font-bold uppercase tracking-brand">of our profits support rescue organizations.</p>
          </div>
        </section>

        {/* How We Give */}
        <section className="py-16 relative">
          <CmsEditButton onClick={() => setEditSection("how_we_give")} />
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
                {getVal("how_we_give", "heading", "How We Give")}
              </h2>
              <p className="text-foreground leading-relaxed mb-4">
                {getVal("how_we_give", "paragraph1", "We support rescue dogs in many ways, ranging from wine donations for fundraising events, to endowments, to volunteering our time and personally fostering dogs.")}
              </p>
              <p className="text-foreground leading-relaxed mb-8">
                {getVal("how_we_give", "paragraph2", "Rescue Dog Wines prefers to donate wine for fundraising. We tend to donate locally in California or in other states where we have distribution, so our partners can donate on our behalf. If you're really close by, our team can potentially show up and pour our wines at your rescue organization's event!")}
              </p>
              <div className="flex flex-wrap gap-4 justify-center">
                <Button asChild variant="outline" size="lg" className="uppercase tracking-brand text-sm font-bold border-foreground text-foreground hover:bg-foreground hover:text-background px-10">
                  <Link to="/mission">View Our Rescue Partners</Link>
                </Button>
                <Button asChild size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-brand text-sm font-bold px-10">
                  <Link to="/donation">Request a Donation</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Team */}
        <section className="py-16 bg-secondary">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-sm font-bold tracking-brand uppercase text-muted-foreground mb-3"><T>Who We Are</T></h2>
              <h3 className="text-3xl md:text-4xl font-bold text-foreground"><T>Meet the Team</T></h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {teamMembers.map((member: any, idx: number) => (
                <div key={`${member.name}-${idx}`} className="bg-background border border-border p-6 relative">
                  <CmsEditButton onClick={() => setEditTeamIdx(idx)} label="Edit" scope="team" />
                  <h4 className="text-lg font-bold text-foreground mb-1">{member.name}</h4>
                  <p className="text-sm text-primary font-medium mb-3">{member.title}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{member.bio}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Sustainability */}
        <section className="py-16 relative">
          <CmsEditButton onClick={() => setEditSection("sustainability")} />
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              <div className="aspect-[4/3] bg-secondary overflow-hidden">
                <img
                  src={getVal("sustainability", "image", "https://rescuedogwines.com/wp-content/uploads/2023/12/rdw-vineyard-5.jpg")}
                  alt="Sustainable vineyard"
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <h2 className="text-sm font-bold tracking-brand uppercase text-muted-foreground mb-3"><T>Sustainability</T></h2>
                <h3 className="text-3xl font-bold text-foreground mb-6">
                  {getVal("sustainability", "heading", "Lodi Rules Certified")}
                </h3>
                <p className="text-foreground leading-relaxed mb-4">
                  {getVal("sustainability", "paragraph1", "Our grapes are grown under the Lodi Rules Sustainable Winegrowing Program, one of the most rigorous third-party sustainability certifications in the wine industry.")}
                </p>
                <p className="text-foreground leading-relaxed mb-6">
                  {getVal("sustainability", "paragraph2", "This means our vineyards follow strict standards for pest management, soil health, water conservation, and habitat preservation — ensuring every bottle is as responsible as it is delicious.")}
                </p>
                <Button asChild variant="outline" size="lg" className="uppercase tracking-brand text-sm font-bold border-foreground text-foreground hover:bg-foreground hover:text-background px-10">
                  <Link to="/vineyard">Explore Our Vineyard</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Partner CTA */}
        <section className="py-16 bg-secondary relative">
          <CmsEditButton onClick={() => setEditSection("partner_cta")} />
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl font-bold text-foreground mb-4">
              {getVal("partner_cta", "heading", "Partner with Us")}
            </h2>
            <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
              {getVal("partner_cta", "body", "If you'd like for us to consider your rescue organization for a donation, please complete our Donation Request form.")}
            </p>
            <Button asChild size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-brand text-sm font-bold px-10 py-6">
              <Link to="/donation">Donation Request Form</Link>
            </Button>
          </div>
        </section>

        {/* Video CTA */}
        <section className="py-16 relative">
          <CmsEditButton onClick={() => setEditSection("wines_cta")} />
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl font-bold text-foreground mb-4">
              {getVal("wines_cta", "heading", "Ready to Try Our Wines?")}
            </h2>
            <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
              {getVal("wines_cta", "body", "Every sip supports rescue dogs. Browse our award-winning collection today.")}
            </p>
            <Button asChild size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-brand text-sm font-bold px-10 py-6">
              <Link to="/wines">Shop Wines</Link>
            </Button>
          </div>
        </section>
      </main>
      <Footer />
      <CmsToolbar />

      {/* Section edit dialogs */}
      {editSection && sectionFields[editSection] && (
        <CmsEditDialog
          open={!!editSection}
          onOpenChange={(open) => !open && setEditSection(null)}
          title={sectionFields[editSection].title}
          fields={sectionFields[editSection].fields}
          onSave={handleSave(editSection)}
          isSaving={upsert.isPending}
        />
      )}

      {/* Team member edit dialog */}
      {editTeamIdx !== null && teamMembers[editTeamIdx] && (
        <CmsEditDialog
          open={editTeamIdx !== null}
          onOpenChange={(open) => !open && setEditTeamIdx(null)}
          title={`Team Member: ${teamMembers[editTeamIdx].name}`}
          fields={[
            { key: "name", label: "Name", type: "text", value: teamMembers[editTeamIdx].name },
            { key: "title", label: "Title", type: "text", value: teamMembers[editTeamIdx].title },
            { key: "bio", label: "Bio", type: "textarea", value: teamMembers[editTeamIdx].bio },
          ]}
          onSave={handleTeamSave(editTeamIdx)}
          isSaving={upsert.isPending}
        />
      )}
    </div>
  );
};

export default AboutPage;
