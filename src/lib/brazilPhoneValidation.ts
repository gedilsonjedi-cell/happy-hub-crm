// Lista de DDDs válidos do Brasil
export const VALID_BRAZILIAN_DDDS = [
  // Região Sudeste
  '11', '12', '13', '14', '15', '16', '17', '18', '19', // São Paulo
  '21', '22', '24', // Rio de Janeiro
  '27', '28', // Espírito Santo
  '31', '32', '33', '34', '35', '37', '38', // Minas Gerais
  // Região Sul
  '41', '42', '43', '44', '45', '46', // Paraná
  '47', '48', '49', // Santa Catarina
  '51', '53', '54', '55', // Rio Grande do Sul
  // Região Centro-Oeste
  '61', // Distrito Federal
  '62', '64', // Goiás
  '63', // Tocantins
  '65', '66', // Mato Grosso
  '67', // Mato Grosso do Sul
  // Região Nordeste
  '71', '73', '74', '75', '77', // Bahia
  '79', // Sergipe
  '81', '87', // Pernambuco
  '82', // Alagoas
  '83', // Paraíba
  '84', // Rio Grande do Norte
  '85', '88', // Ceará
  '86', '89', // Piauí
  // Região Norte
  '91', '93', '94', // Pará
  '92', '97', // Amazonas
  '95', // Roraima
  '96', // Amapá
  '98', '99', // Maranhão
  '68', // Acre
  '69', // Rondônia
];

export interface PhoneValidationResult {
  isValid: boolean;
  isMobile: boolean;
  isLandline: boolean;
  ddd: string | null;
  formattedNumber: string;
  errorMessage: string | null;
  details: {
    hasValidDDD: boolean;
    hasValidLength: boolean;
    hasValidMobilePrefix: boolean;
    phoneType: 'mobile' | 'landline' | 'unknown';
  };
}

/**
 * Valida um número de telefone brasileiro
 * Regras:
 * - Celulares: DDD (2 dígitos) + 9 + 8 dígitos = 11 dígitos total
 * - Fixos: DDD (2 dígitos) + 8 dígitos = 10 dígitos total (começando com 2, 3, 4 ou 5)
 */
export function validateBrazilianPhone(phone: string): PhoneValidationResult {
  // Remove todos os caracteres não numéricos
  let digits = phone.replace(/\D/g, '');
  
  // Remove prefixo do Brasil se existir
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }
  
  const result: PhoneValidationResult = {
    isValid: false,
    isMobile: false,
    isLandline: false,
    ddd: null,
    formattedNumber: '',
    errorMessage: null,
    details: {
      hasValidDDD: false,
      hasValidLength: false,
      hasValidMobilePrefix: false,
      phoneType: 'unknown',
    },
  };

  // Verificar tamanho básico (10 para fixo, 11 para celular)
  if (digits.length < 10 || digits.length > 11) {
    result.errorMessage = `Número deve ter 10 (fixo) ou 11 (celular) dígitos. Atual: ${digits.length}`;
    return result;
  }

  // Extrair DDD
  const ddd = digits.slice(0, 2);
  result.ddd = ddd;

  // Validar DDD
  if (!VALID_BRAZILIAN_DDDS.includes(ddd)) {
    result.errorMessage = `DDD ${ddd} inválido`;
    return result;
  }
  result.details.hasValidDDD = true;

  // Extrair o número sem DDD
  const numberWithoutDDD = digits.slice(2);
  const firstDigit = numberWithoutDDD[0];

  if (digits.length === 11) {
    // Celular: deve começar com 9
    if (firstDigit !== '9') {
      result.errorMessage = 'Celular deve começar com 9 após o DDD';
      return result;
    }
    
    // Segundo dígito do celular deve ser 6, 7, 8 ou 9
    const secondDigit = numberWithoutDDD[1];
    if (!['6', '7', '8', '9'].includes(secondDigit)) {
      result.errorMessage = 'Celular inválido: segundo dígito deve ser 6, 7, 8 ou 9';
      return result;
    }

    result.details.hasValidMobilePrefix = true;
    result.details.phoneType = 'mobile';
    result.isMobile = true;
    result.details.hasValidLength = true;
    result.isValid = true;
    result.formattedNumber = `+55${digits}`;
  } else if (digits.length === 10) {
    // Fixo: deve começar com 2, 3, 4 ou 5
    if (!['2', '3', '4', '5'].includes(firstDigit)) {
      // Pode ser um celular antigo sem o 9
      if (firstDigit === '9' || ['6', '7', '8'].includes(firstDigit)) {
        result.errorMessage = 'Celular deve ter 11 dígitos (com o 9 na frente)';
        result.details.phoneType = 'mobile';
        return result;
      }
      result.errorMessage = 'Telefone fixo deve começar com 2, 3, 4 ou 5';
      return result;
    }

    result.details.phoneType = 'landline';
    result.isLandline = true;
    result.details.hasValidLength = true;
    result.isValid = true;
    // Fixos não funcionam com WhatsApp, marcar como válido mas avisar
    result.formattedNumber = `+55${digits}`;
    result.errorMessage = 'Telefone fixo - não funciona com WhatsApp';
  }

  return result;
}

