import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Lightbulb } from "lucide-react";

interface Props {
  userId: string;
  userEmail: string | null;
  userName?: string | null;
}

export function FeatureRequestBox({ userId, userEmail, userName }: Props) {
  const { toast } = useToast();
  const [area, setArea] = useState("");
  const [request, setRequest] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!request.trim()) return;
    setSubmitting(true);
    const { error } = await supabase.from("feature_requests").insert({
      user_id: userId,
      user_email: userEmail,
      user_name: userName ?? null,
      area: area.trim() || null,
      request: request.trim(),
    });
    setSubmitting(false);
    if (error) {
      toast({ title: "Could not submit", description: error.message, variant: "destructive" });
      return;
    }
    setArea("");
    setRequest("");
    toast({ title: "Feature request sent", description: "Thanks — the owner will see this in the admin inbox." });
  };

  return (
    <div className="border border-border bg-background p-6">
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb className="h-5 w-5 text-primary" />
        <h3 className="font-bold text-foreground">Submit a feature request</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Have an idea or improvement? Send it straight to the owner.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <Label htmlFor="fr-area" className="text-xs uppercase tracking-brand">Area (optional)</Label>
          <Input
            id="fr-area"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="e.g. CRM, Finance, Shop"
          />
        </div>
        <div>
          <Label htmlFor="fr-request" className="text-xs uppercase tracking-brand">Your request</Label>
          <Textarea
            id="fr-request"
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder="Describe the feature, fix, or improvement…"
            rows={4}
            required
          />
        </div>
        <Button type="submit" disabled={submitting || !request.trim()}>
          {submitting ? "Sending…" : "Send to owner"}
        </Button>
      </form>
    </div>
  );
}