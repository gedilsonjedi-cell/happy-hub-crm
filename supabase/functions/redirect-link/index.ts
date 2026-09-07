// Sem SDK: import npm pesado causava ~1s de cold start por clique.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const rpc = (fn: string, body: unknown) =>
  fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

const notFoundHtml = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Link não encontrado</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f1512;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-align:center;padding:24px}h1{font-size:1.4rem;margin:0 0 8px}p{color:#9aa5a0;margin:0}</style></head><body><div><h1>Link não encontrado ou expirado</h1><p>Este link pode ter sido removido ou desativado.</p></div></body></html>`;

interface Destination { phone: string; message?: string }

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const slug = (url.searchParams.get("slug") || parts[parts.length - 1] || "").trim();

  if (!slug || slug === "redirect-link") {
    return new Response(notFoundHtml, { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
  }

  try {
    const res = await rpc("resolve_redirect_link_v2", { _slug: slug });
    const data = res.ok ? await res.json() : null;
    const link = Array.isArray(data) ? data[0] : data;
    if (!link) {
      return new Response(notFoundHtml, { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
    }

    const countClick = () => {
      const count = rpc("increment_redirect_click", { link_id: (link as any).id })
        .then(() => {})
        .catch(() => {});
      // @ts-ignore EdgeRuntime is available in Deno Deploy
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(count);
    };

    // Modo 1: redirecionamento de link externo
    if ((link as any).link_type === "external_redirect") {
      const raw = String((link as any).original_url || "").trim();
      let external = "";
      try {
        const parsed = new URL(raw);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") external = parsed.toString();
      } catch (_) { /* url inválida */ }

      if (!external) {
        return new Response(notFoundHtml, { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
      }

      countClick();
      return new Response(null, {
        status: 302,
        headers: {
          location: external,
          "cache-control": "no-store, no-cache, must-revalidate",
          "referrer-policy": "no-referrer",
        },
      });
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
    countClick();

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
