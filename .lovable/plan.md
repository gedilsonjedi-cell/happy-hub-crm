## Flow de Disparo — Plano de Implementação

Criar um novo tipo de automação chamado **"Flow de Disparo"**, que combina template inicial + respostas automatizadas por botão, podendo ser selecionado no momento do disparo de campanhas.

### 1. Conceito

Diferente do **Chatbot IA** (conversa livre) e do **Fluxo Visual** (acionado por mensagem do cliente), o **Flow de Disparo**:
- **Inicia com um template Meta** (com botões) — enviado pela campanha
- Quando o destinatário clica em um botão, executa a ramificação correspondente do flow (mensagem, mídia, arquivar, transferir, etc.)
- Fica vinculado à campanha durante o disparo

### 2. Banco de dados

Reutilizar a infra existente de `flow_bots` / `flow_nodes` / `flow_edges` adicionando:

- `flow_bots.flow_type` → `'reactive' | 'dispatch'` (default: `'reactive'`)
- `flow_bots.template_id` → uuid (template Meta inicial, obrigatório se `flow_type='dispatch'`)
- `campaigns.flow_bot_id` → uuid (flow de disparo vinculado à campanha, opcional)
- Novo node type permitido: `template_start` (representa o template Meta, com 1 handle de saída por botão)

### 3. UI — Página Chatbots

Adicionar terceira aba:
```
[ Chatbots com IA ]  [ Fluxos Visuais ]  [ Flow de Disparo ]
```

- Lista própria filtrada por `flow_type='dispatch'`
- Botão "Novo Flow de Disparo" abre o editor visual já existente, mas:
  - Node inicial obrigatório é um **TemplateStartNode** (seleciona template Meta com botões)
  - Para cada botão do template, gera automaticamente um handle de saída
  - Demais nodes (mensagem, mídia, ação) ficam disponíveis normalmente

### 4. UI — Campanhas

Na criação/edição de campanha (`Disparos.tsx`), adicionar seletor:
- **Tipo de envio**: `Template direto` (atual) ou `Flow de Disparo` (novo)
- Se `Flow de Disparo` → seletor dos flows do tipo `dispatch` disponíveis
- O template do flow substitui o `unified_template_id` no envio
- Validação: flow precisa ter template definido e nodes conectados

### 5. Backend — Edge Functions

- **`campaign-dispatch`**: quando `campaigns.flow_bot_id` está setado, usa o template do flow em vez de `unified_template_id`. Marca `campaign_recipients.flow_bot_id` para rastreio.
- **`meta-webhook`**: quando recebe um `button_reply` de um destinatário de campanha com flow vinculado, dispara o motor de execução do flow (semelhante ao já existente para fluxos reativos), partindo do node correspondente ao botão clicado.
- Reutilizar runtime de execução de nodes já presente em fluxos visuais (mensagem, mídia, transfer, archive).

### 6. Detalhes técnicos

- TemplateStartNode renderiza preview do template + lista de botões com handles
- Quando o template é trocado, edges órfãs são removidas
- `flow_sessions` ganha campo `campaign_id` para diferenciar origem
- Mantém todos os RLS por organização já existentes

### 7. Escopo desta entrega

- Migration (schema)
- Aba "Flow de Disparo" + editor com TemplateStartNode
- Seletor no formulário de campanha
- Ajuste no `campaign-dispatch` para usar template do flow
- Ajuste no `meta-webhook` para reagir aos cliques de botão e executar o flow

Não inclui: agendamento de mensagens dentro do flow, condicionais avançadas, A/B testing — podem vir depois.
