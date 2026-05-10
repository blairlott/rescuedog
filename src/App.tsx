import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useCartSync } from "@/hooks/useCartSync";
import { AgeGate } from "@/components/AgeGate";
import { CmsAuthProvider } from "@/hooks/useCmsAuth";
import { CustomerAuthProvider } from "@/hooks/useCustomerAuth";
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
import VineyardPage from "./pages/VineyardPage";
import ContactPage from "./pages/ContactPage";
import WineClubPage from "./pages/WineClubPage";
import DonationPage from "./pages/DonationPage";
import SubscribePage from "./pages/SubscribePage";
import CustomerLoginPage from "./pages/CustomerLoginPage";
import CustomerSignupPage from "./pages/CustomerSignupPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import CustomerResetPasswordPage from "./pages/CustomerResetPasswordPage";
import AccountPage from "./pages/AccountPage";
import NotFound from "./pages/NotFound";
import CrmLoginPage from "./pages/CrmLoginPage";
import CrmLayout from "./components/crm/CrmLayout";
import CrmDashboard from "./pages/CrmDashboard";
import CrmAccountDetail from "./pages/CrmAccountDetail";
import CrmMapPage from "./pages/CrmMapPage";
import CrmRoutePlanner from "./pages/CrmRoutePlanner";
import CrmAdminPage from "./pages/CrmAdminPage";
import CrmResetPasswordPage from "./pages/CrmResetPasswordPage";
import CmsLoginPage from "./pages/CmsLoginPage";
import CmsDashboard from "./pages/CmsDashboard";
import WineClubAdminPage from "./pages/WineClubAdminPage";
import WineClubLoginPage from "./pages/WineClubLoginPage";
import WineClubResetPasswordPage from "./pages/WineClubResetPasswordPage";
import BlogPage from "./pages/BlogPage";
import BlogPostPage from "./pages/BlogPostPage";
import DropshipDashboard from "./pages/DropshipDashboard";

const queryClient = new QueryClient();

function AppContent() {
  useCartSync();
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/merch" element={<MerchHomePage />} />
      <Route path="/product/:handle" element={<ProductDetail />} />
      <Route path="/shop-wine/:handle" element={<ProductDetail />} />
      <Route path="/wines" element={<WinesPage />} />
      <Route path="/shop" element={<ShopPage />} />
      <Route path="/shop-wine" element={<ShopPage />} />
      <Route path="/store-locator" element={<StoreLocatorPage />} />
      <Route path="/wholesale" element={<WholesalePage />} />
      <Route path="/trade-and-media" element={<WholesalePage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/mission" element={<MissionPage />} />
      <Route path="/events" element={<EventsPage />} />
      <Route path="/vineyard" element={<VineyardPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/blog" element={<BlogPage />} />
      <Route path="/blog/:slug" element={<BlogPostPage />} />
      <Route path="/club" element={<WineClubPage />} />
      <Route path="/club/admin" element={<WineClubAdminPage />} />
      <Route path="/club/login" element={<WineClubLoginPage />} />
      <Route path="/club/reset-password" element={<WineClubResetPasswordPage />} />
      <Route path="/donation" element={<DonationPage />} />
      <Route path="/subscribe" element={<SubscribePage />} />
      <Route path="/login" element={<CustomerLoginPage />} />
      <Route path="/signup" element={<CustomerSignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<CustomerResetPasswordPage />} />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/crm/login" element={<CrmLoginPage />} />
      <Route path="/crm/reset-password" element={<CrmResetPasswordPage />} />
      <Route caseSensitive path="/CMS/login" element={<Navigate to="/cms/login" replace />} />
      <Route caseSensitive path="/CMS/*" element={<Navigate to="/cms" replace />} />
      <Route path="/cms/login" element={<CmsLoginPage />} />
      <Route path="/cms" element={<CmsDashboard />} />
      <Route path="/crm" element={<CrmLayout />}>
        <Route index element={<CrmDashboard />} />
        <Route path="account/:id" element={<CrmAccountDetail />} />
        <Route path="map" element={<CrmMapPage />} />
        <Route path="routes" element={<CrmRoutePlanner />} />
        <Route path="admin" element={<CrmAdminPage />} />
        <Route path="dropship" element={<DropshipDashboard />} />
      </Route>
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
        <CustomerAuthProvider>
          <CmsAuthProvider>
            <AgeGate>
              <AppContent />
            </AgeGate>
          </CmsAuthProvider>
        </CustomerAuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
