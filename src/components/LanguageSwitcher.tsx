import { Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGS } from "@/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { i18n, t } = useTranslation();
  const current = (i18n.resolvedLanguage || i18n.language || "en").slice(0, 2);
  const handleSelect = (lng: string) => {
    const prev = current;
    i18n.changeLanguage(lng);
    try { localStorage.setItem("rdw_lang", lng); } catch {}
    const hasReloaded = (() => { try { return localStorage.getItem("rdw_lang_reloaded") === "1"; } catch { return false; } })();
    if (lng !== prev && !hasReloaded) {
      try { localStorage.setItem("rdw_lang_reloaded", "1"); } catch {}
      setTimeout(() => window.location.reload(), 50);
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex items-center gap-1.5 px-2 py-1 text-xs uppercase tracking-brand text-foreground hover:text-primary transition-colors border border-transparent hover:border-border"
        aria-label={t("language.label")}
      >
        <Globe className="h-4 w-4" />
        {!compact && <span>{current.toUpperCase()}</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        {SUPPORTED_LANGS.map((lng) => (
          <DropdownMenuItem
            key={lng}
            onSelect={() => handleSelect(lng)}
            className={`text-xs uppercase tracking-brand ${
              current === lng ? "font-bold text-primary" : ""
            }`}
          >
            {t(`language.${lng}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}