/**
 * Normaliza o telefone para armazenamento no banco de dados
 * SEMPRE adiciona o 55 na frente se não tiver
 * Retorna apenas dígitos com o 55 na frente (sem o +)
 */
export function normalizePhoneForStorage(phone: string): string {
  // Remove tudo que não é dígito
  let digits = phone.replace(/\D/g, '');
  
  // Se está vazio, retorna vazio
  if (!digits) return '';
  
  // Se já começa com 55 E tem mais de 11 dígitos (55 + DDD + número), está ok
  if (digits.startsWith('55') && digits.length > 11) {
    return digits;
  }
  
  // Se começa com 55 mas tem exatamente 11 ou menos dígitos, 
  // pode ser que os 55 são parte do DDD (ex: 55991234567 = DDD 55 + número)
  // Nesse caso, precisamos adicionar o 55 na frente
  if (digits.startsWith('55') && digits.length <= 11) {
    return '55' + digits;
  }
  
  // Não começa com 55, adiciona na frente
  return '55' + digits;
}

/**
 * Formata um número brasileiro para o padrão internacional
 * Adiciona o 9 se for celular e estiver faltando
 */
export function formatBrazilianPhone(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  
  // Remove +55 se existir
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }

  // Se tem 10 dígitos e parece ser celular (começa com DDD válido + 6/7/8/9)
  if (digits.length === 10) {
    const ddd = digits.slice(0, 2);
    const firstDigit = digits[2];
    
    if (VALID_BRAZILIAN_DDDS.includes(ddd) && ['6', '7', '8', '9'].includes(firstDigit)) {
      // Adiciona o 9 na frente
      digits = ddd + '9' + digits.slice(2);
    }
  }

  // Adiciona +55
  if (!digits.startsWith('55')) {
    digits = '55' + digits;
  }

  return '+' + digits;
}

/**
 * Retorna informações legíveis sobre a validação
 */
export function getValidationMessage(result: PhoneValidationResult): string {
  if (result.isValid) {
    if (result.isMobile) {
      return `✓ Celular válido (DDD ${result.ddd})`;
    }
    if (result.isLandline) {
      return `⚠ Fixo válido (DDD ${result.ddd}) - Não funciona com WhatsApp`;
    }
  }
  return result.errorMessage || 'Número inválido';
}

/**
 * Retorna o status de validação para uso na interface
 */
export function getValidationStatus(result: PhoneValidationResult): 'valid' | 'invalid' | 'warning' {
  if (!result.isValid) return 'invalid';
  if (result.isLandline) return 'warning';
  return 'valid';
}
