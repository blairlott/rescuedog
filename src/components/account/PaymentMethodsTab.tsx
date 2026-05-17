import { CreditCard, Shield } from "lucide-react";

export const PaymentMethodsTab = (_props: { vinoshipperLinked?: boolean }) => {
  return (
    <div className="space-y-4">
      <div className="border border-border p-5">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-primary mt-0.5" />
          <div>
            <h3 className="font-bold text-foreground">Your payment is secure</h3>
            <p className="text-sm text-muted-foreground mt-1">
              For PCI compliance and wine-shipping regulations, payment methods are securely
              tokenized by our payment processor. Rescue Dog Wines never sees or stores your
              full card number.
            </p>
          </div>
        </div>
      </div>

      <div className="border border-border p-5">
        <CreditCard className="w-8 h-8 text-muted-foreground mb-3" />
        <h4 className="font-bold text-foreground">Saved cards</h4>
        <p className="text-sm text-muted-foreground">
          You'll be able to manage saved payment methods here soon. For now, your card is
          entered securely at checkout for each order.
        </p>
      </div>
    </div>
  );
};