-- Drop existing webhooks policies
DROP POLICY IF EXISTS "Users can view webhooks from their organization" ON public.webhooks;
DROP POLICY IF EXISTS "Users can create webhooks for their organization" ON public.webhooks;
DROP POLICY IF EXISTS "Users can update webhooks from their organization" ON public.webhooks;
DROP POLICY IF EXISTS "Users can delete webhooks from their organization" ON public.webhooks;

-- Create new policies that allow super_admin to access all webhooks

-- SELECT: Users can view their org webhooks OR super_admin can view any
CREATE POLICY "Users can view webhooks from their organization"
ON public.webhooks
FOR SELECT
USING (
  organization_id = get_user_organization_id(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'super_admin'
  )
);

-- INSERT: Users can create webhooks for their org OR super_admin can create for any org
CREATE POLICY "Users can create webhooks for their organization"
ON public.webhooks
FOR INSERT
WITH CHECK (
  organization_id = get_user_organization_id(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'super_admin'
  )
);

-- UPDATE: Users can update their org webhooks OR super_admin can update any
CREATE POLICY "Users can update webhooks from their organization"
ON public.webhooks
FOR UPDATE
USING (
  organization_id = get_user_organization_id(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'super_admin'
  )
);

-- DELETE: Users can delete their org webhooks OR super_admin can delete any
CREATE POLICY "Users can delete webhooks from their organization"
ON public.webhooks
FOR DELETE
USING (
  organization_id = get_user_organization_id(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'super_admin'
  )
);