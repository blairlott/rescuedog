import { useState } from "react";
import { Globe, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGeo } from "@/hooks/useGeo";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "rdw_geo_notice_dismissed";

export function GeoNotice() {
  const { t } = useTranslation();
  const { country, isUS, loading, setOverrideUS } = useGeo();
  const [dismissed, setDismissed] = useState<boolean>(
    () => typeof window !== "undefined" && sessionStorage.getItem(DISMISS_KEY) === "1",
  );

  if (loading || isUS || !country || dismissed) return null;

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="bg-foreground text-background text-xs px-4 py-2.5 flex items-center justify-center gap-3 relative">
      <Globe className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
      <p className="flex-1 max-w-3xl text-center">
        <strong className="uppercase tracking-brand mr-2">{t("geo.banner_title")}</strong>
        <span className="opacity-80">{t("geo.banner_body")}</span>
      </p>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 px-2 text-[10px] uppercase tracking-brand text-background hover:text-background hover:bg-background/10"
        onClick={() => setOverrideUS(true)}
      >
        I'm in the US
      </Button>
      <button
        onClick={dismiss}
        className="p-1 hover:opacity-80"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}