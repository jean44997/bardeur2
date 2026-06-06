import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import BottomNav from "@/components/BottomNav";
import DesktopSidebar from "@/components/DesktopSidebar";
import AuthGuard from "@/components/AuthGuard";
import BanGate from "@/components/BanGate";
import OnboardingFlow from "@/components/OnboardingFlow";

import GlobalCallListener from "@/components/GlobalCallListener";
import { useViewportInsets } from "@/hooks/useViewportInsets";
import Index from "./pages/Index";
import ExplorePage from "./pages/ExplorePage";
import ProfilePage from "./pages/ProfilePage";
import StoryViewsPage from "./pages/StoryViewsPage";
import InboxPage from "./pages/InboxPage";
import CreatePage from "./pages/CreatePage";
import AuthPage from "./pages/AuthPage";
import ChatPage from "./pages/ChatPage";
import SettingsPage from "./pages/SettingsPage";
import MonetizationPage from "./pages/MonetizationPage";
import AdminPage from "./pages/AdminPage";
import AdminDiagnosticPage from "./pages/AdminDiagnosticPage";

import ResetPasswordPage from "./pages/ResetPasswordPage";
import LivePage from "./pages/LivePage";
import WatchLivePage from "./pages/WatchLivePage";
import LivesListPage from "./pages/LivesListPage";
import LiveDebugPage from "./pages/LiveDebugPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ViewportRuntime() {
  useViewportInsets();
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ViewportRuntime />
          <GlobalCallListener />
          <BanGate>
          <OnboardingFlow />
          <Routes>

            <Route path="/auth" element={<AuthPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/chat/:id" element={<AuthGuard><ChatPage /></AuthGuard>} />
            <Route path="/live" element={<AuthGuard><LivePage /></AuthGuard>} />
            <Route path="/live/:id" element={<AuthGuard><WatchLivePage /></AuthGuard>} />
            <Route
              path="*"
              element={
                <>
                  <DesktopSidebar />
                  <main>
                    <Routes>
                      <Route path="/" element={<Index />} />
                      <Route path="/explore" element={<ExplorePage />} />
                      <Route path="/lives" element={<LivesListPage />} />
                      <Route path="/profile" element={<AuthGuard><ProfilePage /></AuthGuard>} />
                      <Route path="/profile/:username" element={<ProfilePage />} />
                      <Route path="/inbox" element={<AuthGuard><InboxPage /></AuthGuard>} />
                      <Route path="/create" element={<AuthGuard><CreatePage /></AuthGuard>} />
                      <Route path="/settings" element={<AuthGuard><SettingsPage /></AuthGuard>} />
                      <Route path="/monetization" element={<AuthGuard><MonetizationPage /></AuthGuard>} />
                      <Route path="/settings/live-debug" element={<AuthGuard><LiveDebugPage /></AuthGuard>} />
                      <Route path="/admin" element={<AuthGuard><AdminPage /></AuthGuard>} />
                      <Route path="/admin/diagnostic" element={<AuthGuard><AdminDiagnosticPage /></AuthGuard>} />

                      <Route path="/notifications" element={<AuthGuard><Navigate to="/inbox?tab=activity" replace /></AuthGuard>} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </main>
                  <BottomNav />
                </>
              }
            />
          </Routes>
          </BanGate>
        </AuthProvider>

      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
