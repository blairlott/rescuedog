import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

type Event = { id: string; event_type: string; message: string | null; created_at: string; payload: any };

export function EventsTab() {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["dropship_events"],
    queryFn: async () => {
      const { data, error } = await supabase.from("dropship_events" as any).select("*").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data || []) as unknown as Event[];
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (events.length === 0) return <div className="border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No activity yet.</div>;

  return (
    <div className="space-y-2">
      {events.map((e) => (
        <div key={e.id} className="border border-border p-3 text-sm flex items-start gap-3">
          <Badge variant="outline">{e.event_type}</Badge>
          <div className="flex-1">
            <p>{e.message}</p>
            <p className="text-xs text-muted-foreground mt-1">{new Date(e.created_at).toLocaleString()}</p>
          </div>
        </div>
      ))}
    </div>
  );
}