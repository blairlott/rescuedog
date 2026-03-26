import { LogOut, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCmsAuth } from "@/hooks/useCmsAuth";

export const CmsToolbar = () => {
  const { isCmsEditor, logout } = useCmsAuth();
  if (!isCmsEditor) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-full shadow-lg">
      <PenLine className="h-4 w-4" />
      <span className="text-sm font-medium">CMS Mode</span>
      <Button variant="ghost" size="sm" onClick={logout} className="text-primary-foreground hover:text-primary-foreground/80 hover:bg-primary-foreground/10 h-7 px-2">
        <LogOut className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
};
