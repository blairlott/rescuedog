import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Heart, Search, ExternalLink, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface MyRescueTabProps {
  userId: string;
  currentRescueId: string | null;
}

export const MyRescueTab = ({ userId, currentRescueId }: MyRescueTabProps) => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("");

  const { data: rescueOrgs = [], isLoading } = useQuery({
    queryKey: ["rescue-partners"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rescue_partners")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const selectedOrg = rescueOrgs.find((o) => o.id === currentRescueId);

  const states = useMemo(() => {
    const s = new Set(rescueOrgs.map((o) => o.state).filter(Boolean));
    return Array.from(s).sort();
  }, [rescueOrgs]);

  const filtered = useMemo(() => {
    return rescueOrgs.filter((o) => {
      const matchesSearch =
        !search ||
        o.name.toLowerCase().includes(search.toLowerCase()) ||
        o.city.toLowerCase().includes(search.toLowerCase());
      const matchesState = !stateFilter || o.state === stateFilter;
      return matchesSearch && matchesState;
    });
  }, [rescueOrgs, search, stateFilter]);

  const saveMutation = useMutation({
    mutationFn: async (rescueId: string | null) => {
      const { error } = await supabase
        .from("customer_profiles")
        .update({ favorite_rescue_id: rescueId } as any)
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-profile"] });
      toast.success("Favorite rescue updated!");
    },
    onError: (err: any) => toast.error(err.message || "Failed to save"),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current selection */}
      {selectedOrg ? (
        <div className="border border-primary/30 bg-primary/5 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-primary uppercase tracking-wider mb-1">
                Your Favorite Rescue
              </p>
              <h3 className="text-xl font-bold text-foreground">{selectedOrg.name}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {[selectedOrg.city, selectedOrg.state].filter(Boolean).join(", ")}
              </p>
              {selectedOrg.url && (
                <a
                  href={selectedOrg.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-2"
                >
                  Visit website <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive shrink-0"
              onClick={() => saveMutation.mutate(null)}
              disabled={saveMutation.isPending}
            >
              <X className="w-4 h-4 mr-1" /> Remove
            </Button>
          </div>
        </div>
      ) : (
        <div className="border border-border p-6 text-center">
          <Heart className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-bold text-foreground mb-1">No rescue selected yet</h3>
          <p className="text-sm text-muted-foreground">
            Choose your favorite rescue organization from our partners below
          </p>
        </div>
      )}

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or city…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
        >
          <option value="">All States</option>
          {states.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Org list */}
      <div className="border border-border divide-y divide-border max-h-[400px] overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No organizations found matching your search
          </p>
        ) : (
          filtered.map((org) => {
            const isSelected = org.id === currentRescueId;
            return (
              <div
                key={org.id}
                className={`flex items-center justify-between px-4 py-3 transition-colors ${
                  isSelected ? "bg-primary/5" : "hover:bg-muted/50"
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {org.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[org.city, org.state].filter(Boolean).join(", ")}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  {org.url && (
                    <a
                      href={org.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {isSelected ? (
                    <span className="text-xs font-medium text-primary flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> Selected
                    </span>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => saveMutation.mutate(org.id)}
                      disabled={saveMutation.isPending}
                    >
                      <Heart className="w-3 h-3 mr-1" /> Select
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      <p className="text-xs text-muted-foreground text-center">
        {rescueOrgs.length} rescue organizations supported
      </p>
    </div>
  );
};
