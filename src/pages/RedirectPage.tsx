import { useEffect } from "react";
import { useParams } from "react-router-dom";

const FUNCTIONS_BASE = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/redirect-link`;

/**
 * Fallback: normalmente o redirecionamento acontece no script inline do index.html
 * (antes do app carregar). Se por algum motivo cair aqui, redireciona imediatamente
 * para a edge function, sem espera, sem SDK e sem analytics.
 */
const RedirectPage = () => {
  const { slug } = useParams<{ slug: string }>();

  useEffect(() => {
    if (slug) window.location.replace(`${FUNCTIONS_BASE}/${slug}${window.location.search}`);
  }, [slug]);

  return null;
};

export default RedirectPage;
