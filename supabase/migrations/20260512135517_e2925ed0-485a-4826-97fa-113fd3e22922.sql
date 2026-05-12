-- 1. flow_bots: tipo (reactive | dispatch) + template inicial
ALTER TABLE public.flow_bots
  ADD COLUMN IF NOT EXISTS flow_type text NOT NULL DEFAULT 'reactive',
  ADD COLUMN IF NOT EXISTS template_id uuid;

-- Validação por trigger (CHECK constraints rígidos evitados conforme convenção)
CREATE OR REPLACE FUNCTION public.validate_flow_bot_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.flow_type NOT IN ('reactive', 'dispatch') THEN
    RAISE EXCEPTION 'flow_type must be reactive or dispatch, got %', NEW.flow_type;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_flow_bot_type ON public.flow_bots;
CREATE TRIGGER trg_validate_flow_bot_type
  BEFORE INSERT OR UPDATE ON public.flow_bots
  FOR EACH ROW EXECUTE FUNCTION public.validate_flow_bot_type();

CREATE INDEX IF NOT EXISTS idx_flow_bots_flow_type ON public.flow_bots(flow_type);
CREATE INDEX IF NOT EXISTS idx_flow_bots_org_type ON public.flow_bots(organization_id, flow_type);

-- 2. campaigns: flow de disparo opcional
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS flow_bot_id uuid;

CREATE INDEX IF NOT EXISTS idx_campaigns_flow_bot_id ON public.campaigns(flow_bot_id);

-- 3. campaign_recipients: rastrear flow usado
ALTER TABLE public.campaign_recipients
  ADD COLUMN IF NOT EXISTS flow_bot_id uuid;

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_flow_bot_id ON public.campaign_recipients(flow_bot_id);

-- 4. flow_sessions (se existir): vínculo com campanha
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'flow_sessions'
  ) THEN
    EXECUTE 'ALTER TABLE public.flow_sessions ADD COLUMN IF NOT EXISTS campaign_id uuid';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_flow_sessions_campaign_id ON public.flow_sessions(campaign_id)';
  END IF;
END $$;