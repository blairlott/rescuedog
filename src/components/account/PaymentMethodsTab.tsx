import { Button } from "@/components/ui/button";
import { CreditCard, Shield, ExternalLink } from "lucide-react";

export const PaymentMethodsTab = ({ vinoshipperLinked }: { vinoshipperLinked: boolean }) => {
  return (
    <div className="space-y-4">
      <div className="border border-border p-5">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-primary mt-0.5" />
          <div>
            <h3 className="font-bold text-foreground">Cards are stored on Vinoshipper</h3>
            <p className="text-sm text-muted-foreground mt-1">
              For PCI compliance and wine-shipping regulations, your payment methods are securely stored
              by Vinoshipper. Rescue Dog Wines never sees or stores your full card number.
            </p>
          </div>
        </div>
      </div>

      {vinoshipperLinked ? (
        <div className="border border-border p-5">
          <CreditCard className="w-8 h-8 text-muted-foreground mb-3" />
          <h4 className="font-bold text-foreground">Manage Cards on Vinoshipper</h4>
          <p className="text-sm text-muted-foreground mb-4">
            Add, remove, or update your saved payment methods directly in your Vinoshipper account.
            Changes apply automatically to your wine club shipments and Subscribe & Save orders.
          </p>
          <Button asChild className="gap-2">
            <a href="https://vinoshipper.com/account/payment-methods" target="_blank" rel="noreferrer">
              Open Vinoshipper Wallet <ExternalLink className="w-4 h-4" />
            </a>
          </Button>
        </div>
      ) : (
        <div className="border border-border p-5 text-center">
          <p className="text-sm text-muted-foreground">Link your Vinoshipper account in the Profile tab first.</p>
        </div>
      )}
    </div>
  );
};