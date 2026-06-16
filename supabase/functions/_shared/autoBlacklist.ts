// Detects opt-out/block-request phrases from inbound messages and adds the
// contact to the organization blacklist automatically.
//
// Triggered when a lead writes something like "bloquear contato" so the
// atendente doesn't need to do it manually. They can still unblock later.

const KEYWORDS = [
  'bloquear contato',
  'bloquear meu contato',
  'bloquear esse contato',
  'bloqueia meu contato',
  'bloqueie meu contato',
  'bloquear numero',
  'bloquear meu numero',
  'bloqueia meu numero',
  'bloqueie meu numero',
  'me bloqueia',
  'me bloqueie',
  'nao quero mais receber',
  'nao quero receber mais',
  'pare de me enviar',
  'pare de mandar mensagem',
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function shouldAutoBlacklist(content: string, messageType?: string): boolean {
  if (!content) return false;
  if (messageType && !['text', 'button', 'interactive'].includes(messageType)) return false;
  if (content.startsWith('[')) return false; // synthetic placeholders like [Imagem]
  const normalized = normalize(content);
  if (normalized.length > 200) return false; // ignore long messages to avoid false positives
  return KEYWORDS.some((kw) => normalized.includes(kw));
}

export async function maybeAutoBlacklist(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  organizationId: string,
  phone: string,
  content: string,
  messageType?: string,
  contactName?: string | null,
): Promise<boolean> {
  try {
    if (!organizationId || !phone) return false;
    if (!shouldAutoBlacklist(content, messageType)) return false;

    const digits = phone.replace(/\D/g, '');
    const normalizedPhone = digits.startsWith('55') ? `+${digits}` : `+55${digits}`;

    const { error } = await supabase
      .from('blacklist')
      .upsert(
        {
          organization_id: organizationId,
          phone: normalizedPhone,
          name: contactName || null,
          reason: `Solicitado pelo lead via mensagem: "${content.slice(0, 180)}"`,
        },
        { onConflict: 'organization_id,phone', ignoreDuplicates: true },
      );

    if (error) {
      console.warn('[auto-blacklist] Failed to insert:', error.message);
      return false;
    }
    console.log('[auto-blacklist] Phone auto-blocked by lead request:', normalizedPhone);
    return true;
  } catch (e) {
    console.warn('[auto-blacklist] Unexpected error:', e);
    return false;
  }
}
