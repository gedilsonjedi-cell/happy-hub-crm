-- 2I — Suporte ao BSUID (Business-Scoped User ID) da Meta no banco EXTERNO
-- Rodar no SQL Editor do banco externo.
-- Mantém paridade com a migração aplicada no banco interno.

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS bsuid text;

-- Contatos que adotaram "username" na Meta podem chegar SEM telefone.
ALTER TABLE public.leads ALTER COLUMN phone DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS leads_org_bsuid_unique
  ON public.leads (organization_id, bsuid)
  WHERE bsuid IS NOT NULL;
