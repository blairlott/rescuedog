import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCmsAuth } from "@/hooks/useCmsAuth";

interface Props {
  onClick: () => void;
  label?: string;
}

export const CmsEditButton = ({ onClick, label = "Edit" }: Props) => {
  const { isCmsEditor } = useCmsAuth();
  if (!isCmsEditor) return null;

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
