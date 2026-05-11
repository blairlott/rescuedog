import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function AmbassadorDirectoryPage() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    supabase.from("ambassador_profiles").select("handle,display_name,photo_url,bio").eq("status", "active").order("display_name")
      .then(({ data }) => { setList(data || []); setLoading(false); });
  }, []);

  const filtered = q
    ? list.filter(a => (a.display_name + " " + (a.bio || "")).toLowerCase().includes(q.toLowerCase()))
    : list;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-5xl mx-auto py-12 px-4 w-full">
        <div className="flex items-center justify-between flex-wrap gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold uppercase">Find an Ambassador</h1>
            <p className="text-muted-foreground text-sm mt-1">Shop wines through someone whose story you connect with.</p>
          </div>
          <Button asChild variant="outline"><Link to="/ambassadors">Become one</Link></Button>
        </div>
        <Input placeholder="Search ambassadors..." value={q} onChange={e => setQ(e.target.value)} className="mb-8 max-w-sm" />
        {loading ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">No ambassadors yet — check back soon!</p>
        ) : (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
            {filtered.map(a => (
              <Link key={a.handle} to={`/a/${a.handle}`} className="block border border-border p-5 hover:bg-muted transition text-center">
                {a.photo_url ? (
                  <img src={a.photo_url} alt={a.display_name} className="w-24 h-24 mx-auto object-cover mb-3" />
                ) : (
                  <div className="w-24 h-24 mx-auto bg-muted mb-3 flex items-center justify-center text-2xl font-bold">{a.display_name.charAt(0)}</div>
                )}
                <div className="font-bold uppercase">{a.display_name}</div>
                {a.bio && <p className="text-xs text-muted-foreground mt-2 line-clamp-3">{a.bio}</p>}
              </Link>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}