-- 1) Trigger: allow org admins to manage members of their own org; block self-assignment
CREATE OR REPLACE FUNCTION public.prevent_profile_org_self_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_org uuid;
BEGIN
  -- No authenticated end-user context (service role / definer onboarding flows)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Super admins may assign organizations freely
  IF public.is_super_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  actor_org := public.get_user_organization_id(auth.uid());

  IF TG_OP = 'INSERT' THEN
    IF NEW.organization_id IS NOT NULL THEN
      -- Self signup can never pick an organization; admins may only add to their own org
      IF NEW.user_id = auth.uid()
         OR NOT public.has_role(auth.uid(), 'admin')
         OR actor_org IS NULL
         OR NEW.organization_id IS DISTINCT FROM actor_org THEN
        RAISE EXCEPTION 'organization_id cannot be self-assigned';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    -- Only an admin of the same organization may move a member, and only within it
    IF NEW.user_id = auth.uid()
       OR NOT public.has_role(auth.uid(), 'admin')
       OR actor_org IS NULL
       OR NEW.organization_id IS DISTINCT FROM actor_org THEN
      RAISE EXCEPTION 'organization_id cannot be changed by the user';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 2) RLS: self-update may never change organization_id
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND organization_id IS NOT DISTINCT FROM public.get_user_organization_id(auth.uid())
);

-- 3) Secure RPC for privileged organization assignment
CREATE OR REPLACE FUNCTION public.set_profile_organization(_user_id uuid, _organization_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_org uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF public.is_super_admin(auth.uid()) THEN
    UPDATE public.profiles SET organization_id = _organization_id WHERE user_id = _user_id;
    RETURN;
  END IF;

  actor_org := public.get_user_organization_id(auth.uid());

  IF _user_id = auth.uid()
     OR NOT public.has_role(auth.uid(), 'admin')
     OR actor_org IS NULL
     OR _organization_id IS DISTINCT FROM actor_org THEN
    RAISE EXCEPTION 'insufficient privileges to set organization_id';
  END IF;

  UPDATE public.profiles SET organization_id = _organization_id WHERE user_id = _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_profile_organization(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.set_profile_organization(uuid, uuid) TO authenticated;