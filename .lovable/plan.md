
# Plano de Otimização de Performance — Sistema de Atendimento

## Diagnóstico: O Sistema Hoje

Após análise completa do código, banco de dados e arquitetura, o sistema tem condições de suportar 1.000+ usuários simultâneos — mas existem **7 gargalos críticos** que precisam ser eliminados primeiro.

### Dados do Banco (situação real):
- `whatsapp_messages`: **267.921 registros, 276 MB total**
- `conversation_assignments`: **20.526 registros**
- `leads`: **61.651 registros**
- `campaign_recipients`: **9.796 registros**

---

## Gargalo 1 — CRÍTICO: Índices ausentes no banco de dados

### Problema:
A query mais executada do sistema (carregamento do chat) faz:
```sql
SELECT * FROM conversation_assignments 
WHERE channel_id IN (...) AND status != 'archived' 
ORDER BY updated_at DESC
```
Não existe nenhum índice composto em `conversation_assignments` para isso. O banco faz **full table scan** em 20.526 linhas a cada refresh. Com 1.000 usuários simultâneos, isso paralisa o banco.

Da mesma forma, a `whatsapp_messages` (267.921 linhas) é consultada por `channel_id + direction + sender_phone` sem índice composto. Cada abertura de conversa faz **dois** full scans.

A tabela `leads` (61.651 linhas) não tem índice em `phone`, que é o campo mais buscado do sistema (matching por telefone).

### Solução:
Criar **5 índices compostos** via migration:

```sql
-- 1. conversation_assignments: query principal do chat
CREATE INDEX idx_conv_assignments_channel_status_updated 
ON conversation_assignments(channel_id, status, updated_at DESC)
WHERE status != 'archived';

-- 2. conversation_assignments: busca por lead_id
CREATE INDEX idx_conv_assignments_lead_id 
ON conversation_assignments(lead_id) 
WHERE lead_id IS NOT NULL;

-- 3. conversation_assignments: sync periódico (channel + status + updated)
CREATE INDEX idx_conv_assignments_channel_updated 
ON conversation_assignments(channel_id, updated_at DESC);

-- 4. whatsapp_messages: fetch de mensagens de conversa
CREATE INDEX idx_whatsapp_messages_conv 
ON whatsapp_messages(channel_id, sender_phone, created_at DESC);

-- 5. leads: busca por telefone (mais crítico do sistema)
CREATE INDEX idx_leads_phone 
ON leads(phone);
```

**Impacto estimado**: Redução de 80–95% no tempo das queries principais.

---

## Gargalo 2 — CRÍTICO: N+1 queries no carregamento de conversas

### Problema:
O `AtendimentoV2.tsx` (4.324 linhas!) faz, ao abrir:
1. Busca paginada de **todos os assignments** (N páginas)
2. Busca paginada de **todos os leads** (N páginas)  
3. Busca paginada de **todos os profiles** (N páginas)
4. **Uma query por canal** para as últimas 1.500 mensagens
5. Para cada conversa sem lastMessage: **2 queries adicionais** (inbound + outbound)

Se uma organização tem 5 canais e 500 conversas sem mensagem recente, isso gera **1.000 queries adicionais** no carregamento inicial. Com 100 usuários simultâneos = 100.000 queries.

### Solução:
Criar uma **Stored Function** no banco que retorna tudo em uma única chamada:

```sql
CREATE OR REPLACE FUNCTION get_conversations_summary(
  p_channel_ids uuid[],
  p_organization_id uuid
)
RETURNS TABLE (
  assignment_id uuid,
  conversation_phone text,
  channel_id uuid,
  assigned_to uuid,
  status text,
  sector_id uuid,
  lead_id uuid,
  updated_at timestamptz,
  last_message text,
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  unread_count int,
  sender_name text,
  lead_name text,
  lead_tags text[],
  assigned_to_name text
) AS $$ ... $$ LANGUAGE plpgsql STABLE;
```

Isso substitui **8–12 round-trips** por **1 única chamada RPC**.

---

## Gargalo 3 — ALTO: Duplicação de subscriptions Realtime

### Problema:
Cada usuário logado cria:
- `useWhatsAppNotifications`: 1 subscription em `whatsapp_messages` (global, sem filtro de org!)
- `useUnreadMessagesCount`: 2 subscriptions (`conversation_assignments` + `whatsapp_messages`)  
- `AtendimentoV2`: 1 subscription por canal (se 9 canais = 9 subscriptions)
- Total: **12 subscriptions simultâneas por usuário**

Com 1.000 usuários = **12.000 subscriptions ativas no Realtime**. O Supabase Realtime tem limites de conexões e isso causa latência e quedas.

Além disso, `useWhatsAppNotifications` escuta **TODOS** os inserts em `whatsapp_messages` sem filtrar por `organization_id`, recebendo dados de outras organizações (ineficiência e risco de segurança).

### Solução:
1. **Consolidar** as 3 fontes de subscription em um único hook `useChatRealtime` que gerencia tudo
2. **Filtrar** todas as subscriptions por `channel_id` (já suportado pelo Realtime)
3. **Remover** a subscription global em `useWhatsAppNotifications` (redundante com AtendimentoV2)
4. **Debounce** o `useUnreadMessagesCount` para 2s já existe, mas a subscription de `whatsapp_messages` deve ser eliminada (count pode vir do assignment)

---

## Gargalo 4 — ALTO: `AtendimentoV2.tsx` com 4.324 linhas é ingerenciável

