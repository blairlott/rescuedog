import { useEffect, useRef, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { useCmsAuth } from "@/hooks/useCmsAuth";

interface Props {
  value: string;
  onSave: (next: string) => void;
  isSaving?: boolean;
  ariaLabel?: string;
}

/**
 * Inline-editable banner text for CMS users with branding scope.
 * Click the pencil to edit in place. Enter saves, Esc cancels.
 */
export const InlineBannerEditor = ({ value, onSave, isSaving, ariaLabel = "Banner text" }: Props) => {
  const { canEdit } = useCmsAuth();
  const editable = canEdit("branding");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== value) onSave(next);
    setEditing(false);
  };

  if (!editable) {
    return <p className="text-[11px] sm:text-sm tracking-wide leading-tight px-6 sm:px-0">{value}</p>;
  }

  if (editing) {
    return (
      <div className="flex items-center justify-center gap-2 max-w-3xl mx-auto">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            if (e.key === "Escape") { e.preventDefault(); setEditing(false); }
          }}
          aria-label={ariaLabel}
          disabled={isSaving}
          className="flex-1 bg-primary-foreground/10 border border-primary-foreground/40 text-primary-foreground placeholder:text-primary-foreground/60 text-sm tracking-wide px-2 py-1 outline-none focus:border-primary-foreground"
        />
        <button
          type="button"
          onClick={commit}
          disabled={isSaving}
          className="p-1 hover:bg-primary-foreground/20 rounded-sm"
          aria-label="Save banner"
        >
          <Check className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={isSaving}
          className="p-1 hover:bg-primary-foreground/20 rounded-sm"
          aria-label="Cancel edit"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group inline-flex items-center gap-2 text-sm tracking-wide hover:opacity-90"
      title="Click to edit banner"
    >
      <span>{value}</span>
      <Pencil className="h-3 w-3 opacity-60 group-hover:opacity-100" />
    </button>
  );
};