# Fase 2 — Externo como Master Único + Interno como Cache Volátil

## Princípio arquitetural

```
┌─────────────────────────────────────────────────────────┐
│  EXTERNO (Master / SSoT / Fonte da Verdade)             │
│  - leads                                                │
│  - whatsapp_messages          ← já está                 │
│  - whatsapp_contacts          ← já está                 │
│  - conversation_assignments                             │
│  - conversation_stats                                   │
│  - campaign_recipients                                  │
│  - lead_activity_log                                    │
│  - whatsapp-media (storage)   ← já está                 │
│                                                         │
│  Toda escrita de webhook/edge/UI vai DIRETO aqui.       │
│  Toda consulta pesada (filtros, relatórios) também.     │
└─────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────┐
│  INTERNO (Cache volátil + Realtime + Auth + Config)     │
│  - auth.users, profiles, user_roles, sectors            │
│  - organizations, balance, subscription, store          │
│  - channels (com tokens criptografados)                 │
│  - cache de conversation_stats (últimas 48h só)         │
│  - cache de assignments ativos (últimas 48h só)         │
│  - Realtime publication (só reflete eventos recentes)   │
│                                                         │
│  Auto-purge diário: tudo > 48h é apagado.               │
└─────────────────────────────────────────────────────────┘
```

## Fase 2A — Mover `conversation_stats` + `conversation_assignments`

**Externo:** criar schema espelho com RLS por `organization_id` (claim do JWT já existente).

**Edge functions novas:**
- `external-assignments-write` — todo CRUD de assignment (criar, atualizar status, transferir, arquivar) escreve direto no externo
- `external-stats-upsert` — substitui o trigger `upsert_conversation_stats_manual` no externo

**Edge functions modificadas:**
- `meta-webhook` — após persistir mensagem, chama `external-stats-upsert` direto no externo (sem tocar interno)
- Todos os pontos que hoje fazem `INSERT INTO conversation_assignments` passam a chamar `external-assignments-write`

**RPCs reescritas como funções no externo:**
- `get_conversations_summary` → no externo
- `get_conversations_summary_paginated` → no externo
- `get_unread_conversations_full` → no externo
- `search_conversations_global` → no externo
- `archive_conversation`, `restore_conversation`, `reset_conversation_unread` → no externo

**Frontend (`useConversations`, `useChatRealtime`):**
- Lê via `getExternalClient()` (já existe em `src/lib/externalSupabaseClient.ts`)
- Realtime: subscribe direto no externo (já viável já que o externo é Supabase também)
- **Interno só recebe um "ping" leve** com `{assignment_id, last_message_at}` pra alimentar o canal Realtime do interno como fallback de notificação cross-device

**Auto-purge interno:**
- Cron diário `cleanup-internal-cache` deleta `conversation_stats` e `conversation_assignments` com `updated_at < now() - 48h`

## Fase 2B — Mover `leads` + `lead_activity_log` + `lead_tags`

**Externo:** criar schema espelho. `leads.organization_id` para RLS.

**Edge functions novas:**
- `external-leads-crud` — create/update/delete/list/import lead
- `external-leads-search` — busca paginada com filtros (substitui queries pesadas em Leads.tsx)
- `external-lead-activity-log` — append no log

**Frontend:**
- `Leads.tsx`, `Pipeline.tsx`, `CarteiraClientes.tsx`, `ContatoDetalhes.tsx`, `useLeadActivityLog`, `ImportLeadsDialog`, `AddLeadDialog`, `EditLeadDialog`, `DeleteLeadDialog`, `AssignTagsDialog` → todos passam por `getExternalClient()` ou edge function.

**Lead.id permanece como UUID para compatibilidade.** `conversation_assignments.lead_id` no externo aponta pra lead externo.

**Sem mais escrita de leads no interno.** Cleanup remove leads antigos do interno em batch.

## Fase 2C — Mover `campaign_recipients` + processamento de campanha

**Externo:** schema de `campaign_recipients`. `campaigns` permanece no interno (tem FK pra `organizations`, `sectors`, `channels`, `pricing`).

**Modelo híbrido:**
- `campaigns` (config + counters) → interno
- `campaign_recipients` (volume alto, escritas frequentes) → externo
- Trigger `sync_campaign_counts` reescrito como **edge function chamada pelo externo** ao mudar status de recipient → atualiza counters no interno via RPC

