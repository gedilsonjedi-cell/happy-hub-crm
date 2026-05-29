
-- 1. Revoke column-level SELECT on sensitive card columns from authenticated/anon
REVOKE SELECT (card_token, customer_id) ON public.auto_recharge_config FROM authenticated;
REVOKE SELECT (card_token, customer_id) ON public.auto_recharge_config FROM anon;

-- 2. dispatch_costs: scope admin SELECT to their organization
DROP POLICY IF EXISTS "Admins can view all costs" ON public.dispatch_costs;
CREATE POLICY "Admins can view org costs"
ON public.dispatch_costs FOR SELECT
TO authenticated
USING (is_admin(auth.uid()) AND organization_id = get_user_organization_id(auth.uid()));

-- 3. sectors: scope admin SELECT to their organization
DROP POLICY IF EXISTS "Admins can view all sectors" ON public.sectors;
CREATE POLICY "Admins can view org sectors"
ON public.sectors FOR SELECT
TO authenticated
USING (is_admin(auth.uid()) AND organization_id = get_user_organization_id(auth.uid()));

-- 4. user_sectors: scope admin SELECT to their organization via sectors join
DROP POLICY IF EXISTS "Admins can view all user_sectors" ON public.user_sectors;
CREATE POLICY "Admins can view org user_sectors"
ON public.user_sectors FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.sectors s
    WHERE s.id = user_sectors.sector_id
      AND s.organization_id = get_user_organization_id(auth.uid())
  )
);

-- 5. welcome_message_sent: add explicit org-scoped SELECT policy for auditability
CREATE POLICY "Org members can view welcome_message_sent"
ON public.welcome_message_sent FOR SELECT
TO authenticated
USING (is_super_admin(auth.uid()) OR organization_id = get_user_organization_id(auth.uid()));
