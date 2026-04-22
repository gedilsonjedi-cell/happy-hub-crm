---
name: Regressão RLS Visibilidade Atendentes
description: Função SQL run_rls_visibility_check + painel UI em SuperAdmin > Segurança para validar acesso de atendentes a canais e conversas
type: feature
---

A função `public.run_rls_visibility_check(_user_id uuid)` valida em uma única chamada se um usuário (geralmente atendente) consegue:
1. Listar canais da própria organização (sem segredos)
2. Ver conversas pendentes (`status='pending'`) — incluindo assignments com e sem `channel_id`
3. Ver conversas em andamento (`status='active'`)
4. Acessar `conversation_stats` da organização (preview e unread_count)
5. **Não** ter `SELECT` em colunas sensíveis de `channels` (`access_token`, `meta_app_secret`, `api_token`, `webhook_verify_token`)
6. Manter `SELECT` em colunas básicas (`name`, `phone`)

Apenas super admin ou admin/supervisor da mesma organização pode invocá-la (validação interna via `auth.uid()`).

A UI fica em **SuperAdmin > Segurança** (`src/components/admin/RlsRegressionPanel.tsx`): busca usuário por email, mostra papel/organização, e roda o teste exibindo cada verificação individual com badge de OK/Falha.

Privilégios reforçados na mesma migração:
- `REVOKE SELECT (access_token, meta_app_secret, api_token, webhook_verify_token) ON public.channels FROM authenticated, anon`
- Tokens permanecem acessíveis apenas via `public.channel_secrets` (com policies próprias) e service role

Índices de performance criados:
- `idx_conv_assignments_lead_status` — acelera RLS por lead quando channel_id é nulo
- `idx_conv_assignments_assigned_status` — acelera filtros por atendente atribuído
