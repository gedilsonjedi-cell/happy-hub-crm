-- Reverter todos os canais Meta para usar o webhook do Lovable Cloud
UPDATE channels 
SET meta_app_secret = 'a3862184b3677f09ca2be1840872d30e'
WHERE provider = 'meta' 
  AND connected = true;