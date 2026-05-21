import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useCartSync } from "@/hooks/useCartSync";
import { useAbandonedCartSnapshot } from "@/hooks/useAbandonedCartSnapshot";
import { lazy, Suspense, useEffect } from "react";
import { captureFbclid, captureGclid } from "@/lib/metaAttribution";
import { initMetaPixel, trackPageView } from "@/lib/metaPixel";
import { initVariantHandshake } from "@/lib/abVariant";
import { logAbEvent } from "@/lib/abEvents";
import { AgeGate } from "@/components/AgeGate";
import { ExitIntentOffer } from "@/components/ExitIntentOffer";
import { PackSignupPopup } from "@/components/PackSignupPopup";
import { CmsAuthProvider } from "@/hooks/useCmsAuth";
import { CustomerAuthProvider } from "@/hooks/useCustomerAuth";
import { GeoProvider } from "@/hooks/useGeo";
import { GeoNotice } from "@/components/GeoNotice";
import { AutoTranslator } from "@/components/AutoTranslator";
import { useLocation } from "react-router-dom";
import { SommelierChat } from "./components/SommelierChat";
import { EmailCapturePrompt } from "./components/cart/EmailCapturePrompt";
import { KennelGuard } from "./components/kennel/KennelGuard";
import { KennelLayout } from "./components/kennel/KennelLayout";
import CrmLayout from "./components/crm/CrmLayout";

