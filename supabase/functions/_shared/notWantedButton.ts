// Detecta cliques no botão "Não Quero" (ou "Não Quero Consultar") em mensagens
// inbound de template. Mesma lógica de extractButtonLabel usada no heatmap e na
// exportação de leads sem interação.

export interface ButtonMsgLike {
  message_type?: string | null;
  content?: string | null;
  // deno-lint-ignore no-explicit-any
  metadata?: any;
}

export function extractButtonLabel(m: ButtonMsgLike): string | null {
  const md = m.metadata || {};
  return (
    md.button_text ||
    md.title ||
    md?.interactive?.button_reply?.title ||
    (m.message_type === 'button' || m.message_type === 'interactive' ? m.content || null : null) ||
    null
  );
}

export function normalizeLabel(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

// Rótulos que finalizam a conversa automaticamente.
export const NOT_WANTED_LABELS = new Set(
  ['Não Quero', 'Nao Quero', 'Não Quero Consultar', 'Nao Quero Consultar'].map(normalizeLabel),
);

export function isNotWantedLabel(label?: string | null): boolean {
  if (!label) return false;
  return NOT_WANTED_LABELS.has(normalizeLabel(label));
}

export function isNotWantedMessage(m: ButtonMsgLike): boolean {
  return isNotWantedLabel(extractButtonLabel(m));
}