### Problema:
Um único arquivo com **4.324 linhas** causa:
- Re-renders desnecessários de componentes que não deveriam re-renderizar
- Impossibilidade de usar `React.memo` de forma eficaz
- Dificuldade de manutenção e introdução de bugs

### Solução:
Extrair a lógica de dados para hooks isolados:
- `useConversations` (já existe em `hooks/useConversations.tsx` mas o AtendimentoV2 ainda usa sua própria versão duplicada!)
- `useMessages(conversation)` — mensagens da conversa selecionada
- `useChatRealtime(channels)` — subscription consolidada
- `ConversationList` — componente separado com `React.memo`
- `MessagePanel` — componente separado com `React.memo`

---

## Gargalo 5 — MÉDIO: Sync periódico a cada 30s re-lê 500 assignments

### Problema:
```typescript
// a cada 30 segundos para cada usuário logado:
const { data: assignments } = await supabase
  .from("conversation_assignments")
  .select(...)
  .limit(500);
```

Com 100 usuários no chat = **100 queries por 30 segundos = 200 queries/minuto** só para sync. Isso é desnecessário pois o Realtime já deve cobrir essa função.

### Solução:
Substituir o polling de 30s por subscription Realtime filtrada por `channel_id` na tabela `conversation_assignments`. Quando uma atribuição muda, o Realtime notifica imediatamente, e **apenas** a linha que mudou chega ao cliente.

```typescript
supabase
  .channel('assignments-sync')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'conversation_assignments',
    filter: `channel_id=in.(${channelIds.join(',')})`
  }, handleAssignmentChange)
  .subscribe();
```

---

## Gargalo 6 — MÉDIO: Background fetch de mensagens ausentes faz queries individuais

### Problema:
Para conversas sem preview de mensagem, o sistema busca **2 queries por conversa** (inbound + outbound) em batches de 50. Se uma org tem 500 conversas antigas sem preview = **1.000 queries** no carregamento.

### Solução:
Incluir o `last_message` na função RPC `get_conversations_summary` (Gargalo 2), eliminando completamente esse batch fetch de background.

---

## Gargalo 7 — MÉDIO: `meta-webhook` faz até 10+ queries sequenciais por mensagem

### Problema:
Para cada mensagem recebida, o webhook faz sequencialmente:
1. `findOrCreateLead` (3 queries: exact match + suffix match + create)
2. `handleConversationAssignment` (até 4 fallbacks = 4 queries)
3. `findSectorFromCampaign` (2-6 queries em loop)
4. `getNextAvailableAttendant` (2 queries)
5. `isWithinBusinessHours` (1 query)
6. `isHoliday` (2 queries)
7. `shouldSendWelcomeMessage` (2 queries)

**Total: 16–21 queries sequenciais por mensagem recebida.** Em um disparo de campanha com 1.000 respostas simultâneas, isso é 21.000 queries sequenciais no webhook.

### Solução:
1. Criar uma função PostgreSQL `process_inbound_message` que executa toda a lógica em uma transação SQL
2. Cachear configurações de horário e feriado em memória do edge function (30s de cache)
3. Paralelizar as queries independentes com `Promise.all`

---

## Plano de Implementação (por prioridade de impacto)

### Fase 1 — Banco de Dados (maior impacto, menor risco)
- Criar os 5 índices compostos via migration
- Criar a função RPC `get_conversations_summary`
- Habilitar Realtime na tabela `conversation_assignments`

### Fase 2 — Frontend: Chat
- Consolidar subscriptions Realtime em um único hook
- Substituir o sync polling de 30s por Realtime
- Eliminar o background fetch de mensagens (usar RPC)
- Extrair `useMessages` e `useChatRealtime` do AtendimentoV2

### Fase 3 — Backend: Webhook
- Paralelizar queries independentes no `meta-webhook`
- Adicionar cache de configurações (business hours, welcome msg)
- Criar função PostgreSQL para processamento atômico de conversas

### Fase 4 — Frontend: Componentes
- Separar `ConversationList` e `MessagePanel` em componentes isolados com `React.memo`
- Adicionar `useDeferredValue` para a busca de conversas
- Aplicar virtualização na lista de conversas (react-virtual) para listas muito grandes

---

## Capacidade estimada após otimizações

| Cenário | Antes | Depois |
|---|---|---|
| Queries por carregamento de chat | 8–15 | 1 (RPC) |
| Subscriptions Realtime por usuário | 12 | 3 |
| Queries/min com 100 usuários (sync) | 200 | 0 (Realtime) |
| Tempo de carregamento inicial | 3–8s | < 1s |
| Capacidade estimada simultânea | ~50–100 | 1.000+ |

---

## Técnico: Detalhes de implementação

### Arquivos que serão alterados:
1. **Nova migration SQL** — 5 índices + 1 função RPC
2. **`supabase/functions/meta-webhook/index.ts`** — paralelizar queries, cache de config
3. **`src/hooks/useChatRealtime.tsx`** — novo hook consolidando subscriptions
4. **`src/hooks/useConversations.tsx`** — substituir fetch por chamada RPC
5. **`src/pages/AtendimentoV2.tsx`** — extrair hooks, remover sync polling, usar novo hook Realtime
6. **`src/hooks/useUnreadMessagesCount.tsx`** — remover subscription redundante de `whatsapp_messages`

A ordem é importante: banco primeiro (sem risco de regressão), depois frontend.
