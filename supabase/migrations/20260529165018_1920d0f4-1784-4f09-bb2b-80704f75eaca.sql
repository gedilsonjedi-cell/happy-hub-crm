CREATE OR REPLACE FUNCTION public.is_sector_in_user_organization(_sector_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sectors s
    WHERE s.id = _sector_id
      AND s.organization_id = public.get_user_organization_id(_user_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_sector_in_user_organization(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_sector_in_user_organization(uuid, uuid) TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sectors TO authenticated;
GRANT ALL ON public.sectors TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_sectors TO authenticated;
GRANT ALL ON public.user_sectors TO service_role;

DROP POLICY IF EXISTS "Users can view their assigned sectors" ON public.sectors;
DROP POLICY IF EXISTS "Admins can view org user_sectors" ON public.user_sectors;
DROP POLICY IF EXISTS "Org members can view user_sectors" ON public.user_sectors;

CREATE POLICY "Org members can view user_sectors"
ON public.user_sectors
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR user_id = auth.uid()
  OR public.is_sector_in_user_organization(sector_id, auth.uid())
);