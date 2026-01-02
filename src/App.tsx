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
import CarteiraClientes from "./pages/CarteiraClientes";
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
import Higienizacao from "./pages/Higienizacao";
import Horarios from "./pages/personalizacao/Horarios";
import Feriados from "./pages/personalizacao/Feriados";
import Departamentos from "./pages/personalizacao/Departamentos";
import Tags from "./pages/personalizacao/Tags";
import CamposPersonalizados from "./pages/personalizacao/CamposPersonalizados";
import RespostasRapidas from "./pages/personalizacao/RespostasRapidas";
import ContatoDetalhes from "./pages/ContatoDetalhes";
import LandingPage from "./pages/LandingPage";
import Cadastro from "./pages/Cadastro";
import NotFound from "./pages/NotFound";
import FollowUp from "./pages/FollowUp";
import WhatsAppOficial from "./pages/WhatsAppOficial";

const queryClient = new QueryClient();

// Component to initialize global notifications
const GlobalNotifications = ({ children }: { children: React.ReactNode }) => {
  usePixPaymentNotifications();
  return <>{children}</>;
};

// Pages that are allowed even when subscription is expired
const ALLOWED_PAGES_WHEN_EXPIRED = ["/loja", "/saldo", "/perfil", "/auth", "/reset-password", "/minha-assinatura", "/landing"];

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

// Home route that shows landing for non-authenticated users and redirects to dashboard for authenticated
const HomeRoute = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // If user is authenticated, redirect to dashboard
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  // Show landing page for non-authenticated users
  return <LandingPage />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner position="top-right" />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/cadastro" element={<Cadastro />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/landing" element={<LandingPage />} />
          <Route path="/whatsapp-oficial" element={<WhatsAppOficial />} />
          <Route path="/" element={<HomeRoute />} />
          <Route path="/dashboard" element={<ProtectedRoute><Index /></ProtectedRoute>} />
          <Route path="/conexoes" element={<ProtectedRoute><Conexoes /></ProtectedRoute>} />
          <Route path="/leads" element={<ProtectedRoute><Leads /></ProtectedRoute>} />
          <Route path="/leads/:id" element={<ProtectedRoute><ContatoDetalhes /></ProtectedRoute>} />
          <Route path="/carteira-clientes" element={<ProtectedRoute><CarteiraClientes /></ProtectedRoute>} />
          <Route path="/disparos" element={<ProtectedRoute><Disparos /></ProtectedRoute>} />
          <Route path="/templates" element={<ProtectedRoute><Templates /></ProtectedRoute>} />
          <Route path="/pipeline" element={<ProtectedRoute><Pipeline /></ProtectedRoute>} />
          <Route path="/follow-up" element={<ProtectedRoute><FollowUp /></ProtectedRoute>} />
          <Route path="/chatbot" element={<ProtectedRoute><Chatbot /></ProtectedRoute>} />
          <Route path="/whatsapp-chat" element={<ProtectedRoute><WhatsAppChat /></ProtectedRoute>} />
          <Route path="/usuarios" element={<ProtectedRoute><Usuarios /></ProtectedRoute>} />
          <Route path="/perfil" element={<ProtectedRoute><Perfil /></ProtectedRoute>} />
          <Route path="/relatorios" element={<ProtectedRoute><Relatorios /></ProtectedRoute>} />
          <Route path="/saldo" element={<ProtectedRoute><Saldo /></ProtectedRoute>} />
          <Route path="/loja" element={<ProtectedRoute><Loja /></ProtectedRoute>} />
          <Route path="/minha-assinatura" element={<ProtectedRoute><MinhaAssinatura /></ProtectedRoute>} />
          <Route path="/lista-negra" element={<ProtectedRoute><ListaNegra /></ProtectedRoute>} />
          <Route path="/higienizacao" element={<ProtectedRoute><Higienizacao /></ProtectedRoute>} />
          <Route path="/personalizacao/horarios" element={<ProtectedRoute><Horarios /></ProtectedRoute>} />
          <Route path="/personalizacao/feriados" element={<ProtectedRoute><Feriados /></ProtectedRoute>} />
          <Route path="/personalizacao/departamentos" element={<ProtectedRoute><Departamentos /></ProtectedRoute>} />
          <Route path="/personalizacao/tags" element={<ProtectedRoute><Tags /></ProtectedRoute>} />
          <Route path="/personalizacao/campos" element={<ProtectedRoute><CamposPersonalizados /></ProtectedRoute>} />
          <Route path="/personalizacao/respostas-rapidas" element={<ProtectedRoute><RespostasRapidas /></ProtectedRoute>} />
          <Route path="/super-admin" element={<ProtectedRoute><SuperAdmin /></ProtectedRoute>} />
          <Route path="/super-admin/organizations/:id" element={<ProtectedRoute><OrganizationDetails /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
