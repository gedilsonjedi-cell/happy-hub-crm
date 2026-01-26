
# Plano de Correção: Estabilidade dos Contadores de Campanha

## Diagnóstico Completo

### Problema Identificado
Os contadores de campanha (enviadas, entregues, falhas) flutuam inconsistentemente porque:

1. **Webhooks Duplicados da Meta**: A Meta envia múltiplos webhooks para o mesmo evento. Nos logs, vemos o mesmo recipient sendo atualizado DUAS VEZES em 17ms:
   ```
   18:52:12.172Z - Campaign recipient updated: f14d214d... status: "failed"
   18:52:12.155Z - Campaign recipient updated: f14d214d... status: "failed"
   ```

2. **Race Condition no Trigger**: O trigger `sync_campaign_counts` executa um `COUNT(*)` completo a cada atualização. Quando múltiplas atualizações ocorrem em paralelo:
   - Update 1 começa contagem (vê status X)
   - Update 2 muda status para Y
   - Update 1 termina contagem (valores desatualizados)
   - Update 2 começa contagem (valores corretos)
   - Resultado: números "pulam" entre valores

3. **Dupla Atualização de Status**: O `send-campaign-batch` atualiza recipient para `sent`, depois o webhook atualiza para `failed`, cada um disparando o trigger.

### Evidência nos Logs de Console
```javascript
18:50:39.091 - sent_count: 1, failed_count: 6
18:50:39.188 - sent_count: 0, failed_count: 7  // 97ms depois, sent_count foi de 1 para 0!
```

---

## Solução Proposta

### Fase 1: Proteção contra Webhooks Duplicados (meta-webhook)

**Objetivo**: Ignorar webhooks duplicados para o mesmo recipient

**Implementação**:
```typescript
// Antes de atualizar, verificar se já foi processado recentemente
if (statusValue === 'failed') {
  // Só atualizar se status atual for diferente de 'failed'
  if (recipient.status !== 'failed') {
    updateData.status = 'failed';
    // ...
  }
}
```

**Problema atual**: A verificação `recipient.status !== 'failed'` existe, MAS os dois webhooks chegam tão rápido que ambos passam pela verificação antes de qualquer update ser commitado.

**Solução**: Adicionar timestamp de última atualização e ignorar updates muito próximos:
```typescript
// Ignorar se foi atualizado há menos de 2 segundos
const lastUpdate = new Date(recipient.updated_at).getTime();
const now = Date.now();
if (now - lastUpdate < 2000 && recipient.status === statusValue) {
  console.log('Ignoring duplicate webhook for recipient:', recipient.id);
  continue;
}
```

---

### Fase 2: Trigger com Debounce/Lock (sync_campaign_counts)

**Problema**: O trigger atual executa COUNT(*) a cada UPDATE, causando race conditions.

**Solução 1 - Simples (Recomendada)**: Usar `SKIP LOCKED` e operações atômicas

