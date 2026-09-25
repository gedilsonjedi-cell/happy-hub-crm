REVOKE EXECUTE ON FUNCTION public.redirect_links_validate_webchat() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.webchat_links_validate_channel() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_redirect_link_v2(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_redirect_click(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_redirect_link_v2(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.log_redirect_click(uuid) TO service_role;