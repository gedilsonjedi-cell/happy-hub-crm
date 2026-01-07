-- Remove duplicate super admin policies for leads (now merged with org policies)
DROP POLICY IF EXISTS "Super admins can insert leads" ON public.leads;
DROP POLICY IF EXISTS "Super admins can update leads" ON public.leads;
DROP POLICY IF EXISTS "Super admins can delete leads" ON public.leads;
DROP POLICY IF EXISTS "Super admins can view all leads" ON public.leads;