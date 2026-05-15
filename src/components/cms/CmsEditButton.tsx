import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCmsAuth, type CmsEditScope } from "@/hooks/useCmsAuth";

interface Props {
  onClick: () => void;
  label?: string;
  /**
   * Permission scope this edit button belongs to. Only users whose roles
   * include the scope (or who are owner/admin/cms_editor) will see it.
   * Defaults to "marketing".
   */
  scope?: CmsEditScope;
}

export const CmsEditButton = ({ onClick, label = "Edit", scope = "marketing" }: Props) => {
  const { canEdit } = useCmsAuth();
  if (!canEdit(scope)) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className="gap-1.5 text-xs bg-background/80 backdrop-blur border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground absolute top-2 right-2 z-10 opacity-70 hover:opacity-100 transition-opacity"
    >
      <Pencil className="h-3 w-3" /> {label}
    </Button>
  );
};