const Index = lazy(() => import("./pages/Index"));
const MerchHomePage = lazy(() => import("./pages/MerchHomePage"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const WinesPage = lazy(() => import("./pages/WinesPage"));
const MixSixPage = lazy(() => import("./pages/MixSixPage"));
const ShopPage = lazy(() => import("./pages/ShopPage"));
const StoreLocatorPage = lazy(() => import("./pages/StoreLocatorPage"));
const WholesalePage = lazy(() => import("./pages/WholesalePage"));
const AboutPage = lazy(() => import("./pages/AboutPage"));
const MissionPage = lazy(() => import("./pages/MissionPage"));
const EventsPage = lazy(() => import("./pages/EventsPage"));
const VineyardPage = lazy(() => import("./pages/VineyardPage"));
const ContactPage = lazy(() => import("./pages/ContactPage"));
const WineClubPage = lazy(() => import("./pages/WineClubPage"));
const DonationPage = lazy(() => import("./pages/DonationPage"));
const WineThatGivesBackPage = lazy(() => import("./pages/WineThatGivesBackPage"));
const PressPage = lazy(() => import("./pages/PressPage"));
const CompareHubPage = lazy(() => import("./pages/CompareHubPage"));
const BrandComparePage = lazy(() => import("./pages/BrandComparePage"));
const SubscribePage = lazy(() => import("./pages/SubscribePage"));
const CustomerLoginPage = lazy(() => import("./pages/CustomerLoginPage"));
const CustomerSignupPage = lazy(() => import("./pages/CustomerSignupPage"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const CustomerResetPasswordPage = lazy(() => import("./pages/CustomerResetPasswordPage"));
const AccountPage = lazy(() => import("./pages/AccountPage"));
const GiftCertificatePrintPage = lazy(() => import("./pages/GiftCertificatePrintPage"));
const MyShipmentsPage = lazy(() => import("./pages/MyShipmentsPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ThankYouPage = lazy(() => import("./pages/ThankYouPage"));
const CheckoutPage = lazy(() => import("./pages/CheckoutPage"));
const CrmLoginPage = lazy(() => import("./pages/CrmLoginPage"));
const CrmDashboard = lazy(() => import("./pages/CrmDashboard"));
const CrmAccountDetail = lazy(() => import("./pages/CrmAccountDetail"));
const CrmMapPage = lazy(() => import("./pages/CrmMapPage"));
const CrmRoutePlanner = lazy(() => import("./pages/CrmRoutePlanner"));
const CrmAdminPage = lazy(() => import("./pages/CrmAdminPage"));
const CrmMarginPage = lazy(() => import("./pages/CrmMarginPage"));
const CrmResetPasswordPage = lazy(() => import("./pages/CrmResetPasswordPage"));
const CmsLoginPage = lazy(() => import("./pages/CmsLoginPage"));
const CmsDashboard = lazy(() => import("./pages/CmsDashboard"));
const CmsExperimentsPage = lazy(() => import("./pages/CmsExperimentsPage"));
const CmsDiscountsPage = lazy(() => import("./pages/CmsDiscountsPage"));
const CmsEmailsPage = lazy(() => import("./pages/CmsEmailsPage"));
const CmsMediaPage = lazy(() => import("./pages/CmsMediaPage"));
const WineClubAdminPage = lazy(() => import("./pages/WineClubAdminPage"));
const WineClubLoginPage = lazy(() => import("./pages/WineClubLoginPage"));
const WineClubResetPasswordPage = lazy(() => import("./pages/WineClubResetPasswordPage"));
const BlogPage = lazy(() => import("./pages/BlogPage"));
const BlogPostPage = lazy(() => import("./pages/BlogPostPage"));
const Pairings = lazy(() => import("./pages/Pairings"));
const PairingDetail = lazy(() => import("./pages/PairingDetail"));
const DropshipDashboard = lazy(() => import("./pages/DropshipDashboard"));
const AdminFlagsPage = lazy(() => import("./pages/AdminFlagsPage"));
const AdminPortalPage = lazy(() => import("./pages/AdminPortalPage"));
const AdminAbResultsPage = lazy(() => import("./pages/AdminAbResultsPage"));
const RequestAccessPage = lazy(() => import("./pages/RequestAccessPage"));
const SellOnSitePage = lazy(() => import("./pages/SellOnSitePage"));
const AmbassadorsLandingPage = lazy(() => import("./pages/AmbassadorsLandingPage"));
const AmbassadorSignupPage = lazy(() => import("./pages/AmbassadorSignupPage"));
const AmbassadorDashboardPage = lazy(() => import("./pages/AmbassadorDashboardPage"));
const UnsubscribePage = lazy(() => import("./pages/UnsubscribePage"));
const AmbassadorEventEditorPage = lazy(() => import("./pages/AmbassadorEventEditorPage"));
const AmbassadorPublicProfilePage = lazy(() => import("./pages/AmbassadorPublicProfilePage"));
const AmbassadorEventPublicPage = lazy(() => import("./pages/AmbassadorEventPublicPage"));
const AmbassadorDirectoryPage = lazy(() => import("./pages/AmbassadorDirectoryPage"));
const AmbassadorDisclosurePage = lazy(() => import("./pages/AmbassadorDisclosurePage"));
const CrmAmbassadorsPage = lazy(() => import("./pages/CrmAmbassadorsPage"));
const CrmCompliancePage = lazy(() => import("./pages/crm/CrmCompliancePage"));
const CrmLeadsPage = lazy(() => import("./pages/crm/CrmLeadsPage"));
const CrmIntelligencePage = lazy(() => import("./pages/crm/CrmIntelligencePage"));
const CrmCustomerMapPage = lazy(() => import("./pages/crm/CrmCustomerMapPage"));
const CrmWebhooksPage = lazy(() => import("./pages/crm/CrmWebhooksPage"));
const CrmLegacyMigrationPage = lazy(() => import("./pages/CrmLegacyMigrationPage"));
const CrmCancellationsPage = lazy(() => import("./pages/crm/CrmCancellationsPage"));
const CrmCustomerServicePage = lazy(() => import("./pages/crm/CrmCustomerServicePage"));
const RewardsTermsPage = lazy(() => import("./pages/RewardsTermsPage"));
const RewardsPage = lazy(() => import("./pages/RewardsPage"));
const PoliciesPage = lazy(() => import("./pages/PoliciesPage"));
const KennelDashboard = lazy(() => import("./pages/kennel/KennelDashboard"));
const KennelRecommendationsPage = lazy(() => import("./pages/kennel/KennelRecommendationsPage"));
const KennelSettingsPage = lazy(() => import("./pages/kennel/KennelSettingsPage"));
const KennelLogPage = lazy(() => import("./pages/kennel/KennelLogPage"));
const KennelChannelsPage = lazy(() => import("./pages/kennel/KennelChannelsPage"));
const KennelTrueRoasPage = lazy(() => import("./pages/kennel/KennelTrueRoasPage"));
const KennelCapiPage = lazy(() => import("./pages/kennel/KennelCapiPage"));
const KennelMethodologyPage = lazy(() => import("./pages/kennel/KennelMethodologyPage"));
const KennelIntegrationsPage = lazy(() => import("./pages/kennel/KennelIntegrationsPage"));
const KennelMediaBuyingPage = lazy(() => import("./pages/kennel/KennelMediaBuyingPage"));
const KennelCreativeStudioPage = lazy(() => import("./pages/kennel/KennelCreativeStudioPage"));
const KennelOciLogPage = lazy(() => import("./pages/kennel/KennelOciLogPage"));
const KennelBackfillsPage = lazy(() => import("./pages/kennel/KennelBackfillsPage"));
const KennelSelfHealthPage = lazy(() => import("./pages/kennel/KennelSelfHealthPage"));
const KennelProposalsPage = lazy(() => import("./pages/kennel/KennelProposalsPage"));
const KennelInstacartAdsPage = lazy(() => import("./pages/kennel/KennelInstacartAdsPage"));
const KennelKeywordsPage = lazy(() => import("./pages/kennel/KennelKeywordsPage"));
const KennelPlatformRadarPage = lazy(() => import("./pages/kennel/KennelPlatformRadarPage"));
const KennelAutonomyPage = lazy(() => import("./pages/kennel/KennelAutonomyPage"));
const ExecutiveCommandCenter = lazy(() => import("./pages/intelligence/ExecutiveCommandCenter"));
import { v2Routes } from "./v2/routes";
import { v3Routes } from "./v3/routes";

const queryClient = new QueryClient();

const PageFallback = () => (
  <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
);

function AppContent() {
  useCartSync();
  useAbandonedCartSnapshot();
  useEffect(() => {
    // Click-ID capture must run synchronously on mount so we don't lose the
    // query param if the user navigates away. Pixel + AB handshake can wait
    // until the browser is idle — keeps them off the critical render path.
    captureFbclid();
    captureGclid();
    const ric: (cb: () => void) => number =
      (window as any).requestIdleCallback?.bind(window) ??
      ((cb: () => void) => window.setTimeout(cb, 200) as unknown as number);
    const id = ric(() => {
      initVariantHandshake();
      initMetaPixel();
    });
    return () => {
      (window as any).cancelIdleCallback?.(id);
    };
  }, []);
  const location = useLocation();
  const path = location.pathname.toLowerCase();
  // Fire Meta Pixel PageView on every SPA route change (after initial init).
  useEffect(() => {
    if (path.startsWith("/admin") || path.startsWith("/cms") || path.startsWith("/crm") ||
        path.startsWith("/kennel") || path.startsWith("/dropship")) return;
    trackPageView();
  }, [path]);
  useEffect(() => {
    if (path === "/merch" || path.startsWith("/merch/")) {
      sessionStorage.setItem("lastStorePath", "/merch");
    } else if (path === "/wines" || path === "/shop" || path === "/shop-wine" || path.startsWith("/shop-wine/")) {
      sessionStorage.setItem("lastStorePath", "/wines");
    }
  }, [path]);
  // A/B funnel: log one pageview per route change (skips internal admin tools).
  useEffect(() => {
    if (path.startsWith("/admin") || path.startsWith("/cms") || path.startsWith("/crm") ||
        path.startsWith("/kennel") || path.startsWith("/dropship") || path.startsWith("/club/admin") || path.startsWith("/club-admin")) {
      return;
    }
    logAbEvent("pageview", { path });
  }, [path]);
  const showSommelier = !["/merch", "/crm", "/cms", "/sell", "/donation", "/login", "/signup", "/ambassador", "/club", "/checkout", "/cart"].some(p => path === p || path.startsWith(p + "/"));
  const isKennel = path === "/kennel" || path.startsWith("/kennel/");
  return (
    <>
    <a href="#main-content" className="skip-link">Skip to main content</a>
    <main id="main-content" tabIndex={-1}>
    <Suspense fallback={<PageFallback />}>
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
      <Route path="/admin/ab-results" element={<AdminAbResultsPage />} />
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
      <Route path="/club-admin" element={<Navigate to="/club/admin" replace />} />
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
      <Route path="/account/shipments" element={<MyShipmentsPage />} />
      <Route path="/account/shipments/:id" element={<MyShipmentsPage />} />
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
      <Route path="/cms/discounts" element={<CmsDiscountsPage />} />
      <Route path="/cms/emails" element={<CmsEmailsPage />} />
      <Route path="/cms/media" element={<CmsMediaPage />} />
      <Route path="/crm" element={<CrmLayout />}>
        <Route index element={<CrmDashboard />} />
        <Route path="account/:id" element={<CrmAccountDetail />} />
        <Route path="map" element={<CrmMapPage />} />
        <Route path="routes" element={<CrmRoutePlanner />} />
        <Route path="admin" element={<CrmAdminPage />} />
        <Route path="dropship" element={<Navigate to="/dropship" replace />} />
        <Route path="margin" element={<CrmMarginPage />} />
        <Route path="ambassadors" element={<CrmAmbassadorsPage />} />
        <Route path="compliance" element={<CrmCompliancePage />} />
        <Route path="leads" element={<CrmLeadsPage />} />
        <Route path="intelligence" element={<CrmIntelligencePage />} />
        <Route path="customer-map" element={<CrmCustomerMapPage />} />
        <Route path="webhooks" element={<CrmWebhooksPage />} />
        <Route path="cancellations" element={<CrmCancellationsPage />} />
        <Route path="customer-service" element={<CrmCustomerServicePage />} />
        <Route path="legacy-migration" element={<CrmLegacyMigrationPage />} />
      </Route>
      <Route path="/dropship" element={<DropshipDashboard />} />
      <Route path="/kennel" element={<KennelGuard><KennelLayout /></KennelGuard>}>
        <Route index element={<KennelDashboard />} />
        <Route path="true-roas" element={<KennelTrueRoasPage />} />
        <Route path="capi" element={<KennelCapiPage />} />
        <Route path="recommendations" element={<KennelRecommendationsPage />} />
        <Route path="channels" element={<KennelChannelsPage />} />
        <Route path="log" element={<KennelLogPage />} />
        <Route path="oci-log" element={<KennelOciLogPage />} />
        <Route path="backfills" element={<KennelBackfillsPage />} />
        <Route path="self-health" element={<KennelSelfHealthPage />} />
        <Route path="proposals" element={<KennelProposalsPage />} />
        <Route path="settings" element={<KennelSettingsPage />} />
        <Route path="methodology" element={<KennelMethodologyPage />} />
        <Route path="integrations" element={<KennelIntegrationsPage />} />
        <Route path="media-buying" element={<KennelMediaBuyingPage />} />
        <Route path="creative-studio" element={<KennelCreativeStudioPage />} />
        <Route path="instacart-ads" element={<KennelInstacartAdsPage />} />
        <Route path="keywords" element={<KennelKeywordsPage />} />
        <Route path="platform-radar" element={<KennelPlatformRadarPage />} />
        <Route path="autonomy" element={<KennelAutonomyPage />} />
      </Route>
      <Route path="/intelligence" element={<KennelGuard><ExecutiveCommandCenter /></KennelGuard>} />
      {v2Routes()}
      {v3Routes()}
      <Route path="*" element={<NotFound />} />
    </Routes>
    </Suspense>
    </main>
    {showSommelier && !isKennel && <SommelierChat />}
    {!isKennel && <EmailCapturePrompt />}
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
                  <AutoTranslator />
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
