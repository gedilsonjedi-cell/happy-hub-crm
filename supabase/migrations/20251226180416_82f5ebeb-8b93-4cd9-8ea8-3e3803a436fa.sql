-- Drop existing policy and create separate policies for follow_up_messages
DROP POLICY IF EXISTS "Admins can manage messages" ON public.follow_up_messages;

-- Create policy for SELECT
CREATE POLICY "Users can view messages" 
ON public.follow_up_messages 
FOR SELECT 
USING (
  sequence_id IN (
    SELECT id FROM follow_up_sequences 
    WHERE organization_id IN (
      SELECT organization_id FROM profiles WHERE user_id = auth.uid()
    )
  )
);

-- Create policy for INSERT (admins/supervisors/super_admins only)
CREATE POLICY "Admins can insert messages" 
ON public.follow_up_messages 
FOR INSERT 
WITH CHECK (
  sequence_id IN (
    SELECT id FROM follow_up_sequences 
    WHERE organization_id IN (
      SELECT organization_id FROM profiles WHERE user_id = auth.uid()
    )
  ) AND (is_admin_or_supervisor(auth.uid()) OR is_super_admin(auth.uid()))
);

-- Create policy for UPDATE (admins/supervisors/super_admins only)
CREATE POLICY "Admins can update messages" 
ON public.follow_up_messages 
FOR UPDATE 
USING (
  sequence_id IN (
    SELECT id FROM follow_up_sequences 
    WHERE organization_id IN (
      SELECT organization_id FROM profiles WHERE user_id = auth.uid()
    )
  ) AND (is_admin_or_supervisor(auth.uid()) OR is_super_admin(auth.uid()))
);

-- Create policy for DELETE (admins/supervisors/super_admins only)
CREATE POLICY "Admins can delete messages" 
ON public.follow_up_messages 
FOR DELETE 
USING (
  sequence_id IN (
    SELECT id FROM follow_up_sequences 
    WHERE organization_id IN (
      SELECT organization_id FROM profiles WHERE user_id = auth.uid()
    )
  ) AND (is_admin_or_supervisor(auth.uid()) OR is_super_admin(auth.uid()))
);