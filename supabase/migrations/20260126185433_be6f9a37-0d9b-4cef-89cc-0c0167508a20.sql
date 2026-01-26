-- Substituir o trigger por versão incremental que evita race conditions
-- Ao invés de fazer COUNT(*) a cada update, incrementa/decrementa os contadores

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
  
  -- Se status não mudou, não fazer nada (evita race conditions em webhooks duplicados)
  IF v_old_status IS NOT DISTINCT FROM v_new_status THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  -- Usar uma única query UPDATE atômica para atualizar todos os contadores
  -- Isso evita race conditions entre múltiplas atualizações paralelas
  UPDATE public.campaigns
  SET 
    sent_count = sent_count 
      - CASE WHEN v_old_status IN ('sent', 'delivered', 'read') THEN 1 ELSE 0 END
      + CASE WHEN v_new_status IN ('sent', 'delivered', 'read') THEN 1 ELSE 0 END,
    delivered_count = delivered_count
      - CASE WHEN v_old_status IN ('delivered', 'read') THEN 1 ELSE 0 END
      + CASE WHEN v_new_status IN ('delivered', 'read') THEN 1 ELSE 0 END,
    failed_count = failed_count
      - CASE WHEN v_old_status = 'failed' THEN 1 ELSE 0 END
      + CASE WHEN v_new_status = 'failed' THEN 1 ELSE 0 END,
    updated_at = now()
  WHERE id = v_campaign_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;