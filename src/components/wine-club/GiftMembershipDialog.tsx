import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Gift, Wine, Percent } from "lucide-react";
import {
  useWineClubTiers,
  useJoinClub,
  type WineClubTier,
  type JoinClubData,
} from "@/hooks/useWineClub";
import { ClubSignupForm } from "@/components/wine-club/ClubSignupForm";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const frequencyLabel: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  "bi-annual": "Bi-Annual",
  yearly: "Yearly",
};

export function GiftMembershipDialog({ open, onOpenChange }: Props) {
  const { data: tiers, isLoading } = useWineClubTiers();
  const joinClub = useJoinClub();
  const [selectedTier, setSelectedTier] = useState<WineClubTier | null>(null);

  const handleClose = (next: boolean) => {
    if (!next) setSelectedTier(null);
    onOpenChange(next);
  };

  const handleSubmit = (data: JoinClubData) => {
    joinClub.mutate(
      { ...data, is_gift: true },
      {
        onSuccess: () => {
          setSelectedTier(null);
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            {selectedTier ? `Gift ${selectedTier.name}` : "Gift a Wine Club Membership"}
          </DialogTitle>
          <DialogDescription>
            {selectedTier
              ? "Tell us who this is for — we'll handle the rest."
              : "Pick a tier to gift. We'll ship directly to your recipient and email them their gift announcement."}
          </DialogDescription>
        </DialogHeader>

        {!selectedTier ? (
          <div className="space-y-3 py-2">
            {isLoading && (
              <p className="text-sm text-muted-foreground">Loading tiers…</p>
            )}
            {(tiers ?? []).map((tier) => (
              <button
                key={tier.id}
                type="button"
                onClick={() => setSelectedTier(tier)}
                className="w-full text-left border border-border hover:border-primary p-5 transition-colors group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <Wine className="h-6 w-6 text-primary mt-0.5 shrink-0" />
                    <div>
                      <p className="font-bold text-foreground group-hover:text-primary">
                        {tier.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {tier.bottle_count} bottles · {frequencyLabel[tier.frequency] || tier.frequency}
                      </p>
                      {tier.description && (
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                          {tier.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs font-bold px-2 py-1 uppercase tracking-brand shrink-0">
                    <Percent className="h-3 w-3" />
                    {tier.discount_percent}% Off
                  </span>
                </div>
              </button>
            ))}
            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <ClubSignupForm
            tier={selectedTier}
            onBack={() => setSelectedTier(null)}
            onSubmit={handleSubmit}
            isSubmitting={joinClub.isPending}
            lockGift
            backLabel="Back to tier selection"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}