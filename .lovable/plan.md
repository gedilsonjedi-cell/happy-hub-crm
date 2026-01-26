
# Plano de Melhoria do Sistema de Campanhas

## Diagnóstico do Problema

Após análise completa do código e dados, identifiquei as seguintes diferenças entre nosso sistema e soluções profissionais como o Helena.app:

### Problema Principal: Erro #131049 Tratado como Falha Permanente

O erro `#131049` (limite de marketing por usuário) ocorre quando a Meta bloqueia temporariamente mensagens de marketing para um contato específico. No entanto:

- **Nosso sistema**: Marca como `failed` permanentemente e nunca retenta
- **Sistemas profissionais**: Aguardam 12-24 horas e tentam novamente automaticamente

**Dados reais das suas campanhas:**
- ~3.400 falhas por erro 131049 nos últimos 7 dias
- Taxa de entrega média: 5-10% (deveria ser 40-60% com retry adequado)

### Por que o Helena.app funciona melhor?

Segundo a documentação do WhatsApp, o erro 131049 é **temporário**. A recomendação oficial é:
1. Primeira tentativa: aguardar 12 horas
2. Segunda tentativa: aguardar 24 horas  
3. Terceira tentativa: aguardar 48 horas

---

## Solução Proposta

### Fase 1: Sistema de Retry Inteligente

**Modificar `send-campaign-batch`** para agendar retries ao invés de marcar como falha definitiva:

```text
┌─────────────────┐     ┌──────────────┐     ┌───────────────┐
│ Envio inicial   │ ──► │ Erro #131049 │ ──► │ Agendar retry │
│ (status=sent)   │     │ detectado    │     │ em 12 horas   │
└─────────────────┘     └──────────────┘     └───────────────┘
                                                     │
                                                     ▼
                                            ┌───────────────┐
                                            │ retry_count=1 │
                                            │ next_retry_at │
                                            │ = now + 12h   │
                                            └───────────────┘
```

### Fase 2: Processador de Retries

**Criar/modificar `campaign-processor`** para buscar mensagens prontas para retry:

- Verifica `next_retry_at <= NOW()` 
- Processa até 3 tentativas (retry_count < 3)
- Incrementa delay: 12h → 24h → 48h
- Após 3 tentativas: marca como `failed` definitivo

### Fase 3: Identificação de Erros Retentáveis

| Código | Descrição | Ação |
|--------|-----------|------|
| 131049 | Limite de marketing | Retry em 12-48h |
| 135000 | Erro genérico | Retry em 1h |
| 131000 | Erro interno Meta | Retry em 30min |
| 131026 | Sem WhatsApp | Falha permanente |
| 131042 | Problema pagamento | Falha permanente |

### Fase 4: Status Intermediário "Aguardando Retry"

Adicionar visualização na UI para mostrar mensagens aguardando próxima tentativa, separadas das falhas definitivas.

---

## Implementação Técnica

### 1. Atualizar `send-campaign-batch/index.ts`

```typescript
// Erros que podem ser retentados
const RETRYABLE_ERRORS = {
  '131049': { maxRetries: 3, delayHours: [12, 24, 48] },
  '135000': { maxRetries: 2, delayHours: [1, 2] },
  '131000': { maxRetries: 2, delayHours: [0.5, 1] },
};

// Quando receber erro retentável:
if (RETRYABLE_ERRORS[errorCode]) {
  const config = RETRYABLE_ERRORS[errorCode];
  const currentRetry = recipient.retry_count || 0;
  
  if (currentRetry < config.maxRetries) {
    const delayHours = config.delayHours[currentRetry];
    await supabase.from('campaign_recipients').update({
      status: 'waiting_retry',
      retry_count: currentRetry + 1,
      next_retry_at: new Date(Date.now() + delayHours * 3600000),
      last_error_code: errorCode
    }).eq('id', recipientId);
  } else {
    // Max retries reached - mark as failed
    await supabase.from('campaign_recipients').update({
      status: 'failed'
    }).eq('id', recipientId);
  }
}
```

### 2. Atualizar `campaign-processor/index.ts`

Adicionar lógica para processar retries:

```typescript
// Buscar recipients prontos para retry
const { data: readyForRetry } = await supabase
  .from('campaign_recipients')
  .select('*, campaigns!inner(status)')
  .eq('status', 'waiting_retry')
  .lte('next_retry_at', new Date().toISOString())
  .eq('campaigns.status', 'completed') // Pode retentar mesmo após campanha "completa"
  .limit(10);

for (const recipient of readyForRetry) {
  // Re-enviar mensagem
  // Atualizar status baseado no resultado
}
```

### 3. Adicionar Novo Status na Campanha

- Campanha em `completed` pode ter recipients em `waiting_retry`
- Novo badge "Aguardando Retry" na UI
- Contadores separados: falhas definitivas vs aguardando retry

### 4. Modificar `useCampaignProcessor.tsx`

Continuar polling mesmo para campanhas "completed" que tenham retries pendentes.

### 5. Atualizar UI do Relatório

No `CampaignReportDialog`, mostrar:
- Enviadas ✓
- Entregues ✓
- Falhas definitivas ✗
- **Aguardando retry** ⏳ (NOVO)

---

## Arquivos a Modificar

1. `supabase/functions/send-campaign-batch/index.ts` - Lógica de retry
2. `supabase/functions/campaign-processor/index.ts` - Processar retries
3. `src/hooks/useCampaignProcessor.tsx` - Suporte a waiting_retry
4. `src/components/campaigns/CampaignReportDialog.tsx` - Mostrar status retry
5. `src/pages/Disparos.tsx` - Badge de aguardando retry

---

## Resultado Esperado

Com essa implementação:
- **Taxa de entrega esperada**: 40-60% (vs atual 5-10%)
- **Mensagens #131049**: ~70% entregues em até 48h
- **Experiência do usuário**: Sem necessidade de reciclar manualmente
- **Paridade com Helena.app**: Sistema de retry automático similar

---

## Riscos e Mitigações

| Risco | Mitigação |
|-------|-----------|
| Reenvio duplicado | Lock por recipient_id + campanha |
| Sobrecarga do sistema | Processar retries em batches pequenos |
| Campanha antiga retentando | Limite de 7 dias para retries |
| Custo adicional | Mensagens retentadas são gratuitas (mesmo envelope) |

---

## Cronograma Sugerido

1. **Fase 1** (Core): Implementar lógica de retry - ~2 horas
2. **Fase 2** (Processor): Atualizar processador - ~1 hora
3. **Fase 3** (UI): Atualizar interface - ~1 hora
4. **Fase 4** (Teste): Testar com campanha real - ~30 min
