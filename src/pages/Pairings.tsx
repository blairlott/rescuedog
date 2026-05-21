import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ChefHat } from "lucide-react";

type Recipe = { id: string; slug: string; title: string; excerpt: string | null; cover_image: string | null };

export default function Pairings() {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);

  useEffect(() => {
    supabase.from("recipes").select("id, slug, title, excerpt, cover_image").eq("published", true).order("created_at", { ascending: false }).then(({ data }) => {
      setRecipes((data as Recipe[]) || []);
    });
  }, []);

  return (
    <div className="min-h-dvh flex flex-col">
      <Header />
      <main className="flex-1">
        <div className="container mx-auto px-4 py-12 md:py-20">
          <div className="text-center mb-12">
            <ChefHat className="h-8 w-8 text-primary mx-auto mb-3" />
            <h1 className="font-display text-4xl md:text-5xl font-bold mb-3">Recipes & Wine Pairings</h1>
            <p className="text-muted-foreground max-w-xl mx-auto">Hand-picked recipes paired with the perfect Rescue Dog Wines bottle.</p>
          </div>
          {recipes === null ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : recipes.length === 0 ? (
            <p className="text-center text-muted-foreground">No pairings published yet — check back soon.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recipes.map(r => (
                <Link key={r.id} to={`/pairings/${r.slug}`} className="group border border-border bg-background hover:shadow-lg transition-shadow">
                  {r.cover_image && (
                    <div className="aspect-[4/3] overflow-hidden bg-secondary">
                      <img src={r.cover_image} alt={r.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
                    </div>
                  )}
                  <div className="p-5 space-y-2">
                    <h2 className="font-display text-xl font-bold group-hover:text-primary transition-colors">{r.title}</h2>
                    {r.excerpt && <p className="text-sm text-muted-foreground line-clamp-3">{r.excerpt}</p>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}