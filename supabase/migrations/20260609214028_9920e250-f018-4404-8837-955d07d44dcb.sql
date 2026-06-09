-- 1. Revoke column-level SELECT on sensitive card columns (auto_recharge_config) for authenticated
REVOKE SELECT (card_token, customer_id, card_last_four, card_brand, cardholder_name)
  ON public.auto_recharge_config FROM authenticated;
REVOKE SELECT (card_token, customer_id, card_last_four, card_brand, cardholder_name)
  ON public.auto_recharge_config FROM anon;

-- 2. Revoke column-level SELECT on token columns (channels) for authenticated
REVOKE SELECT (access_token, api_token, meta_app_secret, webhook_verify_token)
  ON public.channels FROM authenticated;
REVOKE SELECT (access_token, api_token, meta_app_secret, webhook_verify_token)
  ON public.channels FROM anon;

-- 3. Tighten user_sectors INSERT/UPDATE/DELETE policies: require admin AND same-organization scope
DROP POLICY IF EXISTS "Admins can manage user_sectors" ON public.user_sectors;
DROP POLICY IF EXISTS "Admins can insert user_sectors" ON public.user_sectors;
DROP POLICY IF EXISTS "Admins can update user_sectors" ON public.user_sectors;
DROP POLICY IF EXISTS "Admins can delete user_sectors" ON public.user_sectors;

CREATE POLICY "Admins can insert user_sectors in their org"
ON public.user_sectors
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.sectors s
    WHERE s.id = user_sectors.sector_id
      AND s.organization_id = public.get_user_organization_id(auth.uid())
  )
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = user_sectors.user_id
      AND p.organization_id = public.get_user_organization_id(auth.uid())
  )
);

CREATE POLICY "Admins can update user_sectors in their org"
ON public.user_sectors
FOR UPDATE
TO authenticated
USING (
  public.is_admin(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.sectors s
    WHERE s.id = user_sectors.sector_id
      AND s.organization_id = public.get_user_organization_id(auth.uid())
  )
)
WITH CHECK (
  public.is_admin(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.sectors s
    WHERE s.id = user_sectors.sector_id
      AND s.organization_id = public.get_user_organization_id(auth.uid())
  )
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = user_sectors.user_id
      AND p.organization_id = public.get_user_organization_id(auth.uid())
  )
);

CREATE POLICY "Admins can delete user_sectors in their org"
ON public.user_sectors
FOR DELETE
TO authenticated
USING (
  public.is_admin(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.sectors s
    WHERE s.id = user_sectors.sector_id
      AND s.organization_id = public.get_user_organization_id(auth.uid())
  )
);
