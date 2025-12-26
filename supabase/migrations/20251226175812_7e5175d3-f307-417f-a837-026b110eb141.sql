-- Drop existing policy and create separate policies for better control
DROP POLICY IF EXISTS "Admins can manage sequences" ON public.follow_up_sequences;

-- Create policy for SELECT
CREATE POLICY "Admins can view sequences" 
ON public.follow_up_sequences 
FOR SELECT 
USING (
  organization_id IN (
    SELECT organization_id FROM profiles WHERE user_id = auth.uid()
  )
);

-- Create policy for INSERT (admins/supervisors only)
CREATE POLICY "Admins can insert sequences" 
ON public.follow_up_sequences 
FOR INSERT 
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM profiles WHERE user_id = auth.uid()
  ) AND is_admin_or_supervisor(auth.uid())
);

-- Create policy for UPDATE (admins/supervisors only)
CREATE POLICY "Admins can update sequences" 
ON public.follow_up_sequences 
FOR UPDATE 
USING (
  organization_id IN (
    SELECT organization_id FROM profiles WHERE user_id = auth.uid()
  ) AND is_admin_or_supervisor(auth.uid())
);

-- Create policy for DELETE (admins/supervisors only)
CREATE POLICY "Admins can delete sequences" 
ON public.follow_up_sequences 
FOR DELETE 
USING (
  organization_id IN (
    SELECT organization_id FROM profiles WHERE user_id = auth.uid()
  ) AND is_admin_or_supervisor(auth.uid())
);