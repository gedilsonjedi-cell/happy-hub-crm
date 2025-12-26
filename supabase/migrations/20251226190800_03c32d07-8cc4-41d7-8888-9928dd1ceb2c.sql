-- Add behavior configuration columns to ai_agents table
ALTER TABLE public.ai_agents
ADD COLUMN IF NOT EXISTS response_delay_min integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS response_delay_max integer DEFAULT 3,
ADD COLUMN IF NOT EXISTS simulate_typing boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS auto_escalate_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS escalate_keywords text[] DEFAULT ARRAY[]::text[],
ADD COLUMN IF NOT EXISTS escalate_after_messages integer DEFAULT 5,
ADD COLUMN IF NOT EXISTS escalate_on_sentiment boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS use_business_hours boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS out_of_hours_message text DEFAULT 'Olá! No momento estamos fora do horário de atendimento. Retornaremos em breve!',
ADD COLUMN IF NOT EXISTS auto_greet_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS greeting_delay_seconds integer DEFAULT 2;

COMMENT ON COLUMN public.ai_agents.response_delay_min IS 'Minimum delay in seconds before responding';
COMMENT ON COLUMN public.ai_agents.response_delay_max IS 'Maximum delay in seconds before responding';
COMMENT ON COLUMN public.ai_agents.simulate_typing IS 'Whether to simulate typing indicator';
COMMENT ON COLUMN public.ai_agents.auto_escalate_enabled IS 'Whether to auto-escalate to human';
COMMENT ON COLUMN public.ai_agents.escalate_keywords IS 'Keywords that trigger escalation';
COMMENT ON COLUMN public.ai_agents.escalate_after_messages IS 'Escalate after N messages without resolution';
COMMENT ON COLUMN public.ai_agents.escalate_on_sentiment IS 'Escalate on negative sentiment detection';
COMMENT ON COLUMN public.ai_agents.use_business_hours IS 'Whether to respect business hours';
COMMENT ON COLUMN public.ai_agents.out_of_hours_message IS 'Message sent outside business hours';
COMMENT ON COLUMN public.ai_agents.auto_greet_enabled IS 'Whether to auto-greet new conversations';
COMMENT ON COLUMN public.ai_agents.greeting_delay_seconds IS 'Delay before sending greeting';