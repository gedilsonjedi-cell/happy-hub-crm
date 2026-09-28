ALTER TABLE public.user_sectors
  ADD CONSTRAINT user_sectors_sector_id_fkey
  FOREIGN KEY (sector_id) REFERENCES public.sectors(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS user_isolation_all ON public.user_roles;

CREATE POLICY user_roles_select_scoped
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_super_admin(auth.uid())
  OR (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.profiles target_profile
      WHERE target_profile.user_id = user_roles.user_id
        AND target_profile.organization_id = public.get_user_organization_id(auth.uid())
    )
  )
);

CREATE POLICY user_roles_insert_admin_scoped
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (
    public.has_role(auth.uid(), 'admin')
    AND role <> 'super_admin'
    AND EXISTS (
      SELECT 1
      FROM public.profiles target_profile
      WHERE target_profile.user_id = user_roles.user_id
        AND target_profile.organization_id = public.get_user_organization_id(auth.uid())
    )
  )
);

CREATE POLICY user_roles_update_admin_scoped
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (
    public.has_role(auth.uid(), 'admin')
    AND EXISTS (
      SELECT 1
      FROM public.profiles target_profile
      WHERE target_profile.user_id = user_roles.user_id
        AND target_profile.organization_id = public.get_user_organization_id(auth.uid())
    )
  )
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (
    public.has_role(auth.uid(), 'admin')
    AND role <> 'super_admin'
    AND EXISTS (
      SELECT 1
      FROM public.profiles target_profile
      WHERE target_profile.user_id = user_roles.user_id
        AND target_profile.organization_id = public.get_user_organization_id(auth.uid())
    )
  )
);

CREATE POLICY user_roles_delete_admin_scoped
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (
    public.has_role(auth.uid(), 'admin')
    AND role <> 'super_admin'
    AND EXISTS (
      SELECT 1
      FROM public.profiles target_profile
      WHERE target_profile.user_id = user_roles.user_id
        AND target_profile.organization_id = public.get_user_organization_id(auth.uid())
    )
  )
);

DROP POLICY IF EXISTS user_isolation_all ON public.user_sectors;

CREATE POLICY user_sectors_select_scoped
ON public.user_sectors
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_super_admin(auth.uid())
  OR (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.profiles target_profile
      WHERE target_profile.user_id = user_sectors.user_id
        AND target_profile.organization_id = public.get_user_organization_id(auth.uid())
    )
  )
);

CREATE POLICY user_sectors_insert_admin_scoped
ON public.user_sectors
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (
    public.has_role(auth.uid(), 'admin')
    AND EXISTS (
      SELECT 1
      FROM public.profiles target_profile
      JOIN public.sectors target_sector ON target_sector.id = user_sectors.sector_id
      WHERE target_profile.user_id = user_sectors.user_id
        AND target_profile.organization_id = public.get_user_organization_id(auth.uid())
        AND target_sector.organization_id = target_profile.organization_id
    )
  )
);

CREATE POLICY user_sectors_delete_admin_scoped
ON public.user_sectors
FOR DELETE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (
    public.has_role(auth.uid(), 'admin')
    AND EXISTS (
      SELECT 1
      FROM public.profiles target_profile
      WHERE target_profile.user_id = user_sectors.user_id
        AND target_profile.organization_id = public.get_user_organization_id(auth.uid())
    )
  )
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
GRANT SELECT ON public.user_sectors TO authenticated;
GRANT INSERT, DELETE ON public.user_sectors TO authenticated;
GRANT ALL ON public.user_sectors TO service_role;

NOTIFY pgrst, 'reload schema';