ALTER TABLE public.message_templates
  ADD COLUMN IF NOT EXISTS otp_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS otp_last_used_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_message_templates_otp_active
  ON public.message_templates (otp_active, otp_last_used_at) WHERE otp_active;

REVOKE UPDATE (otp_active, otp_last_used_at) ON public.message_templates FROM authenticated;
REVOKE UPDATE (otp_active, otp_last_used_at) ON public.message_templates FROM anon;
GRANT ALL ON public.message_templates TO service_role;