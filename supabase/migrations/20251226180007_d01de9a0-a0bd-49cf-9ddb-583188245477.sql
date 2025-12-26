-- Drop and recreate INSERT policy to include super_admin
DROP POLICY IF EXISTS "Admins can insert sequences" ON public.follow_up_sequences;

CREATE POLICY "Admins can insert sequences" 
ON public.follow_up_sequences 
FOR INSERT 
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM profiles WHERE user_id = auth.uid()
  ) AND (is_admin_or_supervisor(auth.uid()) OR is_super_admin(auth.uid()))
);

-- Also update UPDATE and DELETE policies
DROP POLICY IF EXISTS "Admins can update sequences" ON public.follow_up_sequences;

CREATE POLICY "Admins can update sequences" 
ON public.follow_up_sequences 
FOR UPDATE 
USING (
  organization_id IN (
    SELECT organization_id FROM profiles WHERE user_id = auth.uid()
  ) AND (is_admin_or_supervisor(auth.uid()) OR is_super_admin(auth.uid()))
);

DROP POLICY IF EXISTS "Admins can delete sequences" ON public.follow_up_sequences;

CREATE POLICY "Admins can delete sequences" 
ON public.follow_up_sequences 
FOR DELETE 
USING (
  organization_id IN (
    SELECT organization_id FROM profiles WHERE user_id = auth.uid()
  ) AND (is_admin_or_supervisor(auth.uid()) OR is_super_admin(auth.uid()))
);