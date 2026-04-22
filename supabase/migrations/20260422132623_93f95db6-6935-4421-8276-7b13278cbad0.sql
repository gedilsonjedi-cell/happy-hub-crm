-- Helper function: check channel belongs to current user's organization (bypasses RLS on channels)
CREATE OR REPLACE FUNCTION public.channel_belongs_to_user_org(_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.channels c
    WHERE c.id = _channel_id
      AND c.organization_id = public.get_user_organization_id(auth.uid())
  );
$$;

-- Drop and recreate conversation_assignments SELECT policy
DROP POLICY IF EXISTS "Users can view conversations in their sectors" ON public.conversation_assignments;

CREATE POLICY "Users can view conversations in their sectors"
ON public.conversation_assignments
FOR SELECT
TO authenticated
USING (
  (
    public.is_super_admin(auth.uid())
    OR (channel_id IS NOT NULL AND public.channel_belongs_to_user_org(channel_id))
    OR (
      channel_id IS NULL
      AND assigned_to IN (
        SELECT user_id FROM public.profiles
        WHERE organization_id = public.get_user_organization_id(auth.uid())
      )
    )
  )
  AND public.user_can_access_conversation(sector_id)
);

-- Recreate UPDATE policy
DROP POLICY IF EXISTS "Organization members can update conversation assignments" ON public.conversation_assignments;

CREATE POLICY "Organization members can update conversation assignments"
ON public.conversation_assignments
FOR UPDATE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (channel_id IS NOT NULL AND public.channel_belongs_to_user_org(channel_id))
  OR (
    channel_id IS NULL
    AND assigned_to IN (
      SELECT user_id FROM public.profiles
      WHERE organization_id = public.get_user_organization_id(auth.uid())
    )
  )
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (channel_id IS NOT NULL AND public.channel_belongs_to_user_org(channel_id))
  OR (
    channel_id IS NULL
    AND assigned_to IN (
      SELECT user_id FROM public.profiles
      WHERE organization_id = public.get_user_organization_id(auth.uid())
    )
  )
);

-- Recreate INSERT policy
DROP POLICY IF EXISTS "Organization members can insert conversation assignments" ON public.conversation_assignments;

CREATE POLICY "Organization members can insert conversation assignments"
ON public.conversation_assignments
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (channel_id IS NOT NULL AND public.channel_belongs_to_user_org(channel_id))
);