

# Plano de Otimização — Paginação, Virtualização e Limpeza

## Fase 1 — Migration SQL (Banco de Dados)

### 1.1 RPC `get_conversations_summary_paginated`
Nova função PostgreSQL que substitui o carregamento completo:
- Aceita `p_channel_ids uuid[]`, `p_organization_id uuid`, `p_limit int DEFAULT 100`, `p_offset int DEFAULT 0`
- Junta `conversation_assignments` + `conversation_stats` + `leads` + `profiles` em uma única query
- Ordena por `last_message_at DESC NULLS LAST`
- Retorna apenas as 100 conversas mais recentes por padrão

### 1.2 RPC `search_conversations_global`
Função dedicada para busca na sidebar que pesquisa em TODOS os assignments (não apenas os 100 carregados):
- Aceita `p_search_term text` e filtra por `conversation_phone ILIKE` ou nome do lead
- Mesma estrutura de retorno da RPC paginada
- Garante que o usuário encontre qualquer conversa mesmo fora das 100 primeiras

### 1.3 RPCs de limpeza
- `cleanup_archived_assignments_batch`: deleta assignments `archived` com `updated_at < now() - 30 days` em batches
- `cleanup_local_messages_batch`: deleta `whatsapp_messages` com `created_at < now() - 7 days` (SSoT é o banco externo)

### 1.4 Realtime
- Confirmar que `conversation_stats` está no `supabase_realtime` publication

---

## Fase 2 — VirtualizedConversationList (react-window)

- Instalar `react-window` + `@types/react-window`
- Reescrever `VirtualizedConversationList.tsx` com `FixedSizeList` (item height ~80px)
- Renderizar apenas ~15 items visíveis no DOM (vs 4.481 nodes atuais)
- Callback `onItemsRendered` para detectar scroll ao final e disparar `onLoadMore`

---

## Fase 3 — AtendimentoV2: Paginação + Busca + Sort

### 3.1 Carregamento paginado
- Substituir fetch completo por chamada à RPC `get_conversations_summary_paginated` com limit=100
- "Carregar mais" incrementa offset em 100, appendando ao state existente

### 3.2 Busca global
- Campo de busca com debounce de 400ms chama `search_conversations_global`
- Resultados substituem temporariamente a lista paginada
- Limpar busca restaura a lista paginada

### 3.3 Insertion sort O(1)
- No handler de Realtime, remover conversa da posição atual e inserir no index 0
- Eliminar `Array.sort()` completo sobre 4.481 items

### 3.4 `startTransition`
- Envolver `setAllConversations` dos handlers Realtime em `startTransition`
- Priorizar interações do usuário (digitação, scroll) sobre atualizações de lista

---

## Fase 4 — cleanup-old-data Edge Function

- Adicionar chamadas às novas RPCs de limpeza (archived assignments > 30 dias, whatsapp_messages locais > 7 dias)
- Executar limpeza imediata para a Henrimath após deploy

---

## Arquivos afetados
1. **Nova migration SQL** — 4 RPCs (paginada, busca, 2 cleanup)
2. **`src/components/whatsapp/VirtualizedConversationList.tsx`** — react-window
3. **`src/pages/AtendimentoV2.tsx`** — paginação, busca global, insertion sort, startTransition
4. **`supabase/functions/cleanup-old-data/index.ts`** — novas rotinas
5. **`package.json`** — react-window

## Impacto esperado
- DOM nodes na sidebar: 4.481 → 15 (redução de 99.7%)
- Queries no carregamento: 8-15 → 1 RPC
- Sort por mensagem: O(n log n) → O(1)
- Dados transientes eliminados: ~5K assignments + ~25K mensagens locais

