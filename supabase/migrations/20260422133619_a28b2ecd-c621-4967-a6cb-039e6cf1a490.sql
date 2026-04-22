DROP POLICY IF EXISTS "Users can view conversations in their sectors" ON public.conversation_assignments;
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
    AND assigned_to IN (
      SELECT profiles.user_id
      FROM public.profiles
      WHERE profiles.organization_id = public.get_user_organization_id(auth.uid())
    )
  )
);