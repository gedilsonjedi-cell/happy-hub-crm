import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { SuperAdminProvider } from "@/hooks/useSuperAdmin";
import { WhatsAppNotificationProvider } from "@/hooks/useWhatsAppNotifications";
import { usePixPaymentNotifications } from "@/hooks/usePixPaymentNotifications";
import { useSubscription } from "@/hooks/useSubscription";
import Index from "./pages/Index";
import Conexoes from "./pages/Conexoes";
import Leads from "./pages/Leads";
import Disparos from "./pages/Disparos";
import Templates from "./pages/Templates";
import Pipeline from "./pages/Pipeline";
import Chatbot from "./pages/Chatbot";
import Usuarios from "./pages/Usuarios";
import Perfil from "./pages/Perfil";
import Relatorios from "./pages/Relatorios";
import SuperAdmin from "./pages/SuperAdmin";
import OrganizationDetails from "./pages/OrganizationDetails";
import WhatsAppChat from "./pages/WhatsAppChat";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Saldo from "./pages/Saldo";
import Loja from "./pages/Loja";
import MinhaAssinatura from "./pages/MinhaAssinatura";
import ListaNegra from "./pages/ListaNegra";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Component to initialize global notifications
const GlobalNotifications = ({ children }: { children: React.ReactNode }) => {
  usePixPaymentNotifications();
  return <>{children}</>;
};

// Pages that are allowed even when subscription is expired
const ALLOWED_PAGES_WHEN_EXPIRED = ["/loja", "/saldo", "/perfil", "/auth", "/reset-password", "/minha-assinatura"];

// Component to check subscription and redirect if expired
const SubscriptionGuard = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const { needsPayment, isLoading } = useSubscription();

  // Allow access to certain pages even when expired
  const isAllowedPage = ALLOWED_PAGES_WHEN_EXPIRED.some(page => 
    location.pathname === page || location.pathname.startsWith(page + "/")
  );

  // Super admin routes are always allowed
  const isSuperAdminRoute = location.pathname.startsWith("/super-admin");

  if (isLoading) {
    return <>{children}</>;
  }

  // Redirect to store if subscription expired and not on allowed page
  if (needsPayment && !isAllowedPage && !isSuperAdminRoute) {
    return <Navigate to="/loja" replace />;
  }

  return <>{children}</>;
};

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <SuperAdminProvider>
      <WhatsAppNotificationProvider>
        <GlobalNotifications>
          <SubscriptionGuard>
            {children}
          </SubscriptionGuard>
        </GlobalNotifications>
      </WhatsAppNotificationProvider>
    </SuperAdminProvider>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner position="top-right" />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
          <Route path="/conexoes" element={<ProtectedRoute><Conexoes /></ProtectedRoute>} />
          <Route path="/leads" element={<ProtectedRoute><Leads /></ProtectedRoute>} />
          <Route path="/disparos" element={<ProtectedRoute><Disparos /></ProtectedRoute>} />
          <Route path="/templates" element={<ProtectedRoute><Templates /></ProtectedRoute>} />
          <Route path="/pipeline" element={<ProtectedRoute><Pipeline /></ProtectedRoute>} />
          <Route path="/chatbot" element={<ProtectedRoute><Chatbot /></ProtectedRoute>} />
          <Route path="/whatsapp-chat" element={<ProtectedRoute><WhatsAppChat /></ProtectedRoute>} />
          <Route path="/usuarios" element={<ProtectedRoute><Usuarios /></ProtectedRoute>} />
          <Route path="/perfil" element={<ProtectedRoute><Perfil /></ProtectedRoute>} />
          <Route path="/relatorios" element={<ProtectedRoute><Relatorios /></ProtectedRoute>} />
          <Route path="/saldo" element={<ProtectedRoute><Saldo /></ProtectedRoute>} />
          <Route path="/loja" element={<ProtectedRoute><Loja /></ProtectedRoute>} />
          <Route path="/minha-assinatura" element={<ProtectedRoute><MinhaAssinatura /></ProtectedRoute>} />
          <Route path="/lista-negra" element={<ProtectedRoute><ListaNegra /></ProtectedRoute>} />
          <Route path="/super-admin" element={<ProtectedRoute><SuperAdmin /></ProtectedRoute>} />
          <Route path="/super-admin/organizations/:id" element={<ProtectedRoute><OrganizationDetails /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
