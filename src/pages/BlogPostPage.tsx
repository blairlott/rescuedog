import { useParams, Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useWpPost } from "@/hooks/useWordpress";
import { ArrowLeft, Loader2 } from "lucide-react";
import DOMPurify from "dompurify";

const BlogPostPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const { data: post, isLoading } = useWpPost(slug);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center text-center px-4">
          <div>
            <h1 className="font-display text-2xl font-bold mb-4">Post not found</h1>
            <Link to="/blog" className="text-primary underline">Back to blog</Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 py-12">
        <article className="container mx-auto px-4 max-w-2xl">
          <Link to="/blog" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to blog
          </Link>
          <p className="text-[10px] uppercase tracking-brand text-muted-foreground mb-2">
            {new Date(post.date).toLocaleDateString()}
            {post._embedded?.author?.[0]?.name ? ` · ${post._embedded.author[0].name}` : ""}
          </p>
          <h1 className="font-display text-4xl font-bold mb-6" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.title.rendered) }} />
          <div className="prose prose-neutral max-w-none" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.content.rendered) }} />
        </article>
      </main>
      <Footer />
    </div>
  );
};

export default BlogPostPage;