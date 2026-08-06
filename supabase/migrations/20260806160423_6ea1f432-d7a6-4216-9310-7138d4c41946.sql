CREATE OR REPLACE FUNCTION public.set_org_auto_reply_flags(
  p_organization_id uuid,
  p_auto_blacklist_enabled boolean,
  p_decline_message_enabled boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.is_super_admin(auth.uid())
    OR (
      public.is_admin_or_supervisor(auth.uid())
      AND p_organization_id = public.get_user_organization_id(auth.uid())
    )
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.organizations
     SET auto_blacklist_enabled = p_auto_blacklist_enabled,
         decline_message_enabled = p_decline_message_enabled
   WHERE id = p_organization_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_org_auto_reply_flags(uuid, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_org_auto_reply_flags(uuid, boolean, boolean) TO authenticated;