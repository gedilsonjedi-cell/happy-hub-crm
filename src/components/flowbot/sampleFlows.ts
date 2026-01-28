import { CanvasNode } from "./types";

interface GeneratedFlow {
  name: string;
  description: string;
  nodes: CanvasNode[];
  edges: { source: string; target: string; sourceHandle?: string }[];
}

export function generateEmprestimoCLTFlow(): GeneratedFlow {
  const nodeIds = {
    start: `node_start_${Date.now()}`,
    welcome: `node_welcome_${Date.now() + 1}`,
    collectName: `node_name_${Date.now() + 2}`,
    tempoEmpresa: `node_tempo_${Date.now() + 3}`,
    rejectionMessage: `node_rejection_${Date.now() + 4}`,
    endFlow: `node_end_${Date.now() + 5}`,
    collectCPF: `node_cpf_${Date.now() + 6}`,
    thankYou: `node_thanks_${Date.now() + 7}`,
    transfer: `node_transfer_${Date.now() + 8}`,
  };

  const buttonIds = {
    sim: `btn_sim_${Date.now()}`,
    nao: `btn_nao_${Date.now()}`
  };

  const nodes: CanvasNode[] = [
    // Start Node
    {
      id: nodeIds.start,
      type: "start",
      position: { x: 400, y: 30 },
      data: { label: "Início" }
    },
    // Welcome Message
    {
      id: nodeIds.welcome,
      type: "message",
      position: { x: 400, y: 130 },
      data: {
        label: "Boas-vindas",
        message: "Olá! 👋 Seja bem-vindo(a) ao nosso atendimento de crédito consignado para trabalhadores CLT.\n\nVou fazer algumas perguntas rápidas para verificar se você se qualifica para nossas condições especiais!"
      }
    },
    // Collect Name
    {
      id: nodeIds.collectName,
      type: "collect_data",
      position: { x: 400, y: 270 },
      data: {
        label: "Nome",
        message: "Para começar, qual é o seu nome completo? 📝",
        variable_name: "nome",
        variable_type: "text"
      }
    },
    // Employment Time Buttons
    {
      id: nodeIds.tempoEmpresa,
      type: "buttons",
      position: { x: 400, y: 410 },
      data: {
        label: "Tempo de Empresa",
        message: "Perfeito, {{nome}}! 🎯\n\nVocê trabalha na empresa atual há mais de 3 meses com carteira assinada?",
        buttons: [
          { id: buttonIds.sim, label: "✅ Sim, mais de 3 meses", value: "sim" },
          { id: buttonIds.nao, label: "❌ Não, menos de 3 meses", value: "nao" }
        ]
      }
    },
    // Rejection Message (Não path)
    {
      id: nodeIds.rejectionMessage,
      type: "message",
      position: { x: 150, y: 580 },
      data: {
        label: "Sem Qualificação",
        message: "😔 Poxa, {{nome}}...\n\nNo momento, os bancos não estão ofertando crédito para trabalhadores com carteira assinada com menos de 3 meses de empresa.\n\nMas não se preocupe! Assim que completar 3 meses, entre em contato conosco novamente que teremos o prazer em te atender! 💪"
      }
    },
    // End Flow Action (after rejection)
    {
      id: nodeIds.endFlow,
      type: "action",
      position: { x: 150, y: 750 },
      data: {
        label: "Encerrar",
        action_type: "end"
      }
    },
    // Collect CPF (Sim path)
    {
      id: nodeIds.collectCPF,
      type: "collect_data",
      position: { x: 620, y: 580 },
      data: {
        label: "CPF",
        message: "Excelente! 🎉 Você está no caminho certo!\n\nAgora preciso do seu CPF para dar continuidade ao seu atendimento:",
        variable_name: "cpf",
        variable_type: "text"
      }
    },
    // Thank You Message
    {
      id: nodeIds.thankYou,
      type: "message",
      position: { x: 620, y: 750 },
      data: {
        label: "Agradecimento",
        message: "Obrigado pelas informações, {{nome}}! ✅\n\nEstamos direcionando seu atendimento para um dos nossos especialistas em crédito consignado.\n\nEm instantes você será atendido! 🚀"
      }
    },
    // Transfer Action
    {
      id: nodeIds.transfer,
      type: "action",
      position: { x: 620, y: 920 },
      data: {
        label: "Transferir",
        action_type: "transfer",
        transfer_message: "Transferindo para um atendente especializado..."
      }
    }
  ];

  const edges = [
    // Start -> Welcome
    { source: nodeIds.start, target: nodeIds.welcome },
    // Welcome -> Collect Name
    { source: nodeIds.welcome, target: nodeIds.collectName },
    // Collect Name -> Employment Time
    { source: nodeIds.collectName, target: nodeIds.tempoEmpresa },
    // Employment Time (Não) -> Rejection
    { source: nodeIds.tempoEmpresa, target: nodeIds.rejectionMessage, sourceHandle: buttonIds.nao },
    // Rejection -> End
    { source: nodeIds.rejectionMessage, target: nodeIds.endFlow },
    // Employment Time (Sim) -> Collect CPF
    { source: nodeIds.tempoEmpresa, target: nodeIds.collectCPF, sourceHandle: buttonIds.sim },
    // Collect CPF -> Thank You
    { source: nodeIds.collectCPF, target: nodeIds.thankYou },
    // Thank You -> Transfer
    { source: nodeIds.thankYou, target: nodeIds.transfer }
  ];

  return {
    name: "Empréstimo CLT - Qualificação",
    description: "Fluxo de qualificação para empréstimo consignado para trabalhadores CLT. Coleta nome, verifica tempo de empresa (mínimo 3 meses), coleta CPF e transfere para atendente.",
    nodes,
    edges
  };
}

// List of available sample flows
export const sampleFlows = [
  {
    id: "emprestimo_clt",
    name: "Empréstimo CLT",
    description: "Qualificação de leads para crédito consignado",
    generate: generateEmprestimoCLTFlow
  }
];
