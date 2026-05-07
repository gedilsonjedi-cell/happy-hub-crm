
-- ============================================================
-- Manutenção automática do banco para evitar regressão de lentidão
-- ============================================================

-- 1) Função de purga de lixo operacional (pg_net + pg_cron logs)
CREATE OR REPLACE FUNCTION public.maintenance_purge_operational_garbage()
RETURNS TABLE(http_response_deleted bigint, job_run_details_deleted bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, cron
AS $$
DECLARE
  v_http bigint := 0;
  v_jobs bigint := 0;
BEGIN
  -- Apaga responses HTTP do pg_net mais antigos que 6 horas
  DELETE FROM net._http_response WHERE created < now() - interval '6 hours';
  GET DIAGNOSTICS v_http = ROW_COUNT;

  -- Apaga histórico do pg_cron mais antigo que 2 dias
  DELETE FROM cron.job_run_details WHERE end_time < now() - interval '2 days';
  GET DIAGNOSTICS v_jobs = ROW_COUNT;

  http_response_deleted := v_http;
  job_run_details_deleted := v_jobs;
  RETURN NEXT;
END;
$$;

-- 2) Remove jobs antigos de manutenção se já existirem (idempotente)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT jobname FROM cron.job
    WHERE jobname IN (
      'maintenance-purge-operational-hourly',
      'maintenance-vacuum-analyze-hot-tables-daily',
      'maintenance-vacuum-analyze-campaigns-frequent'
    )
  LOOP
    PERFORM cron.unschedule(r.jobname);
  END LOOP;
END $$;

-- 3) Purga de lixo a cada hora
SELECT cron.schedule(
  'maintenance-purge-operational-hourly',
  '17 * * * *',
  $$ SELECT public.maintenance_purge_operational_garbage(); $$
);

-- 4) VACUUM ANALYZE diário nas tabelas quentes (3h da manhã)
SELECT cron.schedule(
  'maintenance-vacuum-analyze-hot-tables-daily',
  '0 3 * * *',
  $$
  VACUUM (ANALYZE) public.campaigns;
  VACUUM (ANALYZE) public.campaign_recipients;
  VACUUM (ANALYZE) public.conversation_assignments;
  VACUUM (ANALYZE) public.conversation_stats;
  VACUUM (ANALYZE) public.leads;
  VACUUM (ANALYZE) public.whatsapp_messages;
  VACUUM (ANALYZE) public.conversation_metrics;
  VACUUM (ANALYZE) public.lead_activity_log;
  $$
);

-- 5) ANALYZE leve a cada 30 min nas tabelas mais voláteis (sem VACUUM FULL)
SELECT cron.schedule(
  'maintenance-vacuum-analyze-campaigns-frequent',
  '*/30 * * * *',
  $$
  VACUUM (ANALYZE) public.campaigns;
  VACUUM (ANALYZE) public.campaign_recipients;
  VACUUM (ANALYZE) public.conversation_assignments;
  $$
);
