
-- ============================================================
-- 1. CHANNELS: Revoke column-level SELECT for sensitive tokens
-- ============================================================
-- We can't revoke per-column via RLS easily, so we'll drop and recreate
-- the SELECT policy to exclude rows when sensitive columns are queried.
-- Better approach: use a security definer function for service role and
-- replace direct SELECT policy with one that returns NULL for secrets.

-- Create a security definer function for edge functions (service role) to
-- get a channel by api_token (used by send-whatsapp). This already exists
-- so we just ensure it stays available.
-- We'll simply ensure no client role can read the token columns by creating
-- a trigger-protected view and revoking column privileges.

REVOKE SELECT (access_token, api_token, meta_app_secret, webhook_verify_token)
  ON public.channels FROM anon, authenticated;

-- ============================================================
-- 2. AUTO_RECHARGE_CONFIG: Hide card_token and customer_id
-- ============================================================
REVOKE SELECT (card_token, customer_id)
  ON public.auto_recharge_config FROM anon, authenticated;

-- ============================================================
-- 3. USER_ROLES: Only super admins can grant admin role
-- ============================================================

-- Drop existing INSERT/UPDATE/DELETE policies that may allow admins to manage admin role
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_roles'
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_roles', pol.policyname);
  END LOOP;
END $$;

-- Super admins: full control
CREATE POLICY "Super admins manage all roles"
  ON public.user_roles FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Org admins: can only assign supervisor / atendente in their own org
CREATE POLICY "Admins assign non-admin roles in their org"
  ON public.user_roles FOR INSERT
  WITH CHECK (
    public.is_admin(auth.uid())
    AND role IN ('supervisor', 'atendente')
    AND public.user_in_same_organization(user_id)
  );

CREATE POLICY "Admins update non-admin roles in their org"
  ON public.user_roles FOR UPDATE
  USING (
    public.is_admin(auth.uid())
    AND role IN ('supervisor', 'atendente')
    AND public.user_in_same_organization(user_id)
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    AND role IN ('supervisor', 'atendente')
    AND public.user_in_same_organization(user_id)
  );

CREATE POLICY "Admins delete non-admin roles in their org"
  ON public.user_roles FOR DELETE
  USING (
    public.is_admin(auth.uid())
    AND role IN ('supervisor', 'atendente')
    AND public.user_in_same_organization(user_id)
  );

-- ============================================================
-- 4. PIPELINE_STAGES: Add organization_id scoping
-- ============================================================
ALTER TABLE public.pipeline_stages
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Backfill organization_id from the owner's profile
UPDATE public.pipeline_stages ps
SET organization_id = p.organization_id
FROM public.profiles p
WHERE ps.user_id = p.user_id AND ps.organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_organization_id
  ON public.pipeline_stages(organization_id);

-- Drop old user-scoped policies
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'pipeline_stages'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.pipeline_stages', pol.policyname);
  END LOOP;
END $$;

-- New organization-scoped policies
CREATE POLICY "Org members view pipeline stages"
  ON public.pipeline_stages FOR SELECT
  USING (
    public.is_super_admin(auth.uid())
    OR organization_id = public.get_user_organization_id(auth.uid())
  );

CREATE POLICY "Org members create pipeline stages"
  ON public.pipeline_stages FOR INSERT
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      organization_id = public.get_user_organization_id(auth.uid())
      AND auth.uid() = user_id
    )
  );

CREATE POLICY "Org admins update pipeline stages"
  ON public.pipeline_stages FOR UPDATE
  USING (
    public.is_super_admin(auth.uid())
    OR (
      organization_id = public.get_user_organization_id(auth.uid())
      AND (auth.uid() = user_id OR public.is_admin_or_supervisor(auth.uid()))
    )
  );

CREATE POLICY "Org admins delete pipeline stages"
  ON public.pipeline_stages FOR DELETE
  USING (
    public.is_super_admin(auth.uid())
    OR (
      organization_id = public.get_user_organization_id(auth.uid())
      AND (auth.uid() = user_id OR public.is_admin_or_supervisor(auth.uid()))
    )
  );
