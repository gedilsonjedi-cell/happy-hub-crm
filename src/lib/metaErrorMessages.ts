// Helper to translate Meta API error codes to user-friendly messages in Portuguese
// Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes

interface ErrorInfo {
  title: string;
  description: string;
  suggestion?: string;
  link?: string;
}

const META_ERROR_CODES: Record<string, ErrorInfo> = {
  // Rate limiting errors
  "130429": {
    title: "Limite de taxa atingido",
    description: "Muitas mensagens enviadas em pouco tempo.",
    suggestion: "Aguarde alguns minutos e tente novamente.",
    link: "https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes#rate-limit"
  },
  
  // Template errors
  "131000": {
    title: "Template não encontrado",
    description: "O template solicitado não existe ou não está aprovado.",
    suggestion: "Verifique se o template está aprovado no Meta Business Manager."
  },
  "131001": {
    title: "Parâmetros do template inválidos",
    description: "Os parâmetros fornecidos não correspondem ao template.",
    suggestion: "Verifique os parâmetros do template e tente novamente."
  },
  "131008": {
    title: "Parâmetros obrigatórios ausentes",
    description: "O template requer parâmetros que não foram fornecidos.",
    suggestion: "Verifique se todos os parâmetros do template estão preenchidos."
  },
  "131009": {
    title: "Formato de parâmetro inválido",
    description: "Os parâmetros não estão no formato correto.",
    suggestion: "Verifique o formato dos parâmetros (texto, número, data, etc.)."
  },
  "131026": {
    title: "Número sem WhatsApp ou bloqueado",
    description: "O número não tem WhatsApp ativo, bloqueou sua conta, ou não está disponível para receber mensagens.",
    suggestion: "AÇÕES: 1) Verifique se o número está correto e formatado (55 + DDD + 9 + número), 2) O contato pode ter bloqueado mensagens comerciais, 3) O número pode ter sido desativado. Considere remover da lista de contatos."
  },
  "131031": {
    title: "Conta restrita ou desabilitada",
    description: "A conta do WhatsApp Business associada ao app foi restrita ou desabilitada por violar uma política da plataforma.",
    suggestion: "Entre em contato com o suporte do Meta para resolver a restrição."
  },
  "131042": {
    title: "Falha na renderização do template",
    description: "Os parâmetros fornecidos não puderam ser aplicados ao template.",
    suggestion: "Verifique se os parâmetros correspondem às variáveis do template."
  },
  "131045": {
    title: "Template pausado",
    description: "O template foi pausado devido a baixa qualidade.",
    suggestion: "Verifique a qualidade do template no Meta Business Manager."
  },
  "131047": {
    title: "Janela de 24h expirada",
    description: "O contato não responde há mais de 24 horas. A Meta bloqueia o envio de mensagens livres (texto) fora dessa janela.",
    suggestion: "Envie um TEMPLATE aprovado (HSM) para reabrir a conversa. Após o contato responder, a janela de 24h é reaberta e você pode mandar texto livre novamente."
  },
  "131048": {
    title: "Spam detectado",
    description: "A mensagem foi identificada como potencialmente spam.",
    suggestion: "Revise o conteúdo e evite envios em massa sem contexto."
  },
  "131049": {
    title: "Limite de marketing atingido",
    description: "A Meta limitou mensagens de MARKETING para este contato específico. Este é o erro mais comum e é uma restrição POR USUÁRIO imposta pela Meta.",
    suggestion: "SOLUÇÕES: 1) Use templates do tipo UTILITY ao invés de MARKETING, 2) Aguarde o contato responder para abrir janela de conversa, 3) Reduza a frequência de disparos de marketing para este número. NÃO é problema do seu sistema - é uma limitação da Meta para proteger usuários.",
    link: "https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates#per-user-marketing-template-message-limits"
  },
  "131051": {
    title: "Tipo de mensagem não suportado",
    description: "O tipo de mensagem não é suportado para este destino.",
    suggestion: "Use um tipo de mensagem diferente (texto, template, etc.)."
  },
  "131052": {
    title: "Download de mídia falhou",
    description: "O servidor não conseguiu baixar a mídia da URL fornecida.",
    suggestion: "Verifique se a URL da mídia está acessível publicamente."
  },
  "131053": {
    title: "Upload de mídia falhou",
    description: "O upload da mídia para o servidor falhou.",
    suggestion: "Tente novamente ou use um arquivo menor."
  },
  "131056": {
    title: "Número de telefone fora da janela de 24h",
    description: "Não é possível enviar mensagem livre fora da janela de 24 horas.",
    suggestion: "Use um template aprovado para iniciar nova conversa."
  },
  "131057": {
    title: "Conta de negócios necessária",
    description: "O destinatário não está usando WhatsApp Business.",
    suggestion: "Este recurso requer que o destinatário use WhatsApp Business."
  },
  
  // Permission errors
  "10": {
    title: "Sem permissão na conta",
    description: "Seu aplicativo não tem permissão para enviar mensagens em nome desta conta do WhatsApp Business.",
    suggestion: "SOLUÇÃO: Acesse Meta Business Suite > Configurações > Usuários > Parceiros e adicione permissões completas de WhatsApp ao seu aplicativo."
  },
  "3": {
    title: "Permissão granular ausente",
    description: "O aplicativo não tem permissão granular da API para fazer esta chamada.",
    suggestion: "SOLUÇÃO: No Meta Developer Console, vá em seu app > WhatsApp > Configurações da API e ative todas as permissões necessárias."
  },
  "132000": {
    title: "Erro de permissão",
    description: "O app não tem permissão para enviar mensagens.",
    suggestion: "Verifique as permissões do app no Meta Business Manager."
  },
  "132001": {
    title: "Template não existe",
    description: "O template solicitado não existe na conta ou o idioma especificado não está disponível.",
    suggestion: "SOLUÇÃO: 1) Verifique o nome exato do template no Meta Business Manager, 2) Confirme que o template está aprovado, 3) Sincronize os templates na página de Templates do sistema."
  },
  "132005": {
    title: "Usuário não aceita mensagens",
    description: "O destinatário bloqueou ou reportou este número.",
    suggestion: "O contato optou por não receber mensagens desta conta."
  },
  "132007": {
    title: "Limite de mensagens excedido",
    description: "O limite diário de mensagens foi atingido.",
    suggestion: "Aguarde 24 horas ou aumente o limite no Meta Business Manager."
  },
  "132015": {
    title: "Erro de integração",
    description: "Erro na integração com a API do WhatsApp.",
    suggestion: "Verifique as credenciais e configurações da API."
  },
  "132068": {
    title: "Limite de qualidade excedido",
    description: "O limite de qualidade da conta foi excedido.",
    suggestion: "Melhore a qualidade das mensagens enviadas."
  },
  "132069": {
    title: "Acesso de marketing não permitido",
    description: "A conta não tem permissão para enviar mensagens de marketing.",
    suggestion: "Complete o processo de verificação de negócios."
  },
  
  // Generic errors
  "133000": {
    title: "Número inválido",
    description: "O número de telefone não é válido ou não está no WhatsApp.",
    suggestion: "Verifique se o número está correto e tem WhatsApp ativo."
  },
  "133001": {
    title: "Número bloqueado",
    description: "O número está na lista de bloqueio ou foi reportado.",
    suggestion: "Este contato não pode receber mensagens desta conta."
  },
  "133004": {
    title: "Servidor indisponível",
    description: "O servidor do WhatsApp está temporariamente indisponível.",
    suggestion: "Tente novamente em alguns minutos."
  },
  "133005": {
    title: "Sessão expirada",
    description: "A sessão de envio expirou.",
    suggestion: "Reinicie a conversa ou tente novamente."
  },
  "133006": {
    title: "Recurso temporariamente indisponível",
    description: "O recurso solicitado está temporariamente indisponível.",
    suggestion: "Tente novamente em alguns minutos."
  },
  "133010": {
    title: "Número não registrado",
    description: "O número de telefone não está registrado no WhatsApp.",
    suggestion: "Verifique se o contato possui WhatsApp ativo."
  },
  "133015": {
    title: "Conta suspensa",
    description: "A conta de envio foi suspensa.",
    suggestion: "Entre em contato com o suporte do Meta."
  },
  
  // Additional common errors
  "135000": {
    title: "Erro genérico do Meta",
    description: "A Meta retornou um erro interno ao processar o template. Este é um problema conhecido da plataforma.",
    suggestion: "SOLUÇÃO: 1) Recrie o template no Meta Business Manager, ou 2) Remova e adicione novamente o número de telefone nas configurações do WhatsApp Business.",
    link: "https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes"
  },
  "400": {
    title: "Requisição inválida",
    description: "Os dados enviados estão incorretos ou incompletos.",
    suggestion: "Verifique os dados e tente novamente."
  },
  "401": {
    title: "Não autorizado",
    description: "Token de acesso inválido ou expirado.",
    suggestion: "Verifique as credenciais de acesso."
  },
  "403": {
    title: "Acesso negado",
    description: "Sem permissão para realizar esta ação.",
    suggestion: "Verifique as permissões da conta."
  },
  "500": {
    title: "Erro interno",
    description: "Erro interno no servidor do WhatsApp.",
    suggestion: "Tente novamente em alguns minutos."
  }
};

