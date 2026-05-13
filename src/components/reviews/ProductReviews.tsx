import { useEffect, useState } from "react";
import { Star, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { toast } from "sonner";

interface Review {
  id: string;
  reviewer_name: string;
  rating: number;
  title: string | null;
  body: string | null;
  verified_purchase: boolean;
  created_at: string;
}

export function useProductRating(productHandle: string) {
  const [rating, setRating] = useState<{ value: number; count: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("product_reviews")
        .select("rating")
        .eq("product_handle", productHandle)
        .eq("status", "published");
      if (cancelled || !data || data.length === 0) return;
      const sum = data.reduce((s, r) => s + (r.rating || 0), 0);
      setRating({ value: sum / data.length, count: data.length });
    })();
    return () => { cancelled = true; };
  }, [productHandle]);
  return rating;
}

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={n <= Math.round(value) ? "fill-primary text-primary" : "text-muted-foreground"}
          style={{ width: size, height: size }}
        />
      ))}
    </div>
  );
}

export function ProductReviews({ productHandle }: { productHandle: string }) {
  const { user } = useCustomerAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState({ rating: 5, title: "", body: "", name: "" });

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("product_reviews")
        .select("id, reviewer_name, rating, title, body, verified_purchase, created_at")
        .eq("product_handle", productHandle)
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(20);
      setReviews(data ?? []);
      setLoading(false);
    })();
  }, [productHandle]);

  const submit = async () => {
    if (!user) {
      toast.error("Please sign in to leave a review");
      return;
    }
    if (!draft.body.trim()) {
      toast.error("Add a few words about the wine");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("product_reviews").insert({
      product_handle: productHandle,
      user_id: user.id,
      reviewer_name: draft.name || user.email?.split("@")[0] || "Customer",
      reviewer_email: user.email,
      rating: draft.rating,
      title: draft.title || null,
      body: draft.body,
      status: "pending",
    });
    setSubmitting(false);
    if (error) {
      toast.error("Could not submit review");
      return;
    }
    toast.success("Thanks! Your review will appear after approval.");
    setShowForm(false);
    setDraft({ rating: 5, title: "", body: "", name: "" });
  };

  const avg = reviews.length
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : 0;

  return (
    <section className="border-t border-border pt-8 mt-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold uppercase tracking-brand">Reviews</h2>
          {reviews.length > 0 && (
            <div className="flex items-center gap-2 mt-1">
              <Stars value={avg} size={16} />
              <span className="text-sm text-muted-foreground">
                {avg.toFixed(1)} · {reviews.length} review{reviews.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowForm((s) => !s)}
          className="uppercase tracking-brand text-xs font-bold"
        >
          Write a review
        </Button>
      </div>

      {showForm && (
        <div className="border border-border p-4 space-y-3 bg-card">
          {!user && (
            <p className="text-xs text-muted-foreground">
              Sign in to submit a review. Reviews appear after a quick admin check.
            </p>
          )}
          <div>
            <Label className="text-xs uppercase tracking-brand">Rating</Label>
            <div className="flex items-center gap-1 mt-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setDraft({ ...draft, rating: n })}
                  className="p-1"
                >
                  <Star
                    className={n <= draft.rating ? "fill-primary text-primary h-6 w-6" : "text-muted-foreground h-6 w-6"}
                  />
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="rev-name" className="text-xs uppercase tracking-brand">Display name</Label>
            <Input
              id="rev-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="How you'd like to appear"
            />
          </div>
          <div>
            <Label htmlFor="rev-title" className="text-xs uppercase tracking-brand">Headline</Label>
            <Input
              id="rev-title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="Sums it up"
            />
          </div>
          <div>
            <Label htmlFor="rev-body" className="text-xs uppercase tracking-brand">Your review</Label>
            <Textarea
              id="rev-body"
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              placeholder="What did you love? Pairings, occasion, anything else worth sharing."
              rows={4}
            />
          </div>
          <Button onClick={submit} disabled={submitting || !user} className="uppercase tracking-brand text-xs font-bold">
            {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting</> : "Submit review"}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="py-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reviews yet — be the first.</p>
      ) : (
        <ul className="space-y-5">
          {reviews.map((r) => (
            <li key={r.id} className="border-b border-border pb-4 last:border-b-0">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Stars value={r.rating} />
                  {r.title && <span className="font-bold text-sm">{r.title}</span>}
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </div>
              <p className="text-sm mt-1">
                <span className="font-semibold">{r.reviewer_name}</span>
                {r.verified_purchase && (
                  <span className="ml-2 text-[10px] uppercase tracking-brand text-primary font-bold">Verified purchase</span>
                )}
              </p>
              {r.body && <p className="text-sm text-foreground mt-2 leading-relaxed">{r.body}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}