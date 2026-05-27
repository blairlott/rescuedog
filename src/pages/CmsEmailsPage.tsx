import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Mail, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Seo } from "@/components/Seo";

type LogRow = {
  id: string;
  message_id: string | null;
  template_name: string;
  recipient_email: string;
  status: string;
  error_message: string | null;
  created_at: string;
};

const statusTone = (s: string) =>
  s === "sent" ? "bg-green-100 text-green-800 border-green-300"
  : s === "pending" ? "bg-amber-100 text-amber-800 border-amber-300"
  : s === "suppressed" ? "bg-yellow-100 text-yellow-900 border-yellow-300"
  : "bg-red-100 text-red-800 border-red-300";

export default function CmsEmailsPage() {
  const [hours, setHours] = useState(168);
  const [template, setTemplate] = useState<string>("welcome-1-story");
  const [recipient, setRecipient] = useState("blair.lott@rescuedogwines.com");
  const [sending, setSending] = useState(false);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["email-qa-logs"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("email-qa-logs", {
        method: "GET" as any,
        body: undefined,
      });
      if (error) throw error;
      return data as {
        ok: true;
        stats: { total: number; sent: number; pending: number; failed: number; dlq: number; suppressed: number };
        logs: LogRow[];
        templates: string[];
      };
    },
    refetchInterval: 15_000,
  });

  const sendOne = async () => {
    if (!recipient.includes("@")) { toast.error("Enter a valid email"); return; }
    setSending(true);
    const { error } = await supabase.functions.invoke("send-transactional-email", {
      body: {
        templateName: template,
        recipientEmail: recipient,
        idempotencyKey: `qa-${template}-${Date.now()}`,
      },
    });
    setSending(false);
    if (error) { toast.error(`Send failed: ${error.message}`); return; }
    toast.success(`Queued ${template} → ${recipient}`);
    setTimeout(() => refetch(), 2000);
  };

  const sendAll = async () => {
    if (!recipient.includes("@")) { toast.error("Enter a valid email"); return; }
    setSending(true);
    const { data, error } = await supabase.functions.invoke("send-test-emails", {
      body: { recipient },
    });
    setSending(false);
    if (error) { toast.error(`Send failed: ${error.message}`); return; }
    const ok = (data as any)?.results?.filter((r: any) => r.ok).length ?? 0;
    const total = (data as any)?.count ?? 0;
    toast.success(`Queued ${ok}/${total} templates → ${recipient}`);
    setTimeout(() => refetch(), 3000);
  };

  const stats = data?.stats;
  const templates = data?.templates ?? [];
  const cutoff = Date.now() - hours * 3600 * 1000;
  const visibleLogs = (data?.logs ?? []).filter(r => new Date(r.created_at).getTime() >= cutoff);

  return (
    <>
      <Seo noindex title="Cms Emails" />
    <div className="min-h-dvh bg-background p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link to="/cms" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2">
            <ArrowLeft className="h-3 w-3" /> Back to CMS
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Mail className="h-6 w-6 text-primary" /> Email QA
          </h1>
          <p className="text-sm text-muted-foreground">Send test emails and monitor the live send log.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>

      {/* Send test */}
      <div className="border border-border bg-card p-5 mb-6">
        <h2 className="font-bold mb-3">Send a test</h2>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto] gap-3 items-end">
          <div>
            <Label>Template</Label>
            <Select value={template} onValueChange={setTemplate}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                {(templates.length ? templates : [template]).map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Recipient</Label>
            <Input type="email" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
          </div>
          <Button onClick={sendOne} disabled={sending}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
            Send one
          </Button>
          <Button onClick={sendAll} disabled={sending} variant="outline">Send all</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {[
          ["Total", stats?.total ?? 0, ""],
          ["Sent", stats?.sent ?? 0, "text-green-700"],
          ["Pending", stats?.pending ?? 0, "text-amber-700"],
          ["Failed / DLQ", (stats?.failed ?? 0) + (stats?.dlq ?? 0), "text-red-700"],
          ["Suppressed", stats?.suppressed ?? 0, "text-yellow-800"],
        ].map(([label, val, tone]) => (
          <div key={label as string} className="border border-border bg-card p-4">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label as string}</div>
            <div className={`text-2xl font-bold ${tone as string}`}>{val as number}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-3 text-sm">
        <span className="text-muted-foreground">Window:</span>
        {[
          [24, "24h"], [168, "7d"], [720, "30d"],
        ].map(([h, label]) => (
          <button
            key={label as string}
            onClick={() => setHours(h as number)}
            className={`px-2 py-1 border ${hours === h ? "bg-foreground text-background" : "bg-card"}`}
          >{label as string}</button>
        ))}
      </div>

      {/* Log table */}
      <div className="border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr className="text-left">
              <th className="p-2">When</th>
              <th className="p-2">Template</th>
              <th className="p-2">Recipient</th>
              <th className="p-2">Status</th>
              <th className="p-2">Error</th>
            </tr>
          </thead>
          <tbody>
            {visibleLogs.map(r => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-2 whitespace-nowrap text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td className="p-2 font-mono text-xs">{r.template_name}</td>
                <td className="p-2">{r.recipient_email}</td>
                <td className="p-2">
                  <span className={`inline-block px-2 py-0.5 text-xs border ${statusTone(r.status)}`}>{r.status}</span>
                </td>
                <td className="p-2 text-xs text-destructive max-w-md truncate">{r.error_message ?? ""}</td>
              </tr>
            ))}
            {!visibleLogs.length && (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No emails in this window.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
}