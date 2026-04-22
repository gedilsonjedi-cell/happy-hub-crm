-- ============================================================================
-- Security Hardening Migration
-- 1. Move WhatsApp credentials to a separate channel_secrets table
-- 2. Restrict channels table SELECT to admins/supervisors/owners
-- 3. Create channels_public view for atendentes (no secrets)
-- 4. Add proper RLS policies for pending_referrals
-- 5. Scope user_roles admin operations to same organization
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CHANNEL SECRETS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.channel_secrets (
  channel_id uuid PRIMARY KEY REFERENCES public.channels(id) ON DELETE CASCADE,
  access_token text,
  api_token text,
  meta_app_secret text,
  webhook_verify_token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.channel_secrets ENABLE ROW LEVEL SECURITY;

-- Only admins/supervisors/super_admin/channel-owner can read secrets
CREATE POLICY "Channel admins can view secrets"
ON public.channel_secrets
FOR SELECT
USING (
  is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.channels c
    WHERE c.id = channel_secrets.channel_id
      AND c.organization_id = get_user_organization_id(auth.uid())
      AND (c.user_id = auth.uid() OR is_admin_or_supervisor(auth.uid()))
  )
);

CREATE POLICY "Channel admins can insert secrets"
ON public.channel_secrets
FOR INSERT
WITH CHECK (
  is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.channels c
    WHERE c.id = channel_secrets.channel_id
      AND c.organization_id = get_user_organization_id(auth.uid())
      AND (c.user_id = auth.uid() OR is_admin_or_supervisor(auth.uid()))
  )
);

CREATE POLICY "Channel admins can update secrets"
ON public.channel_secrets
FOR UPDATE
USING (
  is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.channels c
    WHERE c.id = channel_secrets.channel_id
      AND c.organization_id = get_user_organization_id(auth.uid())
      AND (c.user_id = auth.uid() OR is_admin_or_supervisor(auth.uid()))
  )
);

CREATE POLICY "Channel admins can delete secrets"
ON public.channel_secrets
FOR DELETE
USING (
  is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.channels c
    WHERE c.id = channel_secrets.channel_id
      AND c.organization_id = get_user_organization_id(auth.uid())
      AND (c.user_id = auth.uid() OR is_admin_or_supervisor(auth.uid()))
  )
);

-- Backfill existing data
INSERT INTO public.channel_secrets (channel_id, access_token, api_token, meta_app_secret, webhook_verify_token)
SELECT id, access_token, api_token, meta_app_secret, webhook_verify_token
FROM public.channels
ON CONFLICT (channel_id) DO NOTHING;

-- Trigger: keep channel_secrets in sync with channels token columns
-- (so existing edge functions reading channels.access_token continue to work
--  during the transition; both sources stay equal)
CREATE OR REPLACE FUNCTION public.sync_channel_to_channel_secrets()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.channel_secrets (channel_id, access_token, api_token, meta_app_secret, webhook_verify_token)
    VALUES (NEW.id, NEW.access_token, NEW.api_token, NEW.meta_app_secret, NEW.webhook_verify_token)
    ON CONFLICT (channel_id) DO UPDATE SET
      access_token = EXCLUDED.access_token,
      api_token = EXCLUDED.api_token,
      meta_app_secret = EXCLUDED.meta_app_secret,
      webhook_verify_token = EXCLUDED.webhook_verify_token,
      updated_at = now();
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.access_token IS DISTINCT FROM OLD.access_token
       OR NEW.api_token IS DISTINCT FROM OLD.api_token
       OR NEW.meta_app_secret IS DISTINCT FROM OLD.meta_app_secret
       OR NEW.webhook_verify_token IS DISTINCT FROM OLD.webhook_verify_token THEN
      INSERT INTO public.channel_secrets (channel_id, access_token, api_token, meta_app_secret, webhook_verify_token)
      VALUES (NEW.id, NEW.access_token, NEW.api_token, NEW.meta_app_secret, NEW.webhook_verify_token)
      ON CONFLICT (channel_id) DO UPDATE SET
        access_token = EXCLUDED.access_token,
        api_token = EXCLUDED.api_token,
        meta_app_secret = EXCLUDED.meta_app_secret,
        webhook_verify_token = EXCLUDED.webhook_verify_token,
        updated_at = now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_channel_to_channel_secrets ON public.channels;
