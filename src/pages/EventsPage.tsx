import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Calendar, MapPin, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

const events = [
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
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold text-foreground mb-2">Upcoming Events</h1>
          <p className="text-muted-foreground mb-8">Join us for tastings, adoption events, and celebrations.</p>

          {events.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No upcoming events. Check back soon!</p>
          ) : (
            <div className="space-y-6">
              {events.map((event) => (
                <div key={event.title} className="border border-border p-6 md:p-8">
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
    </div>
  );
};

export default EventsPage;
