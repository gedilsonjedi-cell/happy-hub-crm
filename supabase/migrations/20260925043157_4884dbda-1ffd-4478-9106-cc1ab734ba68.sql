CREATE OR REPLACE VIEW public.channels_public
WITH (security_invoker = true)
AS
SELECT
  id,
  user_id,
  organization_id,
  name,
  phone,
  provider,
  app_name,
  waba_id,
  connected,
  created_at,
  updated_at
FROM public.channels;

GRANT SELECT ON public.channels_public TO authenticated;
GRANT SELECT ON public.channels_public TO service_role;

COMMENT ON VIEW public.channels_public IS 'Safe channel metadata without access tokens or webhook secrets; respects channels RLS through security_invoker.';