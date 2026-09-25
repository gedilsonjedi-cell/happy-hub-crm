import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, Outlet } from "react-router-dom";
import { TopNavLayoutShell } from "@/components/layout/TopNavLayout";
import { LayoutShellContext } from "@/components/layout/LayoutShellContext";
import { useAuth } from "@/hooks/useAuth";
import { SuperAdminProvider } from "@/hooks/useSuperAdmin";
import { WhatsAppNotificationProvider } from "@/hooks/useWhatsAppNotifications";
import { usePixPaymentNotifications } from "@/hooks/usePixPaymentNotifications";
import { useForceReload } from "@/hooks/useForceReload";
import { SubscriptionBlockScreen } from "@/components/subscription/SubscriptionBlockScreen";
// Gates de 2FA desativados (emergência): componentes mantidos no código, fora da árvore.
// import { WhatsappPhoneGate } from "@/components/auth/WhatsappPhoneGate";
// import { OtpGate } from "@/components/auth/OtpGate";
import { useDailyLogin } from "@/hooks/useDailyLogin";
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

import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Saldo from "./pages/Saldo";
import Loja from "./pages/Loja";
import MinhaAssinatura from "./pages/MinhaAssinatura";
import IndiqueGanhe from "./pages/IndiqueGanhe";
import ListaNegra from "./pages/ListaNegra";

import Horarios from "./pages/personalizacao/Horarios";
import Feriados from "./pages/personalizacao/Feriados";
import Departamentos from "./pages/personalizacao/Departamentos";
import Tags from "./pages/personalizacao/Tags";
import CamposPersonalizados from "./pages/personalizacao/CamposPersonalizados";
import RespostasRapidas from "./pages/personalizacao/RespostasRapidas";
import ContatoDetalhes from "./pages/ContatoDetalhes";
import LandingPage from "./pages/LandingPage";
import Cadastro from "./pages/Cadastro";
import ReferralRedirect from "./pages/ReferralRedirect";
import NotFound from "./pages/NotFound";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfUse from "./pages/TermsOfUse";
import DataDeletion from "./pages/DataDeletion";
import FollowUp from "./pages/FollowUp";
import WhatsAppOficial from "./pages/WhatsAppOficial";
import Blog from "./pages/Blog";
import Integracoes from "./pages/Integracoes";
import BlogPost from "./pages/BlogPost";
import AtendimentoV2 from "./pages/AtendimentoV2";
import Links from "./pages/Links";
import WebChatLinks from "./pages/WebChatLinks";
import WebChatPublic from "./pages/WebChatPublic";
import LeadsSemInteracao from "./pages/LeadsSemInteracao";
import RedirectPage from "./pages/RedirectPage";
import Configuracoes from "./pages/Configuracoes";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // 30 seconds default stale time
      gcTime: 5 * 60 * 1000, // 5 minutes cache time
      refetchOnWindowFocus: false, // Reduce unnecessary refetches
      retry: 1, // Reduce retries
    },
  },
});

// Component to initialize global notifications
const GlobalNotifications = ({ children }: { children: React.ReactNode }) => {
  usePixPaymentNotifications();
  useForceReload();
  useDailyLogin(true);
  return <>{children}</>;
};


// Component to check subscription and BLOCK screen if expired
const SubscriptionGuard = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const { needsPayment, isLoading } = useSubscription();

  // Super admin routes are always allowed
  const isSuperAdminRoute = location.pathname.startsWith("/super-admin");

  if (isLoading) {
    return <>{children}</>;
  }

  // Show fullscreen block if subscription expired (except for super admin)
  if (needsPayment && !isSuperAdminRoute) {
    return <SubscriptionBlockScreen />;
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

// Shell persistente: a barra lateral é montada UMA vez e só o conteúdo troca.
const AppShell = () => {
  const location = useLocation();
  const noPadding = location.pathname === "/atendimento-v2";

  return (
    <ProtectedRoute>
      <TopNavLayoutShell noPadding={noPadding}>
        <LayoutShellContext.Provider value={true}>
          <Outlet />
        </LayoutShellContext.Provider>
      </TopNavLayoutShell>
    </ProtectedRoute>
  );
};




// Home route that shows landing for non-authenticated users and redirects to atendimento for authenticated
const HomeRoute = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // If user is authenticated, redirect to atendimento-v2 (main page)
  if (user) {
    return <Navigate to="/atendimento-v2" replace />;
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
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
          <Route path="/indique-ganhe/:code" element={<ReferralRedirect />} />
          <Route path="/r/:slug" element={<RedirectPage />} />
          <Route path="/chat/:linkId" element={<WebChatPublic />} />
          <Route path="/politica-de-privacidade" element={<PrivacyPolicy />} />
          <Route path="/termos-de-uso" element={<TermsOfUse />} />
          <Route path="/exclusao-de-dados" element={<DataDeletion />} />
          <Route path="/" element={<HomeRoute />} />
          <Route path="/whatsapp-chat" element={<Navigate to="/atendimento-v2" replace />} />

          {/* Shell persistente: barra lateral montada uma única vez */}
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<Index />} />
            <Route path="/conexoes" element={<Conexoes />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/leads/:id" element={<ContatoDetalhes />} />
            <Route path="/carteira-clientes" element={<CarteiraClientes />} />
            <Route path="/disparos" element={<Disparos />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/follow-up" element={<FollowUp />} />
            <Route path="/chatbot" element={<Chatbot />} />
            <Route path="/atendimento-v2" element={<AtendimentoV2 />} />
            <Route path="/usuarios" element={<Usuarios />} />
            <Route path="/perfil" element={<Perfil />} />
            <Route path="/relatorios" element={<Relatorios />} />
            <Route path="/configuracoes" element={<Configuracoes />} />
            <Route path="/saldo" element={<Saldo />} />
            <Route path="/loja" element={<Loja />} />
            <Route path="/minha-assinatura" element={<MinhaAssinatura />} />
            <Route path="/indique-ganhe" element={<IndiqueGanhe />} />
            <Route path="/lista-negra" element={<ListaNegra />} />
            <Route path="/personalizacao/horarios" element={<Horarios />} />
            <Route path="/personalizacao/feriados" element={<Feriados />} />
            <Route path="/personalizacao/departamentos" element={<Departamentos />} />
            <Route path="/personalizacao/tags" element={<Tags />} />
            <Route path="/personalizacao/campos" element={<CamposPersonalizados />} />
            <Route path="/personalizacao/respostas-rapidas" element={<RespostasRapidas />} />
            <Route path="/integracoes" element={<Integracoes />} />
            <Route path="/links" element={<Links />} />
            <Route path="/webchat" element={<WebChatLinks />} />
            <Route path="/apps/leads-sem-interacao" element={<LeadsSemInteracao />} />
          </Route>

          <Route path="/super-admin" element={<ProtectedRoute><SuperAdmin /></ProtectedRoute>} />
          <Route path="/super-admin/organizations/:id" element={<ProtectedRoute><OrganizationDetails /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
