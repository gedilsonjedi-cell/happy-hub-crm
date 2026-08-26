/**
 * Extrai a mensagem real de erro de uma edge function.
 * supabase-js lança FunctionsHttpError em respostas não-2xx e `data` vem null,
 * então é preciso ler o corpo via error.context.
 */
export async function extractEdgeFunctionError(
  error: unknown,
  fallback = "Erro inesperado",
): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof (ctx as Response).json === "function") {
    try {
      const body = await (ctx as Response).clone().json();
      const msg = body?.error || body?.message;
      if (msg) return typeof msg === "string" ? msg : JSON.stringify(msg);
    } catch {
      try {
        const text = await (ctx as Response).clone().text();
        if (text) return text;
      } catch {
        /* ignore */
      }
    }
  }
  const message = (error as { message?: string })?.message;
  if (message && !/non-2xx status code/i.test(message)) return message;
  return fallback;
}
