import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { brasiliaToday, LAST_LOGIN_DATE_KEY } from "@/lib/brasiliaDate";

/**
 * Login diário: se a data (Brasília) do último login for anterior a hoje,
 * encerra a sessão e manda para /auth. Roda apenas na entrada do app e ao focar a aba —
 * nunca em loop de render.
 */
export function useDailyLogin(enabled: boolean) {
  const runningRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const check = async () => {
      if (runningRef.current) return;
      let last: string | null = null;
      try {
        last = localStorage.getItem(LAST_LOGIN_DATE_KEY);
      } catch {
        return;
      }
      const today = brasiliaToday();
      if (!last) {
        // Sessão anterior à funcionalidade: assume hoje para não deslogar imediatamente.
        try { localStorage.setItem(LAST_LOGIN_DATE_KEY, today); } catch { /* noop */ }
        return;
      }
      if (last >= today) return;

      runningRef.current = true;
      console.warn("[useDailyLogin] novo dia — refazendo login");
      try { localStorage.removeItem(LAST_LOGIN_DATE_KEY); } catch { /* noop */ }
      await supabase.auth.signOut();
      window.location.href = "/auth";
    };

    void check();
    const onFocus = () => { void check(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [enabled]);
}
