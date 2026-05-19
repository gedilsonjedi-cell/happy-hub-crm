UPDATE public.campaign_recipients
SET status = 'pending',
    error_message = NULL,
    last_error_code = NULL,
    next_retry_at = now() + interval '30 seconds'
WHERE status = 'failed'
  AND (error_message ILIKE '%rate limit%' OR error_message ILIKE '%RateLimitError%' OR error_message ILIKE '%too many requests%')
  AND campaign_id IN (
    '5712a0f7-fbae-4ee2-89ee-6c127b1c484a', -- henri mf
    '6676d79a-fc64-4b64-8597-bef01e9c9eaa'  -- INVEST PM SP 1905
  );

-- Reabrir as duas campanhas para que o processador volte a enviar os recuperados
UPDATE public.campaigns
SET status = 'running'
WHERE id IN (
  '5712a0f7-fbae-4ee2-89ee-6c127b1c484a',
  '6676d79a-fc64-4b64-8597-bef01e9c9eaa'
)
AND status IN ('completed','paused');
