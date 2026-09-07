/**
 * Variáveis de link em botões de URL de templates da Meta.
 *
 * A sincronização de templates (`meta-sync-templates`) adiciona uma variável
 * `BOTAO_LINK_n` para cada botão de URL cujo link tenha `{{1}}`. Essas
 * variáveis NÃO fazem parte do corpo da mensagem: elas viajam no componente
 * `button` do payload da Meta. Por isso precisam ser separadas dos parâmetros
 * de corpo em todos os pontos de envio.
 */
export function isButtonLinkVariable(name: string): boolean {
  return /^BOTAO_LINK_\d+$/i.test(name || "");
}

/** Rótulo amigável para exibição na interface. */
export function templateVariableLabel(name: string, index: number): string {
  if (isButtonLinkVariable(name)) {
    const n = name.replace(/\D/g, "");
    return `Link do botão ${n} (parte final da URL, ex.: r/abc123)`;
  }
  return name || `Variável ${index + 1}`;
}

/** Separa os valores em parâmetros de corpo e parâmetros de botão. */
export function splitTemplateParams(
  variables: string[] | null | undefined,
  values: string[],
): { bodyParams: string[]; buttonParams: string[] } {
  const bodyParams: string[] = [];
  const buttonParams: string[] = [];
  (variables || []).forEach((varName, index) => {
    const value = values[index] ?? "";
    if (isButtonLinkVariable(varName)) buttonParams.push(value.trim());
    else bodyParams.push(value);
  });
  return { bodyParams, buttonParams };
}
