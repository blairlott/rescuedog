import { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Lock, Save } from "lucide-react";

const PLACEHOLDER = "Coming Soon! Insights from Bob.";

interface Props {
  tileKey: string;
  value: string;
  canEdit: boolean;
  onSave: (next: string) => void | Promise<void>;
}

/** Editable per-tile note shown below every Finance tile.
 *  Only the board owner ("Bob") can edit; everyone else sees read-only. */
export function BobTileNote({ tileKey, value, canEdit, onSave }: Props) {
  const initial = value?.trim() ? value : PLACEHOLDER;
  const [draft, setDraft] = useState(initial);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setDraft(initial);
  }, [initial, dirty]);

  return (
    <div className="mt-3 -mx-4 border-t border-border bg-primary/5 px-3 py-2 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] uppercase tracking-brand font-bold text-primary flex items-center gap-1">
          Bob's Insights
          {!canEdit && <Lock className="h-2.5 w-2.5 opacity-60" />}
        </span>
        {canEdit && dirty && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px] gap-1"
            onClick={async () => { await onSave(draft); setDirty(false); }}
          >
            <Save className="h-3 w-3" /> Save
          </Button>
        )}
      </div>
      {canEdit ? (
        <Textarea
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setDirty(true); }}
          placeholder={PLACEHOLDER}
          className="min-h-[56px] text-xs resize-y bg-background/60"
          aria-label={`Bob's insights for ${tileKey}`}
        />
      ) : (
        <div className="text-xs whitespace-pre-wrap text-foreground/80 min-h-[40px]">
          {draft || PLACEHOLDER}
        </div>
      )}
    </div>
  );
}