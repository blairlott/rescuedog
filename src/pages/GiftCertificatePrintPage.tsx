import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, PawPrint, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Seo } from "@/components/Seo";

const TIER_LABEL: Record<string, string> = {
  pup: "Pup Pack — 3 bottles",
  rescue: "Rescue Pack — 6 bottles",
  pack: "Full Pack — 12 bottles",
};

const GiftCertificatePrintPage = () => {
  const { id } = useParams();

  const { data: gift, isLoading } = useQuery({
    queryKey: ["gift-print", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("gift_certificates").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (gift) setTimeout(() => window.print(), 400);
  }, [gift]);

  if (isLoading) return <div className="min-h-dvh flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  if (!gift) return <div className="min-h-dvh flex items-center justify-center text-muted-foreground">Gift not found.</div>;

  return (
    <>
      <Seo noindex title="Gift Certificate Print" />
    <div className="min-h-dvh bg-background p-8 print:p-0">
      <div className="no-print max-w-2xl mx-auto mb-4 flex justify-end">
        <Button onClick={() => window.print()} className="gap-2"><Printer className="w-4 h-4" />Print Again</Button>
      </div>
      <div className="max-w-2xl mx-auto border-4 border-foreground p-12 bg-background">
        <div className="flex items-center justify-center gap-3 mb-6">
          <PawPrint className="w-10 h-10 text-primary" />
          <h1 className="text-2xl font-bold tracking-wider uppercase">Rescue Dog Wines</h1>
        </div>
        <div className="text-center border-y-2 border-foreground py-6 mb-6">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Wine Club Gift Certificate</p>
          <h2 className="text-3xl font-bold text-foreground">{TIER_LABEL[gift.tier] || gift.tier}</h2>
          <p className="text-lg text-foreground mt-1">{gift.shipments_count} shipment{gift.shipments_count > 1 ? "s" : ""}</p>
        </div>
        <div className="text-center mb-6">
          <p className="text-sm text-muted-foreground">Presented to</p>
          <p className="text-2xl font-bold text-foreground my-1">{gift.recipient_name}</p>
          {gift.personal_note && <p className="italic text-foreground mt-3 max-w-md mx-auto">"{gift.personal_note}"</p>}
        </div>
        <div className="bg-foreground text-background p-4 text-center my-6">
          <p className="text-xs uppercase tracking-widest mb-1">Redemption Code</p>
          <p className="text-3xl font-mono font-bold tracking-[0.3em]">{gift.code}</p>
        </div>
        <div className="text-center text-sm text-muted-foreground">
          Redeem at <strong className="text-foreground">rescuedogwines.com/club</strong>
        </div>
        <div className="text-center text-xs text-muted-foreground mt-8 pt-4 border-t border-border">
          Every shipment supports rescue dogs nationwide. 🐾
        </div>
      </div>
      <style>{`@media print { .no-print { display: none !important; } body { background: white !important; } }`}</style>
    </div>
    </>
  );
};

export default GiftCertificatePrintPage;