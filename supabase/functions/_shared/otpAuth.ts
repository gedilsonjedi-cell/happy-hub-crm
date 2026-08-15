import { createClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Conta break-glass: sempre isenta do OTP e única autorizada a mexer no kill-switch. */
export const OTP_ADMIN_EMAIL = "allan.pedro147@gmail.com";

export function isOtpAdminEmail(email?: string | null): boolean {
  return String(email || "").trim().toLowerCase() === OTP_ADMIN_EMAIL;
}

export function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

/** Valida o JWT do chamador e devolve o usuário autenticado (ou null). */
export async function getCaller(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await serviceClient().auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

/** Hash SHA-256 do código, salgado com um segredo do ambiente. Nunca guardamos o código puro. */
export async function hashCode(code: string, userId: string): Promise<string> {
  const secret = Deno.env.get("OTP_HASH_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const data = new TextEncoder().encode(`${secret}:${userId}:${code}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Data atual no fuso de Brasília (YYYY-MM-DD). */
export function brasiliaToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
