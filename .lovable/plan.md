## Terceiro botão "Template Flow" em Campanhas

Adicionar um terceiro modo de seleção em **Templates de Mensagem**, ao lado de "Mesmo template" e "Template por canal", que opera com **Flows de Disparo** (`flow_bots.flow_type = 'dispatch'`) já criados em Chatbots.

### Comportamento (espelho do que já existe)

- **Mesmo flow (modo unificado)**: lista somente flows cujo `template_id` está aprovado em **todos** os canais selecionados.
- **Flow por canal**: para cada canal selecionado, lista os flows cujo `template_id` está aprovado **naquele canal** específico.

A escolha entre "mesmo flow" vs "flow por canal" segue exatamente o mesmo padrão UI dos templates (dois botões internos quando o modo "Template Flow" está ativo), e mostra estado vazio quando nenhum flow se qualifica.

### Mudanças

**Banco**
- Adicionar coluna `campaign_channels.flow_bot_id uuid` (nullable) para guardar o flow escolhido por canal.
- (`campaigns.flow_bot_id` já existe — usado quando o modo é "mesmo flow".)

**Frontend (`src/pages/Disparos.tsx`)**
- Substituir o boolean `useUnifiedTemplate` por um estado `templateMode: 'unified' | 'per_channel' | 'flow_unified' | 'flow_per_channel'` (3 botões: Mesmo template / Template por canal / Template Flow; ao clicar em Template Flow aparece um sub-toggle Mesmo flow / Por canal).
- Carregar `flow_bots` ativos com `flow_type='dispatch'` e `template_id` da org.
- Helpers:
  - `getUnifiedFlows()` → flows cujo `template_id ∈ getUnifiedTemplates().map(t => t.id)`.
  - `getFlowsForChannel(chId)` → flows cujo `template_id ∈ getTemplatesForChannel(chId).map(t => t.id)`.
- Estado `selectedFlowId` (unified) e `channelFlows: Record<channelId, flowBotId>` (per channel).
- Validação no submit: para modo flow, exigir flow selecionado (unified) ou um flow por canal.
- Persistência:
  - `campaigns.flow_bot_id = selectedFlowId` (quando flow_unified) ou `null`.
  - `campaigns.unified_template_id = flow.template_id` (preserva pipeline atual de envio).
  - `campaign_channels.template_id = flow.template_id` e `campaign_channels.flow_bot_id = flow.id` para cada canal (no modo flow_per_channel).
  - `campaign_recipients.flow_bot_id = flow.id` (já existe coluna; preencher no momento de criar os recipients).
- Preview de mensagem reutiliza o mesmo render dos templates (já que cada flow tem um template associado).

### Fora de escopo neste passo
- Engine que dispara o próximo nó do flow após clique do botão (já discutido em conversa anterior — fica para depois).
- Edição do flow a partir da tela de campanha.
- Criação de novos flows aqui (continua em /chatbot → aba Flow de Disparo).

### Aprovação
Confirme para eu rodar a migration de `campaign_channels.flow_bot_id` e implementar a UI.