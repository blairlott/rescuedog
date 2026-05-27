import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Heart, PawPrint, Wine, TreePine, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Link } from "react-router-dom";
import { useState, useMemo } from "react";
import { useRescuePartners, RescuePartner } from "@/hooks/useRescuePartners";
import { RescuePartnerDialog } from "@/components/RescuePartnerDialog";
import { useCmsAuth } from "@/hooks/useCmsAuth";
import { useCmsContent, getCmsValue } from "@/hooks/useCmsContent";
import { CmsEditButton } from "@/components/cms/CmsEditButton";
import { CmsEditDialog } from "@/components/cms/CmsEditDialog";
import { CmsToolbar } from "@/components/cms/CmsToolbar";
import { T } from "@/components/T";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Seo } from "@/components/Seo";

type SortField = "name" | "city" | "state";
type SortDir = "asc" | "desc";

const pillars = [
  { icon: Heart, title: "50% of Profits Donated", desc: "Half of every dollar we earn goes directly to rescue organizations helping dogs find forever homes." },
  { icon: PawPrint, title: "Rescue Partners", desc: "We partner with rescue organizations nationwide to fund adoptions, medical care, and shelter operations." },
  { icon: Wine, title: "Award-Winning Quality", desc: "Our wines have earned Gold and Double Gold medals at prestigious competitions — great wine for a great cause." },
  { icon: TreePine, title: "Sustainable Farming", desc: "Lodi Rules certified sustainable vineyards ensure we protect the land while producing exceptional grapes." },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const MissionPage = () => {
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const { isCmsEditor: isAdmin } = useCmsAuth();
  const { content, upsert } = useCmsContent("mission");
  const [editSection, setEditSection] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<RescuePartner | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: partners = [], isLoading, error, addPartner, updatePartner, deletePartner } = useRescuePartners();

  const getVal = (key: string, field: string, fallback: string) => getCmsValue(content, key, field, fallback);

  const filtered = useMemo(() => {
    let result = partners;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) => p.name.toLowerCase().includes(q) || p.city.toLowerCase().includes(q) || p.state.toLowerCase().includes(q)
      );
    }
    result = [...result].sort((a, b) => {
      const valA = a[sortField].toLowerCase();
      const valB = b[sortField].toLowerCase();
      return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });
    return result;
  }, [search, sortField, sortDir, partners]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const displayed = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
    setCurrentPage(1);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 inline opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1 inline" /> : <ArrowDown className="h-3 w-3 ml-1 inline" />;
  };

  const handleSearch = (value: string) => { setSearch(value); setCurrentPage(1); };
  const handlePageSizeChange = (value: string) => { setPageSize(Number(value)); setCurrentPage(1); };

  const handleSave = (data: { id?: string; name: string; city: string; state: string; url: string }) => {
    if (data.id) {
      updatePartner.mutate({ id: data.id, name: data.name, city: data.city, state: data.state, url: data.url }, { onSuccess: () => setDialogOpen(false) });
    } else {
      addPartner.mutate({ name: data.name, city: data.city, state: data.state, url: data.url }, { onSuccess: () => setDialogOpen(false) });
    }
  };

  const handleDelete = () => {
    if (deleteId) {
      deletePartner.mutate(deleteId, { onSuccess: () => setDeleteId(null) });
    }
  };

  const handleCmsSave = (sectionKey: string) => (values: Record<string, string>) => {
    upsert.mutate({ sectionKey, content: values }, { onSuccess: () => setEditSection(null) });
  };

  const sectionFields: Record<string, { title: string; fields: any[] }> = {
    hero: {
      title: "Hero Section",
      fields: [
        { key: "title", label: "Title", type: "text", value: getVal("hero", "title", "Our Mission") },
        { key: "subtitle", label: "Subtitle", type: "textarea", value: getVal("hero", "subtitle", "Through wine sales and donations, our mission is to support the placement of as many rescue dogs as possible into loving homes.") },
        { key: "image", label: "Background Image URL", type: "url", value: getVal("hero", "image", "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=1920") },
      ],
    },
    how_we_give: {
      title: "How We Give",
      fields: [
        { key: "heading", label: "Heading", type: "text", value: getVal("how_we_give", "heading", "How We Give") },
        { key: "paragraph1", label: "Paragraph 1", type: "textarea", value: getVal("how_we_give", "paragraph1", "We support rescue dogs in many ways, ranging from wine donations for fundraising events, to endowments, to volunteering our time and personally fostering dogs.") },
        { key: "paragraph2", label: "Paragraph 2", type: "textarea", value: getVal("how_we_give", "paragraph2", "We prefer to donate wine for fundraising. We tend to donate locally in California or in other states where we have distribution, so our partners can donate on our behalf. If you're really close by, our team can potentially show up and pour our wines at your rescue organization's event!") },
      ],
    },
    partner_cta: {
      title: "Partner CTA",
      fields: [
        { key: "heading", label: "Heading", type: "text", value: getVal("partner_cta", "heading", "Partner with Us") },
        { key: "body", label: "Body Text", type: "textarea", value: getVal("partner_cta", "body", "If you'd like for us to consider your rescue organization for a donation, please complete our Donation Request form. We appreciate your understanding that we are a small, family-owned winery with limited resources.") },
      ],
    },
    quote: {
      title: "Quote",
      fields: [
        { key: "text", label: "Quote Text", type: "text", value: getVal("quote", "text", "Our wine is for the dogs.") },
        { key: "attribution", label: "Attribution", type: "text", value: getVal("quote", "attribution", "— Rescue Dog Wines") },
      ],
    },
  };

  return (
    <div className="min-h-dvh flex flex-col">
      <Seo
        title="Our Mission — 50% of Profits Help Rescue Dogs"
        description="Through wine sales and donations, Rescue Dog Wines supports rescue partners nationwide helping dogs find their forever home."
        path="/mission"
        breadcrumbs={[{ name: "Home", path: "/" }, { name: "Mission", path: "/mission" }]}
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Rescue Partner Directory",
          url: "https://rescuedogwines.com/mission",
          description: "Directory of 501(c)(3) rescue partners supported by Rescue Dog Wines.",
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: partners.length,
            itemListElement: partners.slice(0, 50).map((p: RescuePartner, i: number) => ({
              "@type": "ListItem",
              position: i + 1,
              item: {
                "@type": "Organization",
                name: p.name,
                address: {
                  "@type": "PostalAddress",
                  addressLocality: p.city ?? undefined,
                  addressRegion: p.state ?? undefined,
                  addressCountry: "US",
                },
              },
            })),
          },
        }}
      />
      <Header />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative h-[50vh] min-h-[400px] flex items-center bg-foreground">
          <CmsEditButton onClick={() => setEditSection("hero")} />
          <div className="absolute inset-0 bg-cover bg-center opacity-50" style={{ backgroundImage: `url('${getVal("hero", "image", "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=1920")}')` }} />
          <div className="relative container mx-auto px-4 text-center">
            <h1 className="text-4xl md:text-6xl font-bold text-primary-foreground mb-4">{getVal("hero", "title", "Our Mission")}</h1>
            <p className="text-primary-foreground/80 text-lg max-w-2xl mx-auto">
              {getVal("hero", "subtitle", "Through wine sales and donations, our mission is to support the placement of as many rescue dogs as possible into loving homes.")}
            </p>
          </div>
        </section>

        {/* 50% Stat */}
        <section className="py-16 bg-primary text-primary-foreground">
          <div className="container mx-auto px-4 text-center">
            <p className="text-7xl md:text-9xl font-bold mb-4">50%</p>
            <p className="text-xl md:text-2xl font-bold">of our profits support rescue dog and charitable organizations</p>
          </div>
        </section>

        {/* Pillars */}
        <section className="py-16 md:py-20">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {pillars.map((p) => (
                <div key={p.title} className="text-center p-6">
                  <p.icon className="h-10 w-10 text-primary mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-foreground mb-2">{p.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{p.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How We Give */}
        <section className="py-16 bg-secondary relative">
          <CmsEditButton onClick={() => setEditSection("how_we_give")} />
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">{getVal("how_we_give", "heading", "How We Give")}</h2>
              <p className="text-foreground leading-relaxed mb-4">
                {getVal("how_we_give", "paragraph1", "We support rescue dogs in many ways, ranging from wine donations for fundraising events, to endowments, to volunteering our time and personally fostering dogs.")}
              </p>
              <p className="text-foreground leading-relaxed">
                {getVal("how_we_give", "paragraph2", "We prefer to donate wine for fundraising. We tend to donate locally in California or in other states where we have distribution, so our partners can donate on our behalf. If you're really close by, our team can potentially show up and pour our wines at your rescue organization's event!")}
              </p>
            </div>
          </div>
        </section>

        {/* Rescue Partners Table */}
        <section className="py-16" id="partners">
          <div className="container mx-auto px-4">
            <div className="text-center mb-8">
              <h2 className="text-sm font-bold tracking-brand uppercase text-muted-foreground mb-3"><T>Our Network</T></h2>
              <h3 className="text-3xl md:text-4xl font-bold text-foreground mb-2"><T>Supported Rescue Organizations</T></h3>
              <p className="text-muted-foreground">
                Partnered with <strong className="text-foreground">225 rescue organizations</strong> to date
                {partners.length > 0 && (
                  <> · Showing {filtered.length} of {partners.length} in our directory</>
                )}
              </p>
            </div>

            {/* Admin toolbar */}
            {isAdmin && (
              <div className="max-w-4xl mx-auto mb-4 flex items-center justify-between bg-primary/10 border border-primary/20 rounded-md px-4 py-3">
                <span className="text-sm font-medium text-foreground">Edit Mode</span>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => { setEditingPartner(null); setDialogOpen(true); }} className="gap-1">
                    <Plus className="h-4 w-4" /> Add Partner
                  </Button>
                </div>
              </div>
            )}

            <div className="max-w-4xl mx-auto">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-2 flex-wrap">
                  <Input
                    placeholder="Search by name, city, or state..."
                    value={search}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="max-w-sm"
                  />
                  {(search || sortField !== "name" || sortDir !== "asc") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setSearch(""); setSortField("name"); setSortDir("asc"); setCurrentPage(1); }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      Reset filters
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Show</span>
                  <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                    <SelectTrigger className="w-[70px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span>entries</span>
                </div>
              </div>

              <div className="border border-border overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-secondary">
                      <th className="text-left py-3 px-4 text-sm font-bold text-foreground cursor-pointer select-none" onClick={() => handleSort("name")}>Organization Name <SortIcon field="name" /></th>
                      <th className="text-left py-3 px-4 text-sm font-bold text-foreground hidden md:table-cell cursor-pointer select-none" onClick={() => handleSort("city")}>City <SortIcon field="city" /></th>
                      <th className="text-left py-3 px-4 text-sm font-bold text-foreground cursor-pointer select-none" onClick={() => handleSort("state")}>State <SortIcon field="state" /></th>
                      {isAdmin && <th className="py-3 px-4 text-sm font-bold text-foreground w-24">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr><td colSpan={isAdmin ? 4 : 3} className="py-8 text-center text-muted-foreground">Loading rescue partners...</td></tr>
                    ) : error ? (
                      <tr><td colSpan={isAdmin ? 4 : 3} className="py-8 text-center text-destructive">Error loading partners. Please refresh the page.</td></tr>
                    ) : displayed.length === 0 ? (
                      <tr><td colSpan={isAdmin ? 4 : 3} className="py-8 text-center text-muted-foreground">No organizations found</td></tr>
                    ) : (
                      displayed.map((org, i) => (
                        <tr key={org.id} className={i % 2 === 0 ? "bg-background" : "bg-secondary/50"}>
                          <td className="py-3 px-4 text-sm">
                            {org.url ? (
                              <a href={org.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{org.name}</a>
                            ) : (
                              <span className="text-foreground">{org.name}</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-sm text-muted-foreground hidden md:table-cell">{org.city}</td>
                          <td className="py-3 px-4 text-sm text-muted-foreground">{org.state}</td>
                          {isAdmin && (
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setEditingPartner(org); setDialogOpen(true); }}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteId(org.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-6">
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="gap-1">
                    <ChevronLeft className="h-4 w-4" /> Previous
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <Button key={page} variant={page === currentPage ? "default" : "outline"} size="sm" onClick={() => setCurrentPage(page)} className="w-8 h-8 p-0">{page}</Button>
                    ))}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="gap-1">
                    Next <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <p className="text-center text-sm text-muted-foreground mt-4">
                Page {currentPage} of {totalPages} · Showing {displayed.length} of {filtered.length} organizations
              </p>
            </div>
          </div>
        </section>

        {/* Partner CTA */}
        <section className="py-16 bg-secondary relative">
          <CmsEditButton onClick={() => setEditSection("partner_cta")} />
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl font-bold text-foreground mb-4">{getVal("partner_cta", "heading", "Partner with Us")}</h2>
            <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
              {getVal("partner_cta", "body", "If you'd like for us to consider your rescue organization for a donation, please complete our Donation Request form. We appreciate your understanding that we are a small, family-owned winery with limited resources.")}
            </p>
            <Button asChild size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-brand text-sm font-bold px-10 py-6">
              <Link to="/donation">Donation Request Form</Link>
            </Button>
          </div>
        </section>

        {/* Quote */}
        <section className="py-16 relative">
          <CmsEditButton onClick={() => setEditSection("quote")} />
          <div className="container mx-auto px-4 text-center">
            <blockquote className="text-2xl md:text-3xl font-bold text-primary italic max-w-3xl mx-auto leading-relaxed">
              "{getVal("quote", "text", "Our wine is for the dogs.")}"
            </blockquote>
            <p className="text-muted-foreground mt-4 text-sm tracking-brand uppercase">{getVal("quote", "attribution", "— Rescue Dog Wines")}</p>
          </div>
        </section>
      </main>
      <Footer />
      <CmsToolbar />

      {/* Partner Add/Edit Dialog */}
      <RescuePartnerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        partner={editingPartner}
        onSave={handleSave}
        isSaving={addPartner.isPending || updatePartner.isPending}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Partner</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to remove this rescue partner? This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CMS Section Edit Dialogs */}
      {editSection && sectionFields[editSection] && (
        <CmsEditDialog
          open={!!editSection}
          onOpenChange={(open) => !open && setEditSection(null)}
          title={sectionFields[editSection].title}
          fields={sectionFields[editSection].fields}
          onSave={handleCmsSave(editSection)}
          isSaving={upsert.isPending}
        />
      )}
    </div>
  );
};

export default MissionPage;
