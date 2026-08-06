// Classifies inbound lead messages into intents used by the webhooks:
//  - "block"    → lead asks to be blocked / removed from the list
//  - "negative" → lead declines the offer ("não quero", "sem interesse", ...)
//  - "other"    → anything else (positive / neutral)
//
// Rules:
//  * "block" wins over "negative".
//  * Welcome messages are only sent for "other".

export type LeadIntent = 'block' | 'negative' | 'other';

const BLOCK_KEYWORDS = [
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
  'sair da lista',
  'me remova da lista',
  'remover da lista',
  'descadastrar',
  'nao perturbe',
];

const NEGATIVE_KEYWORDS = [
  'nao quero',
  'nao queria',
  'nao tenho interesse',
  'nao tenho interece',
  'sem interesse',
  'nao me interessa',
  'nao interessa',
  'nao preciso',
  'nao desejo',
  'nao obrigado',
  'nao obrigada',
  'agora nao',
  'no momento nao',
  'nao vou querer',
];

export const DECLINE_MESSAGE =
  'Entendemos e agradecemos o seu retorno. 🙏\n\n' +
  'Caso mude de ideia, estaremos por aqui à disposição — é só nos chamar.\n\n' +
  'Somos uma empresa séria, com anos de atuação no mercado e milhares de clientes atendidos com transparência e segurança. ' +
  'Será um prazer poder ajudar você quando precisar. Tenha um excelente dia! 😊';

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function classifyLeadIntent(content: string, messageType?: string): LeadIntent {
  if (!content) return 'other';
  if (messageType && !['text', 'button', 'interactive'].includes(messageType)) return 'other';
  if (content.startsWith('[')) return 'other'; // synthetic placeholders like [Imagem]

  const normalized = normalizeText(content);
  if (!normalized || normalized.length > 200) return 'other';

  if (BLOCK_KEYWORDS.some((kw) => normalized.includes(kw))) return 'block';
  if (NEGATIVE_KEYWORDS.some((kw) => normalized.includes(kw))) return 'negative';
  return 'other';
}

/**
 * A mensagem de recusa (DECLINE_MESSAGE) só pode ser enviada quando a mensagem
 * negativa for o PRIMEIRO contato do lead. Se já existir qualquer mensagem
 * anterior dessa conversa (inbound ou outbound de atendente), NÃO enviar.
 *
 * Retorna true apenas quando não há histórico prévio de conversa.
 */
export async function isFirstInboundContact(
  // deno-lint-ignore no-explicit-any
  db: any,
  phone: string,
  currentMessageId?: string | null,
): Promise<boolean> {
  try {
    const digits = (phone || '').replace(/\D/g, '');
    if (!digits) return false;
    const suffix = digits.slice(-8);

    const { data, error } = await db
      .from('whatsapp_messages')
      .select('message_id, direction')
      .like('sender_phone', `%${suffix}`)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.warn('[leadIntent] isFirstInboundContact query failed, blocking decline:', error.message);
      return false; // em caso de dúvida, NÃO enviar
    }

    const previous = (data || []).filter(
      (m: { message_id?: string }) => !currentMessageId || m.message_id !== currentMessageId,
    );
    return previous.length === 0;
  } catch (e) {
    console.warn('[leadIntent] isFirstInboundContact threw, blocking decline:', e);
    return false;
  }
}
