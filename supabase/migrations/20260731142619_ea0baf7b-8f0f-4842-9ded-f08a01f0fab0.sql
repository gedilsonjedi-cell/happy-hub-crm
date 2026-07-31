-- conversation_memory: block NULL organization_id rows from ever matching
DROP POLICY IF EXISTS "Org members can read conversation memory" ON public.conversation_memory;
CREATE POLICY "Org members can read conversation memory"
ON public.conversation_memory
FOR SELECT
TO authenticated
USING (
  organization_id IS NOT NULL
  AND get_user_organization_id(auth.uid()) IS NOT NULL
  AND organization_id = get_user_organization_id(auth.uid())
);

-- quick_responses: global responses must stay inside the organization; require auth
DROP POLICY IF EXISTS "Users can view their own and global quick responses" ON public.quick_responses;
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
);

DROP POLICY IF EXISTS "Users can create their own quick responses" ON public.quick_responses;
CREATE POLICY "Users can create their own quick responses"
ON public.quick_responses
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own quick responses" ON public.quick_responses;
CREATE POLICY "Users can update their own quick responses"
ON public.quick_responses
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own quick responses" ON public.quick_responses;
CREATE POLICY "Users can delete their own quick responses"
ON public.quick_responses
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);