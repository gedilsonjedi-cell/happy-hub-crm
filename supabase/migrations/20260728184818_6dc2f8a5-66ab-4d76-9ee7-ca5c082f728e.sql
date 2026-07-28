ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS auto_distribute_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_sector_id uuid REFERENCES public.sectors(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.set_org_default_sector(
  _organization_id uuid,
  _sector_id uuid,
  _enabled boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_super_admin(auth.uid())
          OR (public.has_role(auth.uid(), 'admin')
              AND public.get_user_organization_id(auth.uid()) = _organization_id)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF _sector_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.sectors s
    WHERE s.id = _sector_id AND s.organization_id = _organization_id
  ) THEN
    RAISE EXCEPTION 'sector does not belong to organization';
  END IF;

  UPDATE public.organizations
  SET default_sector_id = _sector_id,
      auto_distribute_enabled = COALESCE(_enabled, false),
      updated_at = now()
  WHERE id = _organization_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_org_default_sector(uuid, uuid, boolean) TO authenticated;