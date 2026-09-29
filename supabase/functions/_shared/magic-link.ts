const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHAT_PATH_RE = /^\/?c\/[a-z0-9-]{6,36}(\?.*)?$/i;

/**
 * Link Mágico: quando a variável do botão de URL é uma rota de Web Chat (ex.: "c/42ab3761"),
 * anexa ?lead_id=<destinatário> para o chat abrir já no cadastro do contato.
 */
export function withMagicLeadId(value: string, leadId: string | null | undefined): string {
  const v = (value || "").trim();
  if (!v || !leadId || !UUID_RE.test(leadId) || !CHAT_PATH_RE.test(v)) return v;
  if (/[?&]lead_id=/i.test(v)) return v;
  return `${v}${v.includes("?") ? "&" : "?"}lead_id=${leadId}`;
}
