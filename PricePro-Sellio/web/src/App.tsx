import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppLayout } from "./components/Layout";
import { MaintenanceGate } from "./components/Maintenance";
import { PageLoader } from "./components/ui";
import { useAuth } from "./lib/auth";
import { ForgotPasswordPage, LoginPage, ResetPasswordPage, SignupPage } from "./pages/Auth";
import { NotFoundPage } from "./pages/NotFound";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Studio = lazy(() => import("./pages/Studio"));
const Forecast = lazy(() => import("./pages/Forecast"));
const Intelligence = lazy(() => import("./pages/Intelligence"));
const AdStudio = lazy(() => import("./pages/AdStudio"));
const Projects = lazy(() => import("./pages/Projects"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Favorites = lazy(() => import("./pages/Favorites"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Settings = lazy(() => import("./pages/Settings"));
const Profile = lazy(() => import("./pages/Profile"));
const Subscription = lazy(() => import("./pages/Subscription"));
const Support = lazy(() => import("./pages/Support"));
const Payment = lazy(() => import("./pages/Payment"));
const AdminApp = lazy(() => import("./admin/AdminApp"));

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
        <Route path="/signup" element={<GuestOnly><SignupPage /></GuestOnly>} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/admin/*" element={<Protected><AdminApp /></Protected>} />
        <Route element={<Protected><MaintenanceGate><AppLayout /></MaintenanceGate></Protected>}>
          <Route index element={<Dashboard />} />
          <Route path="studio" element={<Studio />} />
          <Route path="forecast" element={<Forecast />} />
          <Route path="intelligence" element={<Intelligence />} />
          <Route path="ads" element={<AdStudio />} />
          <Route path="projects" element={<Projects />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="favorites" element={<Favorites />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="settings" element={<Settings />} />
          <Route path="profile" element={<Profile />} />
          <Route path="subscription" element={<Subscription />} />
          <Route path="support" element={<Support />} />
          <Route path="payment" element={<Payment />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
