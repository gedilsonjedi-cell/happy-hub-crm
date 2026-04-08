import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, MessageCircle } from "lucide-react";

interface Destination {
  phone: string;
  message: string;
}

const RedirectPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const [countdown, setCountdown] = useState(5);
  const [error, setError] = useState(false);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchLink = async () => {
      if (!slug) { setError(true); return; }

      const { data, error: fetchError } = await supabase
        .from("redirect_links")
        .select("*")
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();

      if (fetchError || !data) {
        setError(true);
        return;
      }

      const destinations = (data.destinations as unknown as Destination[]) || [];
      if (destinations.length === 0) {
        setError(true);
        return;
      }

      // Pick random destination
      const dest = destinations[Math.floor(Math.random() * destinations.length)];
      const phone = dest.phone.replace(/\D/g, "");
      const msg = dest.message ? `?text=${encodeURIComponent(dest.message)}` : "";
      setRedirectUrl(`https://wa.me/${phone}${msg}`);

      // Atomic increment click count (fire and forget)
      supabase.rpc("increment_redirect_click", { link_id: data.id }).then(() => {});
    };

    fetchLink();
  }, [slug]);

  useEffect(() => {
    if (!redirectUrl) return;
    if (countdown <= 0) {
      window.location.href = redirectUrl;
      return;
    }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, redirectUrl]);

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
        <div className="text-center text-white">
          <h1 className="text-2xl font-bold mb-2">Link não encontrado</h1>
          <p className="text-gray-400">Este link pode ter expirado ou sido removido.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-emerald-900 flex items-center justify-center p-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto animate-pulse">
          <MessageCircle className="w-10 h-10 text-green-400" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white">
            Aguarde {countdown} segundo{countdown !== 1 ? "s" : ""}...
          </h1>
          <p className="text-green-200/80 text-lg">
            Você está sendo direcionado para um atendente
          </p>
        </div>

        <div className="flex justify-center">
          <Loader2 className="w-8 h-8 text-green-400 animate-spin" />
        </div>

        {/* Progress bar */}
        <div className="w-full bg-green-950/50 rounded-full h-2 overflow-hidden">
          <div
            className="h-full bg-green-400 rounded-full transition-all duration-1000 ease-linear"
            style={{ width: `${((5 - countdown) / 5) * 100}%` }}
          />
        </div>

        <p className="text-green-300/50 text-xs">
          Redirecionamento seguro via WhatsApp
        </p>
      </div>
    </div>
  );
};

export default RedirectPage;
