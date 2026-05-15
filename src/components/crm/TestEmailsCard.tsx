import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export function TestEmailsCard() {
  const [recipient, setRecipient] = useState("blair.lott@rescuedogwines.com");
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const sendAll = async () => {
    if (!recipient.includes("@")) {
      toast.error("Enter a valid email address");
      return;
    }
    setSending(true);
    setLastResult(null);
    const { data, error } = await supabase.functions.invoke("send-test-emails", {
      body: { recipient },
    });
    setSending(false);
    if (error) {
      toast.error(`Failed: ${error.message}`);
      return;
    }
    setLastResult(data);
    const ok = data?.results?.filter((r: any) => r.ok).length ?? 0;
    const total = data?.count ?? 0;
    toast.success(`Queued ${ok}/${total} test emails to ${recipient}`);
  };

  return (
    <div className="mt-8 border border-border bg-background p-6">
      <div className="flex items-center gap-2 mb-2">
        <Mail className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold text-foreground">Email System Test</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Sends one of every transactional template (using each template's preview data) through{" "}
        <code>notify.rescuedog.com</code>. Use this after DNS verifies, or anytime you want to spot-check
        deliverability and styling.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1">
          <Label htmlFor="test-email-recipient">Send all test emails to</Label>
          <Input
            id="test-email-recipient"
            type="email"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            disabled={sending}
          />
        </div>
        <Button onClick={sendAll} disabled={sending} className="gap-2">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          {sending ? "Sending…" : "Send Test Emails"}
        </Button>
      </div>
      {lastResult?.results && (
        <div className="mt-4 text-sm">
          <p className="font-semibold mb-2">Last run ({lastResult.runId}):</p>
          <ul className="space-y-1">
            {lastResult.results.map((r: any) => (
              <li key={r.template} className="flex items-center gap-2">
                <span className={r.ok ? "text-green-600" : "text-destructive"}>
                  {r.ok ? "✓" : "✗"}
                </span>
                <code className="text-xs">{r.template}</code>
                {r.error && <span className="text-xs text-destructive">{r.error}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Delivery is async via the email queue — check the inbox in a minute or two. Auth emails
            (signup, reset, magic link) fire from real auth flows, not from this button.
          </p>
        </div>
      )}
    </div>
  );
}