CREATE TRIGGER trg_sync_channel_to_channel_secrets
AFTER INSERT OR UPDATE ON public.channels
FOR EACH ROW
EXECUTE FUNCTION public.sync_channel_to_channel_secrets();

-- ----------------------------------------------------------------------------
-- 2. CHANNELS_PUBLIC VIEW (safe subset for atendentes)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.channels_public
WITH (security_invoker = true)
AS
SELECT
  id,
  user_id,
  organization_id,
  name,
  phone,
  provider,
  app_name,
  waba_id,
  connected,
  created_at,
  updated_at
FROM public.channels;

GRANT SELECT ON public.channels_public TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. RESTRICT channels TABLE SELECT to admins/supervisors/owners
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Organization members can view channels" ON public.channels;

CREATE POLICY "Organization admins can view channels"
ON public.channels
FOR SELECT
USING (
  is_super_admin(auth.uid())
  OR (
    organization_id = get_user_organization_id(auth.uid())
    AND (auth.uid() = user_id OR is_admin_or_supervisor(auth.uid()))
  )
);

-- ----------------------------------------------------------------------------
-- 4. PENDING REFERRALS — explicit policies (table has no policies but RLS on)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='pending_referrals') THEN

    EXECUTE 'ALTER TABLE public.pending_referrals ENABLE ROW LEVEL SECURITY';

    -- Drop any existing policies to ensure clean slate
    EXECUTE 'DROP POLICY IF EXISTS "Users can view their own pending referrals" ON public.pending_referrals';
    EXECUTE 'DROP POLICY IF EXISTS "Super admins can manage pending referrals" ON public.pending_referrals';
    EXECUTE 'DROP POLICY IF EXISTS "Referrers can view their pending referrals" ON public.pending_referrals';

    -- Users can see their own pending referral record
    EXECUTE $POL$
      CREATE POLICY "Users can view their own pending referrals"
      ON public.pending_referrals
      FOR SELECT
      USING (user_id = auth.uid())
    $POL$;

    -- Referrer organization members can view referrals targeted at their org
    EXECUTE $POL$
      CREATE POLICY "Referrers can view their pending referrals"
      ON public.pending_referrals
      FOR SELECT
      USING (referrer_organization_id = get_user_organization_id(auth.uid()))
    $POL$;

    -- Only super_admins can manage (insert/update/delete) directly;
    -- normal flow is via SECURITY DEFINER functions / service_role
    EXECUTE $POL$
      CREATE POLICY "Super admins can manage pending referrals"
      ON public.pending_referrals
      FOR ALL
      USING (is_super_admin(auth.uid()))
      WITH CHECK (is_super_admin(auth.uid()))
    $POL$;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 5. USER_ROLES — scope admin operations to same organization
-- ----------------------------------------------------------------------------
-- Helper: same-organization check (security definer to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.user_in_same_organization(_target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p1
    JOIN public.profiles p2 ON p2.organization_id = p1.organization_id
    WHERE p1.user_id = auth.uid()
      AND p2.user_id = _target_user_id
      AND p1.organization_id IS NOT NULL
  );
$$;

DROP POLICY IF EXISTS "Admins can update roles (no super_admin)" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles (no super_admin)" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can create roles (no super_admin)" ON public.user_roles;

-- INSERT: admin must belong to same org as target user; cannot grant super_admin
CREATE POLICY "Admins can create roles (same org, no super_admin)"
ON public.user_roles
FOR INSERT
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    is_admin(auth.uid())
    AND public.user_in_same_organization(user_id)
    AND role <> 'super_admin'::app_role
  )
);

-- UPDATE: admin must belong to same org as target user; cannot promote to super_admin
CREATE POLICY "Admins can update roles (same org, no super_admin)"
ON public.user_roles
FOR UPDATE
USING (
  is_super_admin(auth.uid())
  OR (
    is_admin(auth.uid())
    AND public.user_in_same_organization(user_id)
    AND role <> 'super_admin'::app_role
  )
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    is_admin(auth.uid())
    AND public.user_in_same_organization(user_id)
    AND role <> 'super_admin'::app_role
  )
);

-- DELETE: admin must belong to same org as target user; cannot remove super_admin
CREATE POLICY "Admins can delete roles (same org, no super_admin)"
ON public.user_roles
FOR DELETE
USING (
  is_super_admin(auth.uid())
  OR (
    is_admin(auth.uid())
    AND public.user_in_same_organization(user_id)
    AND role <> 'super_admin'::app_role
  )
);
