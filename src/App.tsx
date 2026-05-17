import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useCartSync } from "@/hooks/useCartSync";
import { useEffect } from "react";
import { captureFbclid, captureGclid } from "@/lib/metaAttribution";
import { AgeGate } from "@/components/AgeGate";
import { ExitIntentOffer } from "@/components/ExitIntentOffer";
import { PackSignupPopup } from "@/components/PackSignupPopup";
import { CmsAuthProvider } from "@/hooks/useCmsAuth";
import { CustomerAuthProvider } from "@/hooks/useCustomerAuth";
import { GeoProvider } from "@/hooks/useGeo";
import { GeoNotice } from "@/components/GeoNotice";
import Index from "./pages/Index";
import MerchHomePage from "./pages/MerchHomePage";
import ProductDetail from "./pages/ProductDetail";
import WinesPage from "./pages/WinesPage";
import MixSixPage from "./pages/MixSixPage";
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
import WineThatGivesBackPage from "./pages/WineThatGivesBackPage";
import PressPage from "./pages/PressPage";
import CompareHubPage from "./pages/CompareHubPage";
import BrandComparePage from "./pages/BrandComparePage";
import SubscribePage from "./pages/SubscribePage";
import CustomerLoginPage from "./pages/CustomerLoginPage";
import CustomerSignupPage from "./pages/CustomerSignupPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import CustomerResetPasswordPage from "./pages/CustomerResetPasswordPage";
import AccountPage from "./pages/AccountPage";
import GiftCertificatePrintPage from "./pages/GiftCertificatePrintPage";
import NotFound from "./pages/NotFound";
import ThankYouPage from "./pages/ThankYouPage";
import CheckoutPage from "./pages/CheckoutPage";
import CrmLoginPage from "./pages/CrmLoginPage";
import CrmLayout from "./components/crm/CrmLayout";
import CrmDashboard from "./pages/CrmDashboard";
import CrmAccountDetail from "./pages/CrmAccountDetail";
import CrmMapPage from "./pages/CrmMapPage";
import CrmRoutePlanner from "./pages/CrmRoutePlanner";
import CrmAdminPage from "./pages/CrmAdminPage";
import CrmMarginPage from "./pages/CrmMarginPage";
import CrmResetPasswordPage from "./pages/CrmResetPasswordPage";
import CmsLoginPage from "./pages/CmsLoginPage";
import CmsDashboard from "./pages/CmsDashboard";
import CmsExperimentsPage from "./pages/CmsExperimentsPage";
import WineClubAdminPage from "./pages/WineClubAdminPage";
import WineClubLoginPage from "./pages/WineClubLoginPage";
import WineClubResetPasswordPage from "./pages/WineClubResetPasswordPage";
import BlogPage from "./pages/BlogPage";
import BlogPostPage from "./pages/BlogPostPage";
import Pairings from "./pages/Pairings";
import PairingDetail from "./pages/PairingDetail";
import DropshipDashboard from "./pages/DropshipDashboard";
import AdminFlagsPage from "./pages/AdminFlagsPage";
import AdminPortalPage from "./pages/AdminPortalPage";
import RequestAccessPage from "./pages/RequestAccessPage";
import SellOnSitePage from "./pages/SellOnSitePage";
import AmbassadorsLandingPage from "./pages/AmbassadorsLandingPage";
import AmbassadorSignupPage from "./pages/AmbassadorSignupPage";
import AmbassadorDashboardPage from "./pages/AmbassadorDashboardPage";
import UnsubscribePage from "./pages/UnsubscribePage";
import AmbassadorEventEditorPage from "./pages/AmbassadorEventEditorPage";
import AmbassadorPublicProfilePage from "./pages/AmbassadorPublicProfilePage";
import AmbassadorEventPublicPage from "./pages/AmbassadorEventPublicPage";
import AmbassadorDirectoryPage from "./pages/AmbassadorDirectoryPage";
import AmbassadorDisclosurePage from "./pages/AmbassadorDisclosurePage";
import CrmAmbassadorsPage from "./pages/CrmAmbassadorsPage";
import CrmCompliancePage from "./pages/crm/CrmCompliancePage";
import CrmLeadsPage from "./pages/crm/CrmLeadsPage";
import CrmLegacyMigrationPage from "./pages/CrmLegacyMigrationPage";
import RewardsTermsPage from "./pages/RewardsTermsPage";
import RewardsPage from "./pages/RewardsPage";
import PoliciesPage from "./pages/PoliciesPage";
import { SommelierChat } from "./components/SommelierChat";
import { EmailCapturePrompt } from "./components/cart/EmailCapturePrompt";
import { useLocation } from "react-router-dom";

const queryClient = new QueryClient();

