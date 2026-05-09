## Contexto

Hoje:
- **Mensagens** (`whatsapp_messages`) e **contatos** (`whatsapp_contacts`): já 100% externo ✓
- **Edge functions** (12): já reescrevem assignments/stats só no externo ✓
- **Frontend**: ainda escreve e lê `conversation_assignments`/`conversation_stats` do **interno** em ~20 pontos. Mirror trigger interno→externo mantém o externo atualizado para esses writes do front.

Objetivo: cortar o último cordão umbilical — frontend passa a ler/escrever direto no externo, e os mirror triggers caem.

## Escopo dos dados

- `conversation_assignments` e `conversation_stats` já existem no externo (via mirror).
- `leads`, `profiles`, `channels`, `campaigns` etc. **continuam internos** (não são mensagens nem logs de campanha).
- A RPC `get_conversations_summary_paginated` faz JOIN com `leads` e `profiles` — não dá pra portar 1:1 pro externo. Solução: nova RPC externa que retorna só assignments+stats; frontend resolve nomes/tags via cache interno.

## Plano

### 1. Externo: criar RPC `get_conversations_summary_paginated_ext`
- Query equivalente, **sem JOINs com leads/profiles** (retorna só `lead_id` e `assigned_to`).
- RLS via `request.jwt.claims.organization_id` (consistente com whatsapp_messages).
- Manter assinatura: `p_channel_ids uuid[], p_organization_id uuid, p_limit, p_offset`.

### 2. Frontend: read-side
Pontos a migrar para `externalSupabase`:
- `src/hooks/useConversations.tsx` (linhas 73, 143, 204, 226)
- `src/pages/AtendimentoV2.tsx` (linhas 998, 1118, 1185, 1366, 1568, 1582, 2231, 2323, 2630, 2700, 2975, 3042, 3082, 3137, 3393, 3503)

Para cada read:
- `supabase.from("conversation_assignments")` → `externalSupabase.from("conversation_assignments")`
- RPC `get_conversations_summary_paginated` → `get_conversations_summary_paginated_ext` no externalSupabase
- Após receber rows, fazer um `supabase.from("leads").select("id,name,tags").in("id", leadIds)` e `supabase.from("profiles").select("user_id,display_name,email").in("user_id", assignedIds)` no **interno** e mesclar (usar Map em memória, batch único por página).

### 3. Frontend: write-side
Mesmos pontos com `.update()`/`.insert()`/`.delete()` em `conversation_assignments`. Mover para `externalSupabase` direto (RLS por org claim já cobre). Onde houver insert sem org_id, garantir que seja preenchido.

### 4. Validação (manual ~5 min)
- Abrir AtendimentoV2, conferir sidebar carrega
- Mandar mensagem nova de fora → aparece em real-time
- Transferir conversa, arquivar, mudar status — tudo persiste
- Conferir contadores de não-lidos zeram ao abrir

### 5. Cleanup
- `DROP TRIGGER trg_mirror_ca ON conversation_assignments;`
- `DROP TRIGGER trg_mirror_cs ON conversation_stats;`
- (Manter as tabelas internas por enquanto — drop só depois de 24-48h sem incidente)
- Atualizar `mem://arquitetura/mirror-trigger-assignments-stats` marcando como DEPRECATED

## Risco

- Latência: cada página da sidebar agora faz 1 query externa + 2 queries internas (leads + profiles). Batch único por página, então deve ficar ≤200ms total.
- Regressões de status/atribuição: temos cobertura de Realtime no externo, então qualquer write inconsistente aparece imediatamente.
- Mirror inverso: NÃO vamos inverter. Se algo quebrar, basta reativar mirror antigo.

## Detalhes técnicos

- A nova RPC externa será criada via SQL direto no externo (não via migration interna).
- Usar `externalSupabase` que já tem JWT customizado com claim `organization_id` válida.
- Preservar `is_bot_handling`, `campaign_chatbot_id`, `bot_paused_until` na assinatura da nova RPC.
- A `get_conversations_summary` (não paginada) usada em `AttendanceReportPanel` é só de relatório — pode permanecer no interno por ora (lê dados antigos via mirror inverso? não — ela ficaria desatualizada). **Decisão**: portar também para externo na mesma rodada; relatório usa external + join interno.
