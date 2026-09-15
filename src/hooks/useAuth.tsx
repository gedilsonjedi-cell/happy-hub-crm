import { useEffect, useState, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { clearExternalClient, resetExternalAuthState } from "@/lib/externalSupabaseClient";
import { toast } from "sonner";

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(async () => {
    try {
      clearExternalClient();
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        console.error("Error signing out:", error);
        toast.error("Erro ao sair. Tente novamente.");
        return;
      }
      
      window.location.href = "/auth";
    } catch (error) {
      console.error("Error signing out:", error);
      toast.error("Erro ao sair. Tente novamente.");
      window.location.href = "/auth";
    }
  }, []);

  useEffect(() => {
    // Rede/backend fora do ar: getSession() pode nunca resolver (refresh pendente).
    // Sem esta trava, a tela fica num spinner infinito. Após 8s liberamos a UI.
    let settled = false;
    const stopLoading = () => {
      if (settled) return;
      settled = true;
      setLoading(false);
    };
    const watchdog = setTimeout(() => {
      if (!settled) {
        console.warn("[useAuth] getSession não respondeu em 8s — liberando a interface");
        stopLoading();
      }
    }, 8000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        if (session) resetExternalAuthState();

        
        if (event === "SIGNED_OUT") {
          window.location.href = "/auth";
        }

        // Detect token refresh failure — force re-login
        if (event === "TOKEN_REFRESHED" && !session) {
          console.warn("[useAuth] Token refresh failed, redirecting to login");
          window.location.href = "/auth";
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error("[useAuth] Session restore error:", error.message);
        // If session can't be restored, try refresh
        supabase.auth.refreshSession().then(({ data, error: refreshError }) => {
          if (refreshError || !data.session) {
            console.warn("[useAuth] Session expired and refresh failed, redirecting to login");
            setSession(null);
            setUser(null);
            setLoading(false);
            window.location.href = "/auth";
          } else {
            setSession(data.session);
            setUser(data.session.user);
            setLoading(false);
          }
        });
        return;
      }

      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      // Proactively check if token is about to expire or already expired
      if (session) {
        const expiresAt = session.expires_at;
        if (expiresAt) {
          const now = Math.floor(Date.now() / 1000);
          const timeLeft = expiresAt - now;
          // If less than 60 seconds left or already expired, force refresh
          if (timeLeft < 60) {
            console.warn("[useAuth] Token expiring soon, forcing refresh");
            supabase.auth.refreshSession().then(({ data, error: refreshError }) => {
              if (refreshError || !data.session) {
                console.warn("[useAuth] Proactive refresh failed, redirecting to login");
                window.location.href = "/auth";
              } else {
                setSession(data.session);
                setUser(data.session.user);
              }
            });
          }
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return { user, session, loading, signOut };
};
