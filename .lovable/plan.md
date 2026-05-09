## Cutover Fase 2A — Assignments + Stats para Banco Externo

Você escolheu **cutover agressivo + tudo**. Antes de começar, alinho aqui o que vai ser feito, porque mexe em ~30 arquivos críticos do atendimento e dispara em produção.

### Estratégia

Usar o `external-assignments-write` (já existe) como **único ponto de escrita**. Frontend lê direto do externo via JWT (já configurado). Edge functions que processam webhooks/envios passam a chamar o externo pelo helper `getExternalDb()`.

### Etapas

**1. Helpers compartilhados** (1 arquivo)
- `_shared/externalDb.ts`: adicionar funções utilitárias (`extUpsertAssignment`, `extUpdateAssignment`, `extUpsertStats`, `extResolveAssignment`) para reduzir duplicação nos webhooks.

**2. Webhooks de provedores** (4 funções)
- `meta-webhook`, `zapi-webhook`, `gupshup-webhook`, `infobip-webhook`
- Substituir `supabase.from('conversation_assignments').upsert/update` por `extUpsertAssignment` no externo.
- Trigger automática de stats vai para chamada explícita do RPC `upsert_conversation_stats_external`.

**3. Send functions** (4 funções)
- `meta-send`, `zapi-send`, `gupshup-send`, `infobip-send`
- Mesma troca: criação/update de assignment vai pro externo.

**4. Chatbot e dispatch** (4 funções)
- `whatsapp-chatbot`, `zapi-chatbot`, `campaign-dispatch`, `send-campaign-batch`
- Idem.

**5. Hooks de UI** (8 arquivos)
- `useConversations`, `useChatRealtime`, `useUnreadMessagesCount`, `useConversationMetrics`, `useAgentPerformance`, `useWhatsAppNotifications`
- Componentes: `AssignAttendantDialog`, `BulkTransferDialog`, `ManualSendDialog`
- Páginas: `AtendimentoV2`, `Index`
- Reads via JWT externo direto. Mutations via `external-assignments-write` (invoke).

**6. Sync trigger interno**
- Desabilitar trigger `auto_upsert_conversation_stats` no interno (vai virar dead code).
- Manter tabelas locais por 7 dias como backup (não dropar ainda).

**7. Realtime**
- Frontend assina canal do externo (já funciona pra messages). Ampliar pra `conversation_assignments` e `conversation_stats`.
- Remover subscriptions internas dessas duas tabelas.

### Riscos e mitigação

- **Latência extra**: cada webhook agora faz ida ao externo. Mitigado pelo `runInBackground`.
- **RLS no externo**: já configurado por organization_id via JWT. Edge functions usam service_role (bypass).
- **Ordem do deploy**: Frontend → webhooks → sends → chatbot. Se algo quebrar, posso reverter por arquivo.
- **Reset unread**: Frontend chama `external-assignments-write` action `reset_unread` ao abrir chat. Sem essa chamada, badge fica preso.

### Detalhes técnicos

- `getExternalDb()` usa service_role do externo (já em secrets).
- `external-assignments-write` valida JWT do interno e resolve `organization_id` do profile.
- RPCs já criados no externo: `archive_conversation_ext`, `restore_conversation_ext`, `reset_conversation_unread_ext`, `upsert_conversation_stats_external`, `get_conversations_summary_ext`.
- Lead lookup: continua no interno (leads não migram nessa fase).
- Realtime: REPLICA IDENTITY FULL já habilitado nas duas tabelas externas.

### O que NÃO vai mudar

- Tabela `leads` continua interna.
- Tabela `channels` continua interna.
- Reports/relatórios continuam puxando do interno (próxima fase).
- `conversation_metrics` e `conversation_notes` ficam no interno.

### Pós-cutover

Em 7 dias, se estiver estável:
- Drop das tabelas locais `conversation_assignments` e `conversation_stats`.
- Atualizar `mem://arquitetura/migracao-banco-dados-externo-ssot` removendo "local DB handles stats".
