CREATE TABLE public.otp_settings (
  id boolean PRIMARY KEY DEFAULT true,
  otp_login_enabled boolean NOT NULL DEFAULT false,
  otp_channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL,
  otp_template_name text,
  otp_template_language text NOT NULL DEFAULT 'pt_BR',
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT otp_settings_singleton CHECK (id)
);

GRANT SELECT ON public.otp_settings TO authenticated;
GRANT ALL ON public.otp_settings TO service_role;
ALTER TABLE public.otp_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "otp_settings_read_authenticated" ON public.otp_settings FOR SELECT TO authenticated USING (true);

CREATE TABLE public.otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.otp_codes TO service_role;
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_otp_codes_user_created ON public.otp_codes (user_id, created_at DESC);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS otp_last_verified_date date;

CREATE TRIGGER update_otp_settings_updated_at
BEFORE UPDATE ON public.otp_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.otp_settings (id, otp_login_enabled) VALUES (true, false) ON CONFLICT (id) DO NOTHING;