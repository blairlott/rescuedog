import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Calendar, MapPin, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useCmsContent, getCmsValue } from "@/hooks/useCmsContent";
import { CmsEditButton } from "@/components/cms/CmsEditButton";
import { CmsEditDialog, CmsField } from "@/components/cms/CmsEditDialog";

type EditSection = "header" | null;
type EditEventIdx = number | null;

const defaultEvents = [
  {
    title: "Summer Wine Tasting",
    date: "2026-06-15",
    time: "2:00 PM - 5:00 PM",
    location: "Rescue Dog Wines Tasting Room, Lodi CA",
    description: "Join us for an afternoon of wine tasting featuring our newest releases. Meet rescue dogs available for adoption!",
  },
  {
    title: "Yappy Hour",
    date: "2026-07-20",
    time: "4:00 PM - 7:00 PM",
    location: "Rescue Dog Wines Tasting Room, Lodi CA",
    description: "Bring your pup and enjoy discounted wines, live music, and good company. A portion of proceeds benefits local rescues.",
  },
  {
    title: "Harvest Festival",
    date: "2026-09-12",
    time: "11:00 AM - 4:00 PM",
    location: "Rescue Dog Wines Vineyard, Lodi CA",
    description: "Celebrate harvest season with vineyard tours, barrel tastings, food trucks, and an adoption event with our rescue partners.",
  },
];

const EventsPage = () => {
  const { content, upsert } = useCmsContent("events");
  const [editSection, setEditSection] = useState<EditSection>(null);
  const [editEventIdx, setEditEventIdx] = useState<EditEventIdx>(null);

  const getVal = (key: string, field: string, fallback: string) => getCmsValue(content, key, field, fallback);

  const events = content.events_list?.events || defaultEvents;

  const handleSave = (sectionKey: string) => (values: Record<string, string>) => {
    upsert.mutate({ sectionKey, content: values }, {
      onSuccess: () => setEditSection(null),
    });
  };

  const handleEventSave = (idx: number) => (values: Record<string, string>) => {
    const updated = [...events];
    updated[idx] = { title: values.title, date: values.date, time: values.time, location: values.location, description: values.description };
    upsert.mutate({ sectionKey: "events_list", content: { events: updated } }, {
      onSuccess: () => setEditEventIdx(null),
    });
  };

  const sectionFields: Record<string, { title: string; fields: CmsField[] }> = {
    header: {
      title: "Events Page Header",
      fields: [
        { key: "title", label: "Page Title", type: "text", value: getVal("header", "title", "Upcoming Events") },
        { key: "subtitle", label: "Subtitle", type: "textarea", value: getVal("header", "subtitle", "Join us for tastings, adoption events, and celebrations.") },
      ],
    },
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4">
          <div className="relative mb-8">
            <CmsEditButton onClick={() => setEditSection("header")} scope="events" />
            <h1 className="text-3xl font-bold text-foreground mb-2">
              {getVal("header", "title", "Upcoming Events")}
            </h1>
            <p className="text-muted-foreground">
              {getVal("header", "subtitle", "Join us for tastings, adoption events, and celebrations.")}
            </p>
          </div>

          {events.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No upcoming events. Check back soon!</p>
          ) : (
            <div className="space-y-6">
              {events.map((event: any, idx: number) => (
                <div key={`${event.title}-${idx}`} className="border border-border p-6 md:p-8 relative">
                  <CmsEditButton onClick={() => setEditEventIdx(idx)} label="Edit Event" scope="events" />
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div className="flex-1">
                      <h2 className="text-xl font-bold text-foreground mb-3">{event.title}</h2>
                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-3">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-4 w-4" />
                          {new Date(event.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-4 w-4" />
                          {event.time}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <MapPin className="h-4 w-4" />
                          {event.location}
                        </span>
                      </div>
                      <p className="text-foreground leading-relaxed">{event.description}</p>
                    </div>
                    <Button className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-brand text-xs font-bold px-6 shrink-0">
                      More Info
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />

      {/* CMS Edit Dialogs */}
      {editSection && sectionFields[editSection] && (
        <CmsEditDialog
          open={!!editSection}
          onOpenChange={(open) => { if (!open) setEditSection(null); }}
          title={sectionFields[editSection].title}
          fields={sectionFields[editSection].fields}
          onSave={handleSave(editSection)}
          isSaving={upsert.isPending}
        />
      )}
      {editEventIdx !== null && (
        <CmsEditDialog
          open={editEventIdx !== null}
          onOpenChange={(open) => { if (!open) setEditEventIdx(null); }}
          title={`Edit Event: ${events[editEventIdx]?.title || ""}`}
          fields={[
            { key: "title", label: "Event Title", type: "text", value: events[editEventIdx]?.title || "" },
            { key: "date", label: "Date (YYYY-MM-DD)", type: "text", value: events[editEventIdx]?.date || "" },
            { key: "time", label: "Time", type: "text", value: events[editEventIdx]?.time || "" },
            { key: "location", label: "Location", type: "text", value: events[editEventIdx]?.location || "" },
            { key: "description", label: "Description", type: "textarea", value: events[editEventIdx]?.description || "" },
          ]}
          onSave={handleEventSave(editEventIdx)}
          isSaving={upsert.isPending}
        />
      )}
    </div>
  );
};

export default EventsPage;
