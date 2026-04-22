CREATE OR REPLACE VIEW public.channels_public
WITH (security_invoker=on) AS
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

DROP POLICY IF EXISTS "Organization admins can view channels" ON public.channels;
DROP POLICY IF EXISTS "Organization members can view channel basics" ON public.channels;

CREATE POLICY "Organization members can view channel basics"
ON public.channels
FOR SELECT
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR organization_id = public.get_user_organization_id(auth.uid())
);

DROP POLICY IF EXISTS "Organization members can view conversations" ON public.conversation_assignments;

CREATE POLICY "Organization members can view conversations"
ON public.conversation_assignments
FOR SELECT
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (
    channel_id IS NOT NULL
    AND public.channel_belongs_to_user_org(channel_id)
  )
  OR (
    channel_id IS NULL
    AND lead_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.leads l
      WHERE l.id = conversation_assignments.lead_id
        AND l.organization_id = public.get_user_organization_id(auth.uid())
    )
  )
  OR (
    channel_id IS NULL
    AND assigned_to IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = conversation_assignments.assigned_to
        AND p.organization_id = public.get_user_organization_id(auth.uid())
    )
  )
);

DROP POLICY IF EXISTS "Users can read conversation stats for their org" ON public.conversation_stats;

CREATE POLICY "Users can read conversation stats for their org"
ON public.conversation_stats
FOR SELECT
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR organization_id = public.get_user_organization_id(auth.uid())
);