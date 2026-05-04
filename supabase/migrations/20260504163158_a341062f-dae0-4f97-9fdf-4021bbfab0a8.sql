
-- 1) flow_sessions: add RLS policies scoped by organization via flow_bots
ALTER TABLE public.flow_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view flow sessions"
ON public.flow_sessions
FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.flow_bots fb
    WHERE fb.id = flow_sessions.flow_bot_id
      AND fb.organization_id = get_user_organization_id(auth.uid())
  )
);

CREATE POLICY "Org members can insert flow sessions"
ON public.flow_sessions
FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.flow_bots fb
    WHERE fb.id = flow_sessions.flow_bot_id
      AND fb.organization_id = get_user_organization_id(auth.uid())
  )
);

CREATE POLICY "Org members can update flow sessions"
ON public.flow_sessions
FOR UPDATE
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.flow_bots fb
    WHERE fb.id = flow_sessions.flow_bot_id
      AND fb.organization_id = get_user_organization_id(auth.uid())
  )
);

CREATE POLICY "Org members can delete flow sessions"
ON public.flow_sessions
FOR DELETE
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.flow_bots fb
    WHERE fb.id = flow_sessions.flow_bot_id
      AND fb.organization_id = get_user_organization_id(auth.uid())
  )
);

-- 2) user_roles: scope "Admins can view all roles" to same org only
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;

CREATE POLICY "Admins can view roles in their org"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid())
  AND user_in_same_organization(user_id)
);

-- 3) auto_recharge_config: prevent admins from writing/changing payment card fields.
-- Card data must only be written by backend service role (edge functions).
CREATE OR REPLACE FUNCTION public.protect_auto_recharge_card_data()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_role text;
BEGIN
  -- service_role bypasses RLS entirely; anon/authenticated must not change card fields
  BEGIN
    jwt_role := current_setting('request.jwt.claims', true)::jsonb->>'role';
  EXCEPTION WHEN OTHERS THEN
    jwt_role := NULL;
  END;

  IF jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.card_token := NULL;
    NEW.customer_id := NULL;
    NEW.card_last_four := NULL;
    NEW.card_brand := NULL;
    NEW.cardholder_name := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.card_token := OLD.card_token;
    NEW.customer_id := OLD.customer_id;
    NEW.card_last_four := OLD.card_last_four;
    NEW.card_brand := OLD.card_brand;
    NEW.cardholder_name := OLD.cardholder_name;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_auto_recharge_card_data_trg ON public.auto_recharge_config;
CREATE TRIGGER protect_auto_recharge_card_data_trg
BEFORE INSERT OR UPDATE ON public.auto_recharge_config
FOR EACH ROW
EXECUTE FUNCTION public.protect_auto_recharge_card_data();
