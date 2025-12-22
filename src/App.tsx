import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Conexoes from "./pages/Conexoes";
import Leads from "./pages/Leads";
import Atendimento from "./pages/Atendimento";
import Disparos from "./pages/Disparos";
import Templates from "./pages/Templates";
import Pipeline from "./pages/Pipeline";
import Chatbot from "./pages/Chatbot";
import Usuarios from "./pages/Usuarios";
import Setores from "./pages/Setores";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

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

  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner position="top-right" />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
          <Route path="/conexoes" element={<ProtectedRoute><Conexoes /></ProtectedRoute>} />
          <Route path="/leads" element={<ProtectedRoute><Leads /></ProtectedRoute>} />
          <Route path="/atendimento" element={<ProtectedRoute><Atendimento /></ProtectedRoute>} />
          <Route path="/disparos" element={<ProtectedRoute><Disparos /></ProtectedRoute>} />
          <Route path="/templates" element={<ProtectedRoute><Templates /></ProtectedRoute>} />
          <Route path="/pipeline" element={<ProtectedRoute><Pipeline /></ProtectedRoute>} />
          <Route path="/chatbot" element={<ProtectedRoute><Chatbot /></ProtectedRoute>} />
          <Route path="/usuarios" element={<ProtectedRoute><Usuarios /></ProtectedRoute>} />
          <Route path="/setores" element={<ProtectedRoute><Setores /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
