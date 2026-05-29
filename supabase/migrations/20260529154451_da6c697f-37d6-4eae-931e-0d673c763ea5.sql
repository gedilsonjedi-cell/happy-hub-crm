
-- Restaurar visibilidade dos setores/departamentos para todos os membros da organização
-- A migração anterior restringiu a SELECT apenas para admins, quebrando atendentes/supervisores

-- sectors: qualquer membro autenticado da própria organização pode ler
DROP POLICY IF EXISTS "Admins can view sectors in their organization" ON public.sectors;
DROP POLICY IF EXISTS "Admins can view all sectors" ON public.sectors;
DROP POLICY IF EXISTS "Org members can view sectors" ON public.sectors;

CREATE POLICY "Org members can view sectors"
ON public.sectors
FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR organization_id = get_user_organization_id(auth.uid())
);

-- user_sectors: membros podem ler vínculos da própria organização
DROP POLICY IF EXISTS "Admins can view user_sectors in their organization" ON public.user_sectors;
DROP POLICY IF EXISTS "Admins can view all user_sectors" ON public.user_sectors;
DROP POLICY IF EXISTS "Org members can view user_sectors" ON public.user_sectors;

CREATE POLICY "Org members can view user_sectors"
ON public.user_sectors
FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.sectors s
    WHERE s.id = user_sectors.sector_id
      AND s.organization_id = get_user_organization_id(auth.uid())
  )
);
