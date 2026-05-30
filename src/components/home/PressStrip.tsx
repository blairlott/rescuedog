import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getPressLogo } from "@/lib/pressLogoMap";
import { T } from "@/components/T";
import { useCmsContent, getCmsValue } from "@/hooks/useCmsContent";
import { CmsEditButton } from "@/components/cms/CmsEditButton";
import { CmsEditDialog, CmsField } from "@/components/cms/CmsEditDialog";

// "A" = SVG uses fill="currentColor" → text-stone-500 styles it.
// "B" = brand-color SVG → CSS grayscale filter to neutralize.
const RENDER_APPROACH: Record<string, "A" | "B"> = {
  forbes: "A",
  "sf-chronicle": "A",
  gma3: "B",
  "wine-enthusiast": "A",
  "lodi-wine-commission": "A",
  "press-democrat": "B",
  "this-dogs-life": "A",
  "nashville-scene": "A",
};

type Row = {
  outlet_name: string;
  outlet_slug: string;
  logo_asset_slug: string;
  article_url: string | null;
  article_title: string | null;
  display_order: number;
};

const FILTER_B = "grayscale(1) brightness(0.4) opacity(0.85)";

export const PressStrip = () => {
  const { content, upsert } = useCmsContent("home");
  const [editOpen, setEditOpen] = useState(false);
  const eyebrow = getCmsValue(content, "press_recognition", "eyebrow", "");
  const heading = getCmsValue(content, "press_recognition", "heading", "As Recognized By");
  const subheading = getCmsValue(content, "press_recognition", "subheading", "");

  const { data: rows = [] } = useQuery({
    queryKey: ["press-strip-homepage"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await (supabase as any)
        .from("press_mentions")
        .select("outlet_name,outlet_slug,logo_asset_slug,article_url,article_title,display_order")
        .eq("status", "active")
        .eq("show_on_homepage", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  if (!rows.length) return null;

  return (
    <section className="py-8 border-y border-border bg-background">
      <div className="container mx-auto px-4">
        <div className="relative text-center mb-4">
          <CmsEditButton onClick={() => setEditOpen(true)} label="Edit heading" scope="marketing" />
          {eyebrow && (
            <p className="text-[10px] tracking-brand uppercase text-muted-foreground/70 mb-1 font-bold">
              <T>{eyebrow}</T>
            </p>
          )}
          <p className="text-[11px] tracking-brand uppercase text-muted-foreground font-bold">
            <T>{heading}</T>
          </p>
          {subheading && (
            <p className="text-xs text-muted-foreground/80 mt-1">
              <T>{subheading}</T>
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
          {rows.map((row) => {
            const logo = getPressLogo(row.logo_asset_slug);
            if (!logo) return null;
            const approach = RENDER_APPROACH[row.outlet_slug] ?? "A";
            const clickable = !!row.article_url;
            const imgClass = "h-10 md:h-12 w-auto object-contain transition duration-200";
            const img =
              approach === "A" ? (
                <span
                  className={
                    clickable
                      ? "inline-block text-stone-500 hover:text-stone-700 transition-colors duration-200"
                      : "inline-block text-stone-500"
                  }
                >
                  <img src={logo.src} alt={logo.alt} loading="lazy" className={imgClass} />
                </span>
              ) : (
                <img
                  src={logo.src}
                  alt={logo.alt}
                  loading="lazy"
                  className={imgClass + (clickable ? " hover:opacity-100" : "")}
                  style={{ filter: FILTER_B, opacity: clickable ? 0.85 : 0.85 }}
                />
              );
            return clickable ? (
              <a
                key={row.outlet_slug}
                href={row.article_url!}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={row.article_title || row.outlet_name}
                title={row.article_title || row.outlet_name}
                className="cursor-pointer"
              >
                {img}
              </a>
            ) : (
              <span key={row.outlet_slug} title={row.article_title || row.outlet_name}>
                {img}
              </span>
            );
          })}
        </div>
      </div>
      <CmsEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title='Edit "As Recognized By" Heading'
        fields={[
          { key: "eyebrow", label: "Eyebrow / tag (optional)", type: "text", value: eyebrow },
          { key: "heading", label: "Section heading", type: "text", value: heading },
          { key: "subheading", label: "Subheading (optional)", type: "text", value: subheading },
        ] as CmsField[]}
        onSave={(values) =>
          upsert.mutate(
            { sectionKey: "press_recognition", content: values },
            { onSuccess: () => setEditOpen(false) }
          )
        }
        isSaving={upsert.isPending}
      />
    </section>
  );
};

export default PressStrip;