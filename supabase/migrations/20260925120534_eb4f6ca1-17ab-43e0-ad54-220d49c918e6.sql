REVOKE EXECUTE ON FUNCTION public.log_redirect_click(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_redirect_click(uuid) TO service_role;