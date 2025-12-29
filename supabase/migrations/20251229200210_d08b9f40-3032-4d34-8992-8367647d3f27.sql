-- Adicionar campos para guia de atendimento na tabela ai_agents
ALTER TABLE public.ai_agents
ADD COLUMN IF NOT EXISTS service_guide_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS service_guide TEXT;

COMMENT ON COLUMN public.ai_agents.service_guide_enabled IS 'Habilita o modo guia de atendimento com script estruturado';
COMMENT ON COLUMN public.ai_agents.service_guide IS 'Script/roteiro passo a passo que o bot deve seguir durante o atendimento';