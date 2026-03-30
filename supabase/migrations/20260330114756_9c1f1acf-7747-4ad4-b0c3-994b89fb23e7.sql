UPDATE campaign_recipients 
SET status = 'pending', error_message = NULL, last_error_code = NULL
WHERE campaign_id = '006b4ed5-e1fa-4c80-aaf4-4b569c38fe3d'
  AND status = 'failed'
  AND error_message LIKE '%conteúdo não suportado%'