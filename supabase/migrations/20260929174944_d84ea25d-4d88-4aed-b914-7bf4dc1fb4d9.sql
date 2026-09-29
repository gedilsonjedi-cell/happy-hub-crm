ALTER TABLE public.webchat_links
  ADD COLUMN IF NOT EXISTS avatar_path text;

COMMENT ON COLUMN public.webchat_links.avatar_path IS 'Caminho privado da foto exibida no cabeçalho do Web Chat público.';