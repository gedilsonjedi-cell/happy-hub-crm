-- Drop existing admin-only insert policy
DROP POLICY IF EXISTS "Admins can create sectors" ON public.sectors;

-- Create new policy that allows admins AND supervisors to create sectors
CREATE POLICY "Admins and supervisors can create sectors"
ON public.sectors
FOR INSERT
WITH CHECK (
  public.is_admin(auth.uid()) OR 
  public.is_admin_or_supervisor(auth.uid())
);