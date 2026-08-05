-- 1. attendant_availability: enforce org scope on insert/update
DROP POLICY IF EXISTS "Users can insert their own availability" ON public.attendant_availability;
CREATE POLICY "Users can insert their own availability"
ON public.attendant_availability
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND organization_id IS NOT DISTINCT FROM public.get_user_organization_id(auth.uid())
);

DROP POLICY IF EXISTS "Users can update their own availability" ON public.attendant_availability;
CREATE POLICY "Users can update their own availability"
ON public.attendant_availability
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND organization_id IS NOT DISTINCT FROM public.get_user_organization_id(auth.uid())
);

-- 2. chatbot_config: enforce org scope on insert/update
DROP POLICY IF EXISTS "Users can insert their chatbot config" ON public.chatbot_config;
CREATE POLICY "Users can insert their chatbot config"
ON public.chatbot_config
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND organization_id IS NOT DISTINCT FROM public.get_user_organization_id(auth.uid())
);

DROP POLICY IF EXISTS "Users can update their chatbot config" ON public.chatbot_config;
CREATE POLICY "Users can update their chatbot config"
ON public.chatbot_config
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND organization_id IS NOT DISTINCT FROM public.get_user_organization_id(auth.uid())
);

-- 3. profiles: block self-assignment of organization_id
CREATE OR REPLACE FUNCTION public.prevent_profile_org_self_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- No authenticated end-user context (service role / definer onboarding flows)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Super admins may assign organizations freely
  IF public.is_super_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.organization_id IS NOT NULL AND NEW.user_id = auth.uid() THEN
      RAISE EXCEPTION 'organization_id cannot be self-assigned';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'organization_id cannot be changed by the user';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_org_self_assignment ON public.profiles;
CREATE TRIGGER trg_prevent_profile_org_self_assignment
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_org_self_assignment();