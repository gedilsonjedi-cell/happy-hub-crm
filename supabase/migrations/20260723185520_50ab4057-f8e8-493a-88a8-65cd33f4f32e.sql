
-- Tabela de auditoria da limpeza automática de leads sem WhatsApp
CREATE TABLE IF NOT EXISTS public.lead_cleanup_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID,
  lead_id UUID NOT NULL,
  phone TEXT NOT NULL,
  motivo TEXT NOT NULL,
  run_id UUID,
  distinct_campaigns INTEGER,
  last_failure_at TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_cleanup_log_org ON public.lead_cleanup_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_lead_cleanup_log_run ON public.lead_cleanup_log(run_id);
CREATE INDEX IF NOT EXISTS idx_lead_cleanup_log_criado ON public.lead_cleanup_log(criado_em DESC);

GRANT SELECT ON public.lead_cleanup_log TO authenticated;
GRANT ALL ON public.lead_cleanup_log TO service_role;

ALTER TABLE public.lead_cleanup_log ENABLE ROW LEVEL SECURITY;

-- Só super_admin pode ler
CREATE POLICY "super_admin can read cleanup log"
ON public.lead_cleanup_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

-- Só service_role escreve (edge function)
CREATE POLICY "service role manages cleanup log"
ON public.lead_cleanup_log
FOR ALL
TO service_role
USING (true) WITH CHECK (true);
