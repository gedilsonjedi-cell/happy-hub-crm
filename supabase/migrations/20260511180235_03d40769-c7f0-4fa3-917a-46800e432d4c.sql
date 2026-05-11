
-- 1) Harden is_admin_or_supervisor to scope cross-user checks to caller's org
CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller_org uuid;
  _target_org uuid;
BEGIN
  IF _user_id = auth.uid() THEN
    RETURN _resolve_auth_role() IN ('admin', 'supervisor', 'super_admin');
  END IF;

  -- Cross-user check: only allow when target belongs to caller's org
  -- (super_admin bypass)
  IF EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin') THEN
    RETURN EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
    );
  END IF;

  SELECT organization_id INTO _caller_org FROM profiles WHERE user_id = auth.uid();
  SELECT organization_id INTO _target_org FROM profiles WHERE user_id = _user_id;

  IF _caller_org IS NULL OR _target_org IS NULL OR _caller_org <> _target_org THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
  );
END;
$function$;

-- 2) Add explicit WITH CHECK to conversation_memory ALL policy
DROP POLICY IF EXISTS "Organization members can manage conversation memory" ON public.conversation_memory;
CREATE POLICY "Organization members can manage conversation memory"
ON public.conversation_memory
FOR ALL
TO authenticated
USING (organization_id = get_user_organization_id(auth.uid()))
WITH CHECK (organization_id = get_user_organization_id(auth.uid()));
