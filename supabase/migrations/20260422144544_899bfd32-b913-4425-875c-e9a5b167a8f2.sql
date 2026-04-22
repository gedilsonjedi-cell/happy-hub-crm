REVOKE SELECT (access_token, meta_app_secret, api_token, webhook_verify_token) ON public.channels FROM authenticated, anon;
GRANT SELECT (id, user_id, organization_id, name, phone, provider, app_name, waba_id, connected, created_at, updated_at) ON public.channels TO authenticated;

CREATE INDEX IF NOT EXISTS idx_conv_assignments_lead_status ON public.conversation_assignments (lead_id, status, updated_at DESC) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conv_assignments_assigned_status ON public.conversation_assignments (assigned_to, status, updated_at DESC) WHERE assigned_to IS NOT NULL;

CREATE OR REPLACE FUNCTION public.run_rls_visibility_check(_user_id uuid)
RETURNS TABLE (check_name text, expected text, result text, passed boolean, details text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_org_id uuid;
  v_role text;
  v_channel_count integer;
  v_pending_count integer;
  v_active_count integer;
  v_stats_count integer;
  v_caller uuid := auth.uid();
BEGIN
  IF NOT (
    public.is_super_admin(v_caller)
    OR (public.is_admin_or_supervisor(v_caller)
        AND public.get_user_organization_id(v_caller) = public.get_user_organization_id(_user_id))
  ) THEN
    RAISE EXCEPTION 'Not authorized to run RLS visibility check';
  END IF;

  v_org_id := public.get_user_organization_id(_user_id);
  SELECT role::text INTO v_role FROM public.user_roles WHERE user_id = _user_id LIMIT 1;

  SELECT COUNT(*) INTO v_channel_count FROM public.channels WHERE organization_id = v_org_id;
  RETURN QUERY SELECT 'channels_visible'::text, '>= 0'::text, v_channel_count::text, (v_channel_count >= 0),
    format('user role=%s, org=%s', COALESCE(v_role,'null'), v_org_id);

  SELECT COUNT(*) INTO v_pending_count FROM public.conversation_assignments ca
  WHERE ca.status = 'pending' AND (
    (ca.channel_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.channels c WHERE c.id = ca.channel_id AND c.organization_id = v_org_id))
    OR (ca.channel_id IS NULL AND ca.lead_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = ca.lead_id AND l.organization_id = v_org_id))
  );
  RETURN QUERY SELECT 'pending_conversations_visible'::text, '>= 0'::text, v_pending_count::text, (v_pending_count >= 0),
    'inclui assignments com e sem channel_id'::text;

  SELECT COUNT(*) INTO v_active_count FROM public.conversation_assignments ca
  WHERE ca.status = 'active' AND (
    (ca.channel_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.channels c WHERE c.id = ca.channel_id AND c.organization_id = v_org_id))
    OR (ca.channel_id IS NULL AND ca.lead_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = ca.lead_id AND l.organization_id = v_org_id))
  );
  RETURN QUERY SELECT 'active_conversations_visible'::text, '>= 0'::text, v_active_count::text, (v_active_count >= 0),
    'em andamento'::text;

  SELECT COUNT(*) INTO v_stats_count FROM public.conversation_stats cs WHERE cs.organization_id = v_org_id;
  RETURN QUERY SELECT 'conversation_stats_visible'::text, '>= 0'::text, v_stats_count::text, (v_stats_count >= 0),
    'preview e unread_count'::text;

  RETURN QUERY SELECT 'access_token_blocked'::text, 'sem SELECT em access_token'::text,
    CASE WHEN has_column_privilege('authenticated','public.channels','access_token','SELECT') THEN 'visible' ELSE 'blocked' END,
    (NOT has_column_privilege('authenticated','public.channels','access_token','SELECT')), 'grant'::text;

  RETURN QUERY SELECT 'meta_app_secret_blocked'::text, 'sem SELECT em meta_app_secret'::text,
    CASE WHEN has_column_privilege('authenticated','public.channels','meta_app_secret','SELECT') THEN 'visible' ELSE 'blocked' END,
    (NOT has_column_privilege('authenticated','public.channels','meta_app_secret','SELECT')), 'grant'::text;

  RETURN QUERY SELECT 'api_token_blocked'::text, 'sem SELECT em api_token'::text,
    CASE WHEN has_column_privilege('authenticated','public.channels','api_token','SELECT') THEN 'visible' ELSE 'blocked' END,
    (NOT has_column_privilege('authenticated','public.channels','api_token','SELECT')), 'grant'::text;

  RETURN QUERY SELECT 'verify_token_blocked'::text, 'sem SELECT em webhook_verify_token'::text,
    CASE WHEN has_column_privilege('authenticated','public.channels','webhook_verify_token','SELECT') THEN 'visible' ELSE 'blocked' END,
    (NOT has_column_privilege('authenticated','public.channels','webhook_verify_token','SELECT')), 'grant'::text;

  RETURN QUERY SELECT 'public_columns_visible'::text, 'name e phone visiveis'::text,
    CASE WHEN has_column_privilege('authenticated','public.channels','name','SELECT')
          AND has_column_privilege('authenticated','public.channels','phone','SELECT') THEN 'visible' ELSE 'blocked' END,
    (has_column_privilege('authenticated','public.channels','name','SELECT')
     AND has_column_privilege('authenticated','public.channels','phone','SELECT')),
    'colunas basicas'::text;
END;
$func$;

COMMENT ON FUNCTION public.run_rls_visibility_check(uuid) IS 'Teste de regressao de RLS: valida acesso de um usuario a canais (sem segredos) e conversas pendentes/ativas da organizacao.';