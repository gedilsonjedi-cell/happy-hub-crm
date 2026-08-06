// Detects opt-out/block-request phrases from inbound messages and adds the
// contact to the organization blacklist automatically.
//
// Flow when a lead writes e.g. "bloquear contato":
//   1) Skip if number is already blacklisted for this org.
//   2) Send a polite goodbye/confirmation message via the same channel
//      (BEFORE inserting the blacklist row, because *-send refuses to send
//      to blacklisted numbers).
//   3) Insert the blacklist row so subsequent dispatches are blocked.
// Atendente can still unblock later from the chat menu or /lista-negra.

import { classifyLeadIntent } from './leadIntent.ts';

const GOODBYE_MESSAGE =
  'Entendido! Estamos removendo o seu contato da nossa lista de transmissão e você não receberá mais mensagens nossas. 🙏\n\n' +
  'Pedimos desculpas por qualquer incômodo. Caso futuramente precise dos nossos serviços ou tenha alguma dúvida, ' +
  'é só nos chamar aqui — estamos à disposição.';

export function shouldAutoBlacklist(content: string, messageType?: string): boolean {
  return classifyLeadIntent(content, messageType) === 'block';
}

export interface AutoBlacklistChannel {
  id: string;
  provider: string; // 'meta' | 'zapi' | 'gupshup'
}

/**
 * @param sendText optional direct sender (preferred). When provided it is used
 * instead of `supabase.functions.invoke`, which frequently fails inside
 * webhooks (auth/timeout) and was silently dropping the goodbye message.
 */
export async function maybeAutoBlacklist(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  organizationId: string,
  phone: string,
  content: string,
  messageType?: string,
  contactName?: string | null,
  channel?: AutoBlacklistChannel | null,
  sendText?: (to: string, body: string) => Promise<boolean>,
): Promise<boolean> {
  try {
    if (!organizationId || !phone) return false;
    if (!shouldAutoBlacklist(content, messageType)) return false;

    const digits = phone.replace(/\D/g, '');
    const normalizedPhone = digits.startsWith('55') ? `+${digits}` : `+55${digits}`;
    const plainPhone = normalizedPhone.replace(/\D/g, '');

    // 1) Skip if already blacklisted (avoid spamming the goodbye message).
    const { data: existing } = await supabase
      .from('blacklist')
      .select('id')
      .eq('organization_id', organizationId)
      .in('phone', [normalizedPhone, plainPhone])
      .limit(1);

    if (existing?.length) {
      console.log('[auto-blacklist] Already blacklisted, skipping:', normalizedPhone);
      return true;
    }

    // 2) Send goodbye message BEFORE blacklisting (send fns refuse to send to
    //    blacklisted numbers).
    let goodbyeSent = false;
    if (sendText) {
      try {
        goodbyeSent = await sendText(plainPhone, GOODBYE_MESSAGE);
        console.log('[auto-blacklist] Goodbye direct send result:', goodbyeSent);
      } catch (e) {
        console.warn('[auto-blacklist] Direct goodbye send threw:', e);
      }
    }

    if (!goodbyeSent && channel?.id && channel?.provider) {
      const provider = channel.provider.toLowerCase();
      const fnName = provider === 'meta'
        ? 'meta-send'
        : provider === 'zapi'
        ? 'zapi-send'
        : provider === 'gupshup'
        ? 'gupshup-send'
        : null;

      if (fnName) {
        try {
          const { error: sendError } = await supabase.functions.invoke(fnName, {
            body: {
              channelId: channel.id,
              destination: normalizedPhone,
              message: GOODBYE_MESSAGE,
              messageType: 'text',
            },
          });
          if (sendError) {
            console.warn('[auto-blacklist] Goodbye send failed (continuing to block):', sendError.message || sendError);
          } else {
            goodbyeSent = true;
            console.log('[auto-blacklist] Goodbye message sent to', normalizedPhone, 'via', fnName);
          }
        } catch (sendErr) {
          console.warn('[auto-blacklist] Goodbye send threw (continuing to block):', sendErr);
        }
      }
    }

    // 3) Insert blacklist row.
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
      return true; // intent was block — never send welcome after it
    }
    console.log('[auto-blacklist] Phone auto-blocked by lead request:', normalizedPhone);
    return true;
  } catch (e) {
    console.warn('[auto-blacklist] Unexpected error:', e);
    return false;
  }
}