function AppContent() {
  useCartSync();
  useEffect(() => {
    captureFbclid();
    captureGclid();
  }, []);
  const location = useLocation();
  const path = location.pathname.toLowerCase();
  useEffect(() => {
    if (path === "/merch" || path.startsWith("/merch/")) {
      sessionStorage.setItem("lastStorePath", "/merch");
    } else if (path === "/wines" || path === "/shop" || path === "/shop-wine" || path.startsWith("/shop-wine/")) {
      sessionStorage.setItem("lastStorePath", "/wines");
    }
  }, [path]);
  const showSommelier = !["/merch", "/crm", "/cms", "/sell", "/donation", "/login", "/signup", "/ambassador"].some(p => path === p || path.startsWith(p + "/"));
  return (
    <>
    <a href="#main-content" className="skip-link">Skip to main content</a>
    <main id="main-content" tabIndex={-1}>
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/merch" element={<MerchHomePage />} />
      <Route path="/product/:handle" element={<ProductDetail />} />
      <Route path="/shop-wine/:handle" element={<ProductDetail />} />
      <Route path="/wines" element={<WinesPage />} />
      <Route path="/wines/mix-six" element={<MixSixPage />} />
      <Route path="/shop" element={<ShopPage />} />
      <Route path="/shop-wine" element={<ShopPage />} />
      <Route path="/store-locator" element={<StoreLocatorPage />} />
      <Route path="/where-to-buy" element={<Navigate to="/store-locator" replace />} />
      <Route path="/admin/flags" element={<AdminFlagsPage />} />
      <Route path="/admin" element={<AdminPortalPage />} />
      <Route path="/admin/request-access" element={<RequestAccessPage />} />
      <Route path="/admin/login" element={<Navigate to="/admin" replace />} />
      <Route path="/wholesale" element={<WholesalePage />} />
      <Route path="/trade-and-media" element={<WholesalePage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/mission" element={<MissionPage />} />
      <Route path="/events" element={<EventsPage />} />
      <Route path="/vineyard" element={<VineyardPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/blog" element={<BlogPage />} />
      <Route path="/blog/:slug" element={<BlogPostPage />} />
      <Route path="/pairings" element={<Pairings />} />
      <Route path="/pairings/:slug" element={<PairingDetail />} />
      <Route path="/club" element={<WineClubPage />} />
      <Route path="/club/admin" element={<WineClubAdminPage />} />
      <Route path="/club/login" element={<WineClubLoginPage />} />
      <Route path="/club/reset-password" element={<WineClubResetPasswordPage />} />
      <Route path="/donation" element={<DonationPage />} />
      <Route path="/wine-that-gives-back" element={<WineThatGivesBackPage />} />
      <Route path="/press" element={<PressPage />} />
      <Route path="/compare" element={<CompareHubPage />} />
      <Route path="/compare/:slug" element={<BrandComparePage />} />
      <Route path="/vs" element={<Navigate to="/compare" replace />} />
      <Route path="/vs/:slug" element={<BrandComparePage />} />
      <Route path="/sell" element={<SellOnSitePage />} />
      <Route path="/marketplace/apply" element={<Navigate to="/sell" replace />} />
      <Route path="/ambassadors" element={<AmbassadorsLandingPage />} />
      <Route path="/ambassadors/find" element={<AmbassadorDirectoryPage />} />
      <Route path="/ambassadors/disclosure" element={<AmbassadorDisclosurePage />} />
      <Route path="/ambassador/signup" element={<AmbassadorSignupPage />} />
      <Route path="/ambassador/dashboard" element={<AmbassadorDashboardPage />} />
      <Route path="/unsubscribe" element={<UnsubscribePage />} />
      <Route path="/ambassador/events/new" element={<AmbassadorEventEditorPage />} />
      <Route path="/ambassador/events/:id/edit" element={<AmbassadorEventEditorPage />} />
      <Route path="/a/:handle" element={<AmbassadorPublicProfilePage />} />
      <Route path="/e/:slug" element={<AmbassadorEventPublicPage />} />
      <Route path="/subscribe" element={<SubscribePage />} />
      <Route path="/login" element={<CustomerLoginPage />} />
      <Route path="/signup" element={<CustomerSignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<CustomerResetPasswordPage />} />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/account/gifts/:id/print" element={<GiftCertificatePrintPage />} />
      <Route path="/rewards" element={<RewardsPage />} />
      <Route path="/rewards/terms" element={<RewardsTermsPage />} />
      <Route path="/policies" element={<PoliciesPage />} />
      <Route path="/privacy" element={<Navigate to="/policies#privacy" replace />} />
      <Route path="/shipping" element={<Navigate to="/policies#shipping" replace />} />
      <Route path="/refund" element={<Navigate to="/policies#refund" replace />} />
      <Route path="/terms" element={<Navigate to="/policies#terms" replace />} />
      <Route path="/thank-you" element={<ThankYouPage />} />
      <Route path="/checkout" element={<CheckoutPage />} />
      <Route path="/crm/login" element={<CrmLoginPage />} />
      <Route path="/crm/reset-password" element={<CrmResetPasswordPage />} />
      <Route caseSensitive path="/CMS/login" element={<Navigate to="/cms/login" replace />} />
      <Route caseSensitive path="/CMS/*" element={<Navigate to="/cms" replace />} />
      <Route path="/cms/login" element={<CmsLoginPage />} />
      <Route path="/cms" element={<CmsDashboard />} />
      <Route path="/cms/experiments" element={<CmsExperimentsPage />} />
      <Route path="/crm" element={<CrmLayout />}>
        <Route index element={<CrmDashboard />} />
        <Route path="account/:id" element={<CrmAccountDetail />} />
        <Route path="map" element={<CrmMapPage />} />
        <Route path="routes" element={<CrmRoutePlanner />} />
        <Route path="admin" element={<CrmAdminPage />} />
        <Route path="dropship" element={<DropshipDashboard />} />
        <Route path="margin" element={<CrmMarginPage />} />
        <Route path="ambassadors" element={<CrmAmbassadorsPage />} />
        <Route path="compliance" element={<CrmCompliancePage />} />
        <Route path="leads" element={<CrmLeadsPage />} />
        <Route path="legacy-migration" element={<CrmLegacyMigrationPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
    </main>
    {showSommelier && <SommelierChat />}
    <EmailCapturePrompt />
    </>
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
              <GeoProvider>
                <AgeGate>
                  <GeoNotice />
                  <AppContent />
                  <ExitIntentOffer />
                  <PackSignupPopup />
                </AgeGate>
              </GeoProvider>
            </CmsAuthProvider>
        </CustomerAuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
