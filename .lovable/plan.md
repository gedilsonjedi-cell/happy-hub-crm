
# Plano: Otimização de Limpeza e Redução de Custos Cloud

## Resumo Executivo
Ajustar a função de limpeza para apagar **apenas mensagens de conversas arquivadas** e implementar outras otimizações para reduzir o consumo do Cloud.

## Diagnóstico Atual

| Tabela | Tamanho | Registros antigos (>7 dias) |
|--------|---------|----------------------------|
| whatsapp_messages | **48 MB** | 28.682 mensagens |
| campaign_recipients | 9.2 MB | 10.847 registros |
| balance_transactions | 9.5 MB | 43 transações |
| conversation_assignments | 576 KB | 527 (53 arquivadas) |

## Alterações na Limpeza (Edge Function)

### 1. Mensagens apenas de conversas arquivadas
```text
Antes: Apaga TODAS mensagens > 7 dias
Depois: Apaga mensagens > 7 dias APENAS se a conversa estiver "archived"
```

**Lógica:**
1. Buscar todas as `conversation_assignments` com `status = 'archived'` e `updated_at < 7 dias`
2. Usar os `channel_id` + `conversation_phone` para identificar mensagens relacionadas
3. Deletar apenas essas mensagens

### 2. Outras tabelas (mantém comportamento atual)
- `campaign_recipients`: Deletar registros > 7 dias
- `campaigns`: Deletar apenas as `completed` > 7 dias
- `conversation_notes`: Deletar notas > 7 dias de conversas arquivadas
- `conversation_memory`: Deletar expiradas
- `flow_sessions`: Deletar > 7 dias
- **NOVO**: `conversation_assignments` arquivadas > 7 dias (após deletar mensagens)

## Outras Otimizações para Reduzir Custos

### 3. Limpar balance_transactions antigas (>90 dias)
Transações financeiras muito antigas podem ser arquivadas, mantendo apenas resumos mensais.

### 4. Limpar lead_activity_log
Já existe na estrutura, adicionar limpeza de logs > 30 dias.

### 5. Otimizar consultas pesadas
O hook `useConversations` faz query de 500 mensagens por canal. Possível reduzir para 100.

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/cleanup-old-data/index.ts` | Refatorar lógica de limpeza de mensagens |

## Fluxo da Nova Limpeza

```text
┌─────────────────────────────────────────────────────────────┐
│                    CLEANUP DIÁRIO (3h AM)                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Buscar conversation_assignments:                         │
│     - status = 'archived'                                    │
│     - updated_at < 7 dias                                    │
│                                                              │
│  2. Para cada conversa arquivada:                            │
│     - Deletar whatsapp_messages relacionadas                 │
│     - Deletar conversation_notes relacionadas                │
│                                                              │
│  3. Deletar conversation_assignments arquivadas > 7 dias     │
│                                                              │
│  4. Deletar campaign_recipients > 7 dias                     │
│                                                              │
│  5. Deletar campaigns completed > 7 dias                     │
│                                                              │
│  6. Deletar conversation_memory expiradas                    │
│                                                              │
│  7. Deletar flow_sessions > 7 dias                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Proteções

- Conversas **ativas, pendentes ou em progresso** nunca serão afetadas
- Mensagens de conversas não-arquivadas são preservadas indefinidamente
- Campanhas em andamento não são tocadas
- Leads e dados de clientes permanecem intactos

## Estimativa de Economia

Baseado nos dados atuais:
- ~28.000 mensagens antigas serão avaliadas
- Apenas as de conversas arquivadas serão deletadas
- Potencial redução de **30-40 MB** no banco de dados

## Seção Técnica

### Lógica de identificação de mensagens arquivadas

A função usará uma abordagem de batch para evitar timeout:

1. Query para obter `conversation_assignments` arquivadas antigas
2. Para cada assignment, construir filtro:
   - `channel_id = assignment.channel_id`
   - `sender_phone` ou `metadata->destination` match com `conversation_phone`
   - `created_at < cutoff`
3. Deletar em batches de 1000 registros

### Matching de telefone

Usar sufixo de 8 dígitos para matching (padrão já existente no sistema):
```sql
RIGHT(sender_phone, 8) = RIGHT(conversation_phone, 8)
```