```sql
CREATE OR REPLACE FUNCTION public.sync_campaign_counts()
RETURNS TRIGGER AS $$
DECLARE
  v_campaign_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_campaign_id := OLD.campaign_id;
  ELSE
    v_campaign_id := NEW.campaign_id;
  END IF;
  
  -- Usar UPDATE com subqueries para operação atômica
  UPDATE public.campaigns
  SET 
    sent_count = (
      SELECT COUNT(*) FROM public.campaign_recipients 
      WHERE campaign_id = v_campaign_id 
      AND status IN ('sent', 'delivered', 'read')
    ),
    delivered_count = (
      SELECT COUNT(*) FROM public.campaign_recipients 
      WHERE campaign_id = v_campaign_id 
      AND (status IN ('delivered', 'read') OR delivered_at IS NOT NULL)
    ),
    failed_count = (
      SELECT COUNT(*) FROM public.campaign_recipients 
      WHERE campaign_id = v_campaign_id 
      AND status = 'failed'
    ),
    updated_at = now()
  WHERE id = v_campaign_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Solução 2 - Incremental (Mais Performática)**: Usar incremento/decremento ao invés de COUNT(*) completo

```sql
CREATE OR REPLACE FUNCTION public.sync_campaign_counts()
RETURNS TRIGGER AS $$
DECLARE
  v_campaign_id uuid;
  v_old_status text;
  v_new_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_campaign_id := OLD.campaign_id;
    v_old_status := OLD.status;
    v_new_status := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_campaign_id := NEW.campaign_id;
    v_old_status := NULL;
    v_new_status := NEW.status;
  ELSE -- UPDATE
    v_campaign_id := NEW.campaign_id;
    v_old_status := OLD.status;
    v_new_status := NEW.status;
  END IF;
  
  -- Se status não mudou, não fazer nada
  IF v_old_status = v_new_status THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  -- Decrementar contador antigo
  IF v_old_status IN ('sent', 'delivered', 'read') THEN
    UPDATE campaigns SET sent_count = GREATEST(0, sent_count - 1) WHERE id = v_campaign_id;
  END IF;
  IF v_old_status IN ('delivered', 'read') THEN
    UPDATE campaigns SET delivered_count = GREATEST(0, delivered_count - 1) WHERE id = v_campaign_id;
  END IF;
  IF v_old_status = 'failed' THEN
    UPDATE campaigns SET failed_count = GREATEST(0, failed_count - 1) WHERE id = v_campaign_id;
  END IF;
  
  -- Incrementar contador novo
  IF v_new_status IN ('sent', 'delivered', 'read') THEN
    UPDATE campaigns SET sent_count = sent_count + 1 WHERE id = v_campaign_id;
  END IF;
  IF v_new_status IN ('delivered', 'read') THEN
    UPDATE campaigns SET delivered_count = delivered_count + 1 WHERE id = v_campaign_id;
  END IF;
  IF v_new_status = 'failed' THEN
    UPDATE campaigns SET failed_count = failed_count + 1 WHERE id = v_campaign_id;
  END IF;
  
  UPDATE campaigns SET updated_at = now() WHERE id = v_campaign_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

### Fase 3: Proteção no Frontend (CampaignProgressBar)

**Problema**: O frontend atualiza a cada evento realtime, mostrando estados intermediários.

**Solução**: Adicionar debounce no realtime subscription

```typescript
// Debounce realtime updates para evitar flickering
const debouncedFetch = useMemo(() => 
  debounce(fetchRunningCampaigns, 1000), // 1 segundo
  [fetchRunningCampaigns]
);

// No subscription
.on("postgres_changes", {...}, (payload) => {
  debouncedFetch(); // Não atualizar imediatamente
})
```

**Adicional**: Só atualizar se os valores realmente mudaram:
```typescript
if (!error && data) {
  // Só atualizar state se dados realmente mudaram
  const hasChanges = JSON.stringify(data) !== JSON.stringify(runningCampaigns);
  if (hasChanges) {
    setRunningCampaigns(data);
  }
}
```

---

### Fase 4: Proteção no meta-webhook

**Adicionar lock por recipient** para evitar updates paralelos:

```typescript
// Usar um advisory lock baseado no recipient ID
const lockKey = recipient.id.replace(/-/g, '').slice(0, 16);
const { data: lockResult } = await supabase.rpc('try_advisory_lock', { key: lockKey });

if (!lockResult) {
  console.log('Another process is updating this recipient, skipping');
  continue;
}

try {
  // Fazer update
} finally {
  await supabase.rpc('release_advisory_lock', { key: lockKey });
}
```

---

## Arquivos a Modificar

| Arquivo | Mudança | Prioridade |
|---------|---------|------------|
| `supabase/migrations/[new].sql` | Trigger incremental | Alta |
| `supabase/functions/meta-webhook/index.ts` | Proteção contra duplicados | Alta |
| `src/components/campaigns/CampaignProgressBar.tsx` | Debounce de updates | Média |
| `src/hooks/useCampaignProcessor.tsx` | Debounce de UI | Média |

---

## Resumo Técnico

### Causa Raiz
1. Meta envia webhooks duplicados (milissegundos de diferença)
2. Trigger executa COUNT(*) completo a cada update
3. Race conditions entre updates paralelos

### Solução
1. **Backend**: Trigger incremental + proteção contra duplicados
2. **Frontend**: Debounce em updates realtime
3. **Webhook**: Verificação de timestamp para ignorar duplicados

### Resultado Esperado
- Contadores estáveis e precisos
- Sem flickering na UI
- Performance melhorada (incremento vs COUNT(*))
