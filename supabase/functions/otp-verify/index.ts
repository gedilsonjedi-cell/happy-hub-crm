import { brasiliaToday, corsHeaders, getCaller, hashCode, json, serviceClient } from "../_shared/otpAuth.ts";

const MAX_ATTEMPTS = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const caller = await getCaller(req);
    if (!caller) return json({ error: "Não autenticado" }, 401);

    const { code } = await req.json().catch(() => ({ code: "" }));
    const clean = String(code || "").replace(/\D/g, "");
    if (clean.length !== 6) return json({ error: "Informe os 6 dígitos do código." }, 400);

    const db = serviceClient();
    const { data: row } = await db
      .from("otp_codes")
      .select("id, code_hash, expires_at, attempts, consumed_at")
      .eq("user_id", caller.id)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!row) return json({ error: "Nenhum código pendente. Solicite um novo." }, 400);
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return json({ error: "Código expirado. Solicite um novo." }, 400);
    }
    if ((row.attempts ?? 0) >= MAX_ATTEMPTS) {
      return json({ error: "Muitas tentativas. Solicite um novo código." }, 429);
    }

    const expected = await hashCode(clean, caller.id);
    if (expected !== row.code_hash) {
      await db.from("otp_codes").update({ attempts: (row.attempts ?? 0) + 1 }).eq("id", row.id);
      const left = MAX_ATTEMPTS - ((row.attempts ?? 0) + 1);
      return json({ error: `Código incorreto. ${left > 0 ? `${left} tentativa(s) restante(s).` : "Solicite um novo código."}` }, 400);
    }

    const today = brasiliaToday();
    await db.from("otp_codes").update({ consumed_at: new Date().toISOString() }).eq("id", row.id);
    const { error: profileError } = await db
      .from("profiles").update({ otp_last_verified_date: today }).eq("user_id", caller.id);
    if (profileError) {
      console.error("[otp-verify] erro ao gravar data:", profileError.message);
      return json({ error: "Código válido, mas falhou ao registrar. Tente novamente." }, 500);
    }

    return json({ success: true, verifiedDate: today });
  } catch (error) {
    console.error("[otp-verify] exceção:", error);
    return json({ error: error instanceof Error ? error.message : "Erro inesperado" }, 500);
  }
});
