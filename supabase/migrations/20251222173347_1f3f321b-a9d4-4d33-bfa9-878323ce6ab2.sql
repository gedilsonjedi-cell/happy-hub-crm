-- Update RLS policies to allow super_admin to access all data

-- PROFILES: Allow super_admin to view all profiles
CREATE POLICY "Super admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (is_super_admin(auth.uid()));

-- USER_ROLES: Allow super_admin full access
CREATE POLICY "Super admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (is_super_admin(auth.uid()));

-- SECTORS: Allow super_admin full access
CREATE POLICY "Super admins can view all sectors"
ON public.sectors
FOR SELECT
TO authenticated
USING (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can insert sectors"
ON public.sectors
FOR INSERT
TO authenticated
WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update sectors"
ON public.sectors
FOR UPDATE
TO authenticated
USING (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete sectors"
ON public.sectors
FOR DELETE
TO authenticated
USING (is_super_admin(auth.uid()));

-- USER_SECTORS: Allow super_admin full access
CREATE POLICY "Super admins can view all user_sectors"
ON public.user_sectors
FOR SELECT
TO authenticated
USING (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can insert user_sectors"
ON public.user_sectors
FOR INSERT
TO authenticated
WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update user_sectors"
ON public.user_sectors
FOR UPDATE
TO authenticated
USING (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete user_sectors"
ON public.user_sectors
FOR DELETE
TO authenticated
USING (is_super_admin(auth.uid()));

-- DISPATCH_COSTS: Allow super_admin full access
CREATE POLICY "Super admins can view all costs"
ON public.dispatch_costs
FOR SELECT
TO authenticated
USING (is_super_admin(auth.uid()));

-- DISPATCH_PRICING: Allow super_admin full access (already has admin access, add super_admin)
CREATE POLICY "Super admins can insert pricing"
ON public.dispatch_pricing
FOR INSERT
TO authenticated
WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update pricing"
ON public.dispatch_pricing
FOR UPDATE
TO authenticated
USING (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete pricing"
ON public.dispatch_pricing
FOR DELETE
TO authenticated
USING (is_super_admin(auth.uid()));

-- CHANNELS: Allow super_admin to view all channels
CREATE POLICY "Super admins can view all channels"
ON public.channels
FOR SELECT
TO authenticated
USING (is_super_admin(auth.uid()));

-- LEADS: Allow super_admin to view all leads
CREATE POLICY "Super admins can view all leads"
ON public.leads
FOR SELECT
TO authenticated
USING (is_super_admin(auth.uid()));

-- CAMPAIGNS: Allow super_admin to view all campaigns
CREATE POLICY "Super admins can view all campaigns"
ON public.campaigns
FOR SELECT
TO authenticated
USING (is_super_admin(auth.uid()));

-- MESSAGE_TEMPLATES: Allow super_admin to view all templates
CREATE POLICY "Super admins can view all templates"
ON public.message_templates
FOR SELECT
TO authenticated
USING (is_super_admin(auth.uid()));