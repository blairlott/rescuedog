import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Loader2, Mail, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";

type Lead = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  source: string;
  vinoshipper_customer_id: string | null;
  vinoshipper_created_at: string | null;
  welcome_series_started_at: string | null;
  status: string;
  notes: string | null;
  created_at: string;
};

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  contacted: "bg-amber-100 text-amber-800",
  converted: "bg-green-100 text-green-800",
  unsubscribed: "bg-gray-100 text-gray-700",
  bounced: "bg-red-100 text-red-800",
};

export default function CrmLeadsPage() {
  const [search, setSearch] = useState("");
  const qc = useQueryClient();

  const { data: leads, isLoading } = useQuery({
    queryKey: ["crm-leads", search],
    queryFn: async () => {
      let q = supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (search.trim()) {
        q = q.or(
          `email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`,
        );
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("leads").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Status updated");
    qc.invalidateQueries({ queryKey: ["crm-leads"] });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-brand">Leads</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Guest-checkout customers from Vinoshipper who are receiving the welcome series but don't have a site account yet.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: ["crm-leads"] })}
        >
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by email or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading leads...
          </div>
        ) : !leads || leads.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            <Mail className="h-8 w-8 mx-auto mb-2 opacity-40" />
            No leads yet. Guest-checkout customers from Vinoshipper will appear here once the new site launches.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3">Email</th>
                  <th className="text-left px-4 py-3">Name</th>
                  <th className="text-left px-4 py-3">Source</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Welcome Series</th>
                  <th className="text-left px-4 py-3">VS Customer</th>
                  <th className="text-left px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{lead.email}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{lead.source}</td>
                    <td className="px-4 py-3">
                      <select
                        value={lead.status}
                        onChange={(e) => updateStatus(lead.id, e.target.value)}
                        className={`text-xs px-2 py-1 rounded border-0 cursor-pointer ${STATUS_COLORS[lead.status] ?? "bg-gray-100 text-gray-700"}`}
                      >
                        <option value="new">New</option>
                        <option value="contacted">Contacted</option>
                        <option value="converted">Converted</option>
                        <option value="unsubscribed">Unsubscribed</option>
                        <option value="bounced">Bounced</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {lead.welcome_series_started_at ? (
                        <Badge variant="secondary">Enqueued</Badge>
                      ) : (
                        <span>—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                      {lead.vinoshipper_customer_id ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(lead.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}