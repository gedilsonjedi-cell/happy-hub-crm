DROP POLICY IF EXISTS "Users can view their own and org quick responses" ON public.quick_responses;
CREATE POLICY "Users can view their own and org quick responses"
ON public.quick_responses
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR (
    organization_id IS NOT NULL
    AND organization_id = get_user_organization_id(auth.uid())
  )
  OR (
    is_global = true
    AND organization_id IS NULL
    AND get_user_organization_id(auth.uid()) IS NOT NULL
    AND get_user_organization_id(user_id) = get_user_organization_id(auth.uid())
  )
);