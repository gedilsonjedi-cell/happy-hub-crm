-- Limpar meta_app_secret de todos os canais Meta (cada cliente tem app diferente)
UPDATE channels 
SET meta_app_secret = NULL
WHERE provider = 'meta';