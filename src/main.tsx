import { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import "./i18n";

const MODULE_RELOAD_KEY = "rdw-module-reload-attempted";

const isModuleLoadError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Load failed/i.test(message);
};

const reloadForFreshAssets = () => {
  if (sessionStorage.getItem(MODULE_RELOAD_KEY) === "true") return false;
  sessionStorage.setItem(MODULE_RELOAD_KEY, "true");
  window.location.reload();
  return true;
};

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  reloadForFreshAssets();
});

class ModuleErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, _info: ErrorInfo) {
    if (isModuleLoadError(error) && reloadForFreshAssets()) return;
    console.error(error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-dvh flex flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
          <p className="text-sm uppercase tracking-brand text-muted-foreground">A new version is available</p>
          <button className="border border-border px-5 py-3 text-sm font-bold uppercase tracking-brand" onClick={() => window.location.reload()}>
            Reload Rescue Dog Wines
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <ModuleErrorBoundary>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </ModuleErrorBoundary>
);