**Edge functions modificadas:**
- `process-campaign-batch` (worker) — lê batch de recipients no externo via `FOR UPDATE SKIP LOCKED`, despacha mensagens, atualiza no externo
- `meta-send` — atualiza `campaign_recipients.status` no externo
- `meta-webhook` (status callbacks) — atualiza status no externo

**Frontend:**
- `CampaignDetailsDialog`, `CampaignReportDialog`, `RecycleFailuresDialog` → leitura de recipients no externo
- `RecipientSelection` → escreve diretamente no externo na criação

## Fase 2D — Limpeza, hardening e migração de dados antigos

1. **Edge function `migrate-leads-to-external`** — copia leads existentes em batch (similar ao `migrate-messages-to-external`)
2. **Edge function `migrate-assignments-to-external`** — idem
3. **Edge function `migrate-recipients-to-external`** — idem
4. **Cron de auto-purge interno** (`cleanup-internal-cache`):
   - `conversation_stats` > 48h → DELETE
   - `conversation_assignments` archived > 48h → DELETE
   - `whatsapp_messages` > 7 dias → DELETE (já existe parcialmente)
   - `leads` migrados confirmados → DELETE em batch
   - `campaign_recipients` migrados confirmados → DELETE em batch
   - `lead_activity_log` > 30 dias → DELETE
5. **Remover** `delete_organization_cascade` interno e refazer com cascata cross-DB
6. **Remover** triggers obsoletos (`sync_campaign_counts` local, etc.)

## Detalhes técnicos críticos

### RLS no externo (já existe pra messages/contacts)
Mesmo padrão pra todas as novas tabelas:
```sql
CREATE POLICY "org_isolation" ON <tabela>
USING (organization_id = (auth.jwt()->>'organization_id')::uuid);
```

### JOINs cross-DB resolvidos por ID-based fetching
Onde antes havia JOIN entre `conversation_assignments` (interno) ↔ `profiles` (interno) ↔ `leads` (interno):
- `assigned_to_name` → frontend busca uma vez `profiles` e mantém Map em memória (já faz)
- `lead_name` → vem do próprio externo (lead também migrou)
- Single-DB JOIN volta a ser viável

### Realtime
- Subscription direto no externo (Supabase suporta Realtime). Já temos `getExternalClient()`.
- Interno mantém Realtime só para `channels`, `profiles`, `notifications` operacionais.

### Tokens de canal
Permanecem no interno em `channel_secrets` (não migram). Edge functions que precisam enviar mensagem buscam token interno e enviam pra Meta API.

## Riscos honestos

1. **Realtime do externo precisa estar habilitado nas tabelas novas.** Sem isso, UI fica estática.
2. **Latência:** toda mutation agora é uma round-trip extra (UI → edge interna → DB externo). Vai ficar 100-300ms mais lento por ação.
3. **Custo de edge functions sobe** (mais invocações). Pode ser maior que economia de DB.
4. **Sem rollback fácil.** Depois que `leads` migra, voltar atrás exige nova migration reversa.
5. **Janela de inconsistência durante cutover de cada sub-fase.** Vou usar dual-write temporário (escreve nos dois) seguido de cutover de leitura.

## Cronograma estimado

| Sub-fase | Mensagens necessárias | Risco |
|----------|----------------------|-------|
| 2A (assignments + stats) | 4-5 | Alto (Realtime crítico) |
| 2B (leads + activity log) | 3-4 | Médio (volume alto, queries diversas) |
| 2C (campaign_recipients) | 3-4 | Alto (concorrência de disparo) |
| 2D (purge + migração + cleanup) | 2-3 | Baixo |
| **Total** | **12-16 mensagens** | — |

## Próximo passo concreto (esta mensagem)

Começo pela **Fase 2A — passo 1 de 5**:

1. Migration no **externo** criando `conversation_assignments` e `conversation_stats` com RLS
2. Edge function `external-assignments-rpc` (substitui as RPCs internas)
3. Habilitar Realtime no externo pra essas tabelas

Não toco no frontend ainda — só preparo o destino. Depois faço dual-write, depois cutover de leitura, depois desligo escrita interna.

## Confirme antes de eu começar

- **OK começar pela 2A agora?** (sim/não)
- **Aceita latência +100-300ms por ação em troca de redução de custo do interno?** (sim/não)
- **Pode haver instabilidade momentânea durante cutovers de cada sub-fase?** (sim/não)
