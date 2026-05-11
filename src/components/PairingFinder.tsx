import { useState } from "react";
import { ChefHat, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const STARTERS = ["Grilled steak", "Pasta carbonara", "Roasted salmon", "Cheese board", "Spicy tacos"];

export function PairingFinder() {
  const [dish, setDish] = useState("");

  const submit = (text?: string) => {
    const food = (text ?? dish).trim();
    if (!food) return;
    const prompt = `I'm having ${food} tonight. Recommend 1-3 wines from your catalog that pair well, with a one-sentence reason for each.`;
    window.dispatchEvent(new CustomEvent("rdw:sommelier-open", { detail: { prompt } }));
  };

  return (
    <section className="bg-secondary/40 border-y border-border">
      <div className="container mx-auto px-4 py-12 md:py-16">
        <div className="max-w-2xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2 text-primary">
            <ChefHat className="h-5 w-5" />
            <span className="text-xs uppercase tracking-widest font-bold">AI Sommelier</span>
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-bold">What's for dinner?</h2>
          <p className="text-muted-foreground">Tell us what you're cooking — we'll pair it with the perfect bottle.</p>
          <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex gap-2 max-w-md mx-auto pt-2">
            <Input
              value={dish}
              onChange={(e) => setDish(e.target.value)}
              placeholder="e.g. grilled lamb chops"
              maxLength={120}
              className="flex-1"
            />
            <Button type="submit" disabled={!dish.trim()}>
              <Send className="h-4 w-4 mr-2" /> Pair it
            </Button>
          </form>
          <div className="flex flex-wrap gap-2 justify-center pt-2">
            {STARTERS.map(s => (
              <button
                key={s}
                onClick={() => submit(s)}
                className="text-xs px-3 py-1 border border-border bg-background hover:bg-primary hover:text-primary-foreground transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}