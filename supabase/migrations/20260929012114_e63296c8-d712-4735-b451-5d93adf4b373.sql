ALTER TABLE public.webchat_links ADD COLUMN IF NOT EXISTS slug text;
UPDATE public.webchat_links SET slug = substr(replace(gen_random_uuid()::text, '-', ''), 1, 8) WHERE slug IS NULL;
ALTER TABLE public.webchat_links ALTER COLUMN slug SET NOT NULL;
ALTER TABLE public.webchat_links ALTER COLUMN slug SET DEFAULT substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
CREATE UNIQUE INDEX IF NOT EXISTS webchat_links_slug_key ON public.webchat_links (slug);