/**
 * Extracts error code from an error message string
 */
export function extractErrorCode(errorMessage: string | null | undefined): string | null {
  if (!errorMessage) return null;
  
  // Try to find a 6-digit error code (Meta format)
  const sixDigitMatch = errorMessage.match(/\b1[3][0-9]{4}\b/);
  if (sixDigitMatch) return sixDigitMatch[0];
  
  // Try to find 3-digit HTTP error codes
  const httpCodeMatch = errorMessage.match(/\b[4-5][0-9]{2}\b/);
  if (httpCodeMatch) return httpCodeMatch[0];
  
  return null;
}

/**
 * Gets detailed error information from error code or message
 */
export function getErrorInfo(errorMessage: string | null | undefined): ErrorInfo {
  const errorCode = extractErrorCode(errorMessage);
  
  if (errorCode && META_ERROR_CODES[errorCode]) {
    return META_ERROR_CODES[errorCode];
  }
  
  // Try to determine error type from message content
  if (errorMessage) {
    const lowerMessage = errorMessage.toLowerCase();
    
    if (lowerMessage.includes("template") && lowerMessage.includes("marketing")) {
      return META_ERROR_CODES["131049"];
    }
    if (lowerMessage.includes("restrita") || lowerMessage.includes("restricted")) {
      return META_ERROR_CODES["131031"];
    }
    if (lowerMessage.includes("janela") || lowerMessage.includes("window") || lowerMessage.includes("24h")) {
      return META_ERROR_CODES["131056"];
    }
    if (lowerMessage.includes("spam")) {
      return META_ERROR_CODES["131048"];
    }
    if (lowerMessage.includes("bloqueado") || lowerMessage.includes("blocked")) {
      return META_ERROR_CODES["133001"];
    }
    if (lowerMessage.includes("não registrado") || lowerMessage.includes("not registered")) {
      return META_ERROR_CODES["133010"];
    }
    if (lowerMessage.includes("rate") || lowerMessage.includes("limite")) {
      return META_ERROR_CODES["130429"];
    }
    if (lowerMessage.includes("saldo") || lowerMessage.includes("balance")) {
      return {
        title: "Saldo insuficiente",
        description: "A organização não possui saldo suficiente para enviar mensagens.",
        suggestion: "Adicione créditos à sua conta para continuar enviando."
      };
    }
    if (lowerMessage.includes("blacklist") || lowerMessage.includes("lista negra")) {
      return {
        title: "Número bloqueado",
        description: "Este número está na lista de bloqueio da organização.",
        suggestion: "Remova o número da lista negra se desejar enviar mensagens."
      };
    }
  }
  
  // Default error info
  return {
    title: "Erro ao enviar",
    description: errorMessage || "Ocorreu um erro desconhecido ao enviar a mensagem.",
    suggestion: "Tente novamente. Se o erro persistir, contate o suporte."
  };
}

/**
 * Formats error for display with all details
 */
export function formatErrorDisplay(errorMessage: string | null | undefined): {
  code: string | null;
  title: string;
  description: string;
  suggestion: string;
  link?: string;
} {
  const code = extractErrorCode(errorMessage);
  const info = getErrorInfo(errorMessage);
  
  return {
    code,
    title: info.title,
    description: info.description,
    suggestion: info.suggestion || "Tente novamente ou contate o suporte.",
    link: info.link
  };
}
