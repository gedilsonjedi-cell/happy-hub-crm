import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const notFoundHtml = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Link não encontrado</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f1512;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-align:center;padding:24px}h1{font-size:1.4rem;margin:0 0 8px}p{color:#9aa5a0;margin:0}</style></head><body><div><h1>Link não encontrado ou expirado</h1><p>Este link pode ter sido removido ou desativado.</p></div></body></html>`;

interface Destination { phone: string; message?: string }

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const slug = (url.searchParams.get("slug") || parts[parts.length - 1] || "").trim();

  if (!slug || slug === "redirect-link") {
    return new Response(notFoundHtml, { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  try {
    const { data, error } = await supabase.rpc("resolve_redirect_link", { _slug: slug });
    const link = Array.isArray(data) ? data[0] : data;
    if (error || !link) {
      return new Response(notFoundHtml, { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
    }

    const destinations = ((link as any).destinations as Destination[]) || [];
    if (!destinations.length) {
      return new Response(notFoundHtml, { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
    }

    // Mesma lógica da página antiga: escolha aleatória entre os destinos
    const dest = destinations[Math.floor(Math.random() * destinations.length)];
    const phone = String(dest.phone || "").replace(/\D/g, "");
    if (!phone) {
      return new Response(notFoundHtml, { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
    }
    const msg = dest.message ? `?text=${encodeURIComponent(dest.message)}` : "";
    const target = `https://wa.me/${phone}${msg}`;

    // Fire-and-forget: não bloqueia a resposta
    const count = supabase.rpc("increment_redirect_click", { link_id: (link as any).id });
    // @ts-ignore EdgeRuntime is available in Deno Deploy
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(count.then(() => {}).catch(() => {}));
    else count.then(() => {}).catch(() => {});

    return new Response(null, {
      status: 302,
      headers: {
        location: target,
        "cache-control": "no-store, no-cache, must-revalidate",
        "referrer-policy": "no-referrer",
      },
    });
  } catch (_e) {
    return new Response(notFoundHtml, { status: 500, headers: { "content-type": "text/html; charset=utf-8" } });
  }
});
