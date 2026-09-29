CREATE TABLE IF NOT EXISTS public.webpush_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  public_key text NOT NULL,
  private_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.webpush_config FROM anon, authenticated;
GRANT ALL ON public.webpush_config TO service_role;
ALTER TABLE public.webpush_config ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.webchat_push_subscriptions (
  endpoint text PRIMARY KEY,
  session_id uuid NOT NULL,
  link_id uuid,
  organization_id uuid,
  subscription jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webchat_push_subscriptions_session_idx ON public.webchat_push_subscriptions(session_id);
REVOKE ALL ON public.webchat_push_subscriptions FROM anon, authenticated;
GRANT ALL ON public.webchat_push_subscriptions TO service_role;
ALTER TABLE public.webchat_push_subscriptions ENABLE ROW LEVEL SECURITY;