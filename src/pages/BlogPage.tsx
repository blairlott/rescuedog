import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useWpPosts } from "@/hooks/useWordpress";
import { Loader2 } from "lucide-react";

const BlogPage = () => {
  const { data: posts, isLoading } = useWpPosts(20);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-3xl">
          <h1 className="font-display text-4xl font-bold mb-2">News &amp; Stories</h1>
          <p className="text-muted-foreground mb-10">From the vineyard, the rescue community, and our team.</p>

          {isLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : !posts || posts.length === 0 ? (
            <p className="text-muted-foreground">No posts yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {posts.map((p) => (
                <li key={p.id} className="py-6">
                  <Link to={`/blog/${p.slug}`} className="block group">
                    <p className="text-[10px] uppercase tracking-brand text-muted-foreground mb-1">
                      {new Date(p.date).toLocaleDateString()}
                      {p._embedded?.author?.[0]?.name ? ` · ${p._embedded.author[0].name}` : ""}
                    </p>
                    <h2 className="text-2xl font-display font-bold group-hover:text-primary transition-colors" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(p.title.rendered) }} />
                    <div className="text-muted-foreground mt-2 text-sm" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(p.excerpt.rendered) }} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default BlogPage;