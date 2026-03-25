import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useCartSync } from "@/hooks/useCartSync";
import { AgeGate } from "@/components/AgeGate";
import Index from "./pages/Index";
import MerchHomePage from "./pages/MerchHomePage";
import ProductDetail from "./pages/ProductDetail";
import WinesPage from "./pages/WinesPage";
import ShopPage from "./pages/ShopPage";
import StoreLocatorPage from "./pages/StoreLocatorPage";
import WholesalePage from "./pages/WholesalePage";
import AboutPage from "./pages/AboutPage";
import MissionPage from "./pages/MissionPage";
import EventsPage from "./pages/EventsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AppContent() {
  useCartSync();
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/merch" element={<MerchHomePage />} />
      <Route path="/product/:handle" element={<ProductDetail />} />
      <Route path="/wines" element={<WinesPage />} />
      <Route path="/shop" element={<ShopPage />} />
      <Route path="/store-locator" element={<StoreLocatorPage />} />
      <Route path="/wholesale" element={<WholesalePage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/mission" element={<MissionPage />} />
      <Route path="/events" element={<EventsPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AgeGate>
          <AppContent />
        </AgeGate>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
