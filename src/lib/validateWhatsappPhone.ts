import { VALID_BRAZILIAN_DDDS } from "./brazilPhoneValidation";

export interface WhatsappPhoneValidation {
  isValid: boolean;
  /** E.164 sem "+": apenas dígitos com DDI (ex.: 5514981564414) */
  e164: string;
  /** Formatado para exibição (ex.: +55 (14) 98156-4414) */
  formatted: string;
  error: string | null;
}

/**
 * Valida o WhatsApp de um USUÁRIO do sistema (operador/admin).
 * Regras: DDI 55, DDD brasileiro válido e celular com 9 dígitos (9º dígito).
 * Números fixos não são aceitos (WhatsApp exige celular).
 */
export function validateWhatsappPhone(input: string): WhatsappPhoneValidation {
  const fail = (error: string): WhatsappPhoneValidation => ({
    isValid: false,
    e164: "",
    formatted: "",
    error,
  });

  let digits = (input || "").replace(/\D/g, "");
  if (!digits) return fail("Informe o número de WhatsApp.");

  // Aceita com ou sem DDI: 11 dígitos = sem DDI, 13 = com DDI 55
  if (digits.length === 11) {
    digits = "55" + digits;
  } else if (digits.length === 10) {
    return fail("Número inválido: informe o celular com o 9º dígito (11 dígitos + DDI).");
  }

  if (!digits.startsWith("55")) {
    return fail("Apenas números do Brasil (DDI 55) são aceitos.");
  }

  const national = digits.slice(2);

  if (national.length !== 11) {
    return fail(
      `Número inválido: esperado DDI 55 + DDD (2) + celular (9). Dígitos após o 55: ${national.length}.`
    );
  }

  const ddd = national.slice(0, 2);
  if (!VALID_BRAZILIAN_DDDS.includes(ddd)) {
    return fail(`DDD ${ddd} inválido.`);
  }

  if (national[2] !== "9") {
    return fail("Celular deve começar com 9 após o DDD.");
  }

  if (!["6", "7", "8", "9"].includes(national[3])) {
    return fail("Celular inválido: o dígito após o 9 deve ser 6, 7, 8 ou 9.");
  }

  return {
    isValid: true,
    e164: digits,
    formatted: formatWhatsappPhone(digits),
    error: null,
  };
}

/** Formata um E.164 (ou parcial) para exibição. */
export function formatWhatsappPhone(value: string): string {
  const digits = (value || "").replace(/\D/g, "");
  if (!digits) return "";
  const national = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  const ddd = national.slice(0, 2);
  const rest = national.slice(2);
  if (rest.length <= 4) return `+55 (${ddd}) ${rest}`.trim();
  if (rest.length <= 9) {
    const head = rest.slice(0, rest.length - 4);
    const tail = rest.slice(rest.length - 4);
    return `+55 (${ddd}) ${head}-${tail}`;
  }
  return `+${digits}`;
}
