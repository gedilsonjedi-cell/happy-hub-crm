// Espelho de supabase/functions/_shared/notWantedButton.ts: rótulos do botão "Não Quero".
export function normalizeLabel(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
}

export const NOT_WANTED_LABELS = new Set(
  ["Não Quero", "Nao Quero", "Não Quero Consultar", "Nao Quero Consultar"].map(normalizeLabel),
);

export function isNotWantedLabel(label?: string | null): boolean {
  if (!label) return false;
  return NOT_WANTED_LABELS.has(normalizeLabel(label));
}
