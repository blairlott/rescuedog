import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useProductByHandle } from "@/hooks/useProducts";
import { Loader2, ArrowLeft, Wine } from "lucide-react";
import { Button } from "@/components/ui/button";

type Recipe = {
  id: string; slug: string; title: string; excerpt: string | null; body_html: string | null;
  cover_image: string | null; recommended_product_handle: string | null; pairing_notes: string | null;
};

export default function PairingDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(undefined);

  useEffect(() => {
    if (!slug) return;
    supabase.from("recipes").select("*").eq("slug", slug).eq("published", true).maybeSingle().then(({ data }) => {
      setRecipe((data as Recipe) || null);
    });
  }, [slug]);

  const { data: product } = useProductByHandle(recipe?.recommended_product_handle || "");

  if (recipe === undefined) {
    return <div className="min-h-screen flex flex-col"><Header /><div className="flex-1 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div></div>;
  }
  if (recipe === null) {
    return (
      <div className="min-h-screen flex flex-col"><Header />
        <div className="flex-1 flex items-center justify-center text-center">
          <div>
            <h1 className="font-display text-2xl font-bold mb-3">Pairing not found</h1>
            <Button asChild variant="outline"><Link to="/pairings"><ArrowLeft className="mr-2 h-4 w-4" />Back to Pairings</Link></Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <article className="container mx-auto px-4 py-10 md:py-16 max-w-3xl">
          <Link to="/pairings" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center mb-4"><ArrowLeft className="h-4 w-4 mr-1" /> All pairings</Link>
          <h1 className="font-display text-3xl md:text-5xl font-bold mb-4">{recipe.title}</h1>
          {recipe.excerpt && <p className="text-lg text-muted-foreground mb-6">{recipe.excerpt}</p>}
          {recipe.cover_image && <img src={recipe.cover_image} alt={recipe.title} className="w-full aspect-[16/9] object-cover mb-8" />}

          {product && (
            <aside className="border border-primary/30 bg-primary/5 p-5 mb-8 flex items-center gap-4">
              {product.images.edges[0] && <img src={product.images.edges[0].node.url} alt="" className="w-20 h-20 object-cover" />}
              <div className="flex-1">
                <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-primary font-bold mb-1"><Wine className="h-3.5 w-3.5" /> Recommended pairing</div>
                <p className="font-display text-lg font-bold">{product.title}</p>
                {recipe.pairing_notes && <p className="text-sm text-muted-foreground mt-1">{recipe.pairing_notes}</p>}
              </div>
              <Button asChild><Link to={`/product/${product.handle}`}>Shop</Link></Button>
            </aside>
          )}

          {recipe.body_html && (
            <div className="prose prose-sm md:prose-base max-w-none" dangerouslySetInnerHTML={{ __html: recipe.body_html }} />
          )}
        </article>
      </main>
      <Footer />
    </div>
  );
}