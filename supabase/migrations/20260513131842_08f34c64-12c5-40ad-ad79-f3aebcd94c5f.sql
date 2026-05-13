-- Hardening: prevent attendants/supervisors from reading WhatsApp credentials directly from `channels`.
-- The mirror trigger keeps `channel_secrets` in sync, and that table already restricts SELECT to
-- channel owner / admin / supervisor / super_admin. service_role bypasses column privileges.
REVOKE SELECT (access_token, api_token, meta_app_secret, webhook_verify_token)
  ON public.channels FROM authenticated;
REVOKE SELECT (access_token, api_token, meta_app_secret, webhook_verify_token)
  ON public.channels FROM anon;