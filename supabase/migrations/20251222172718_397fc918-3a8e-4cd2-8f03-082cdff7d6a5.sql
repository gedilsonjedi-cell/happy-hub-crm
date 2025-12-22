-- Create trigger function to handle new user onboarding
CREATE OR REPLACE FUNCTION public.handle_new_user_onboarding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id uuid;
  org_name text;
  org_slug text;
BEGIN
  -- Check if user already has an organization
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = NEW.id AND organization_id IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  -- Generate organization name and slug from email
  org_name := split_part(NEW.email, '@', 1) || '''s Organization';
  org_slug := lower(replace(split_part(NEW.email, '@', 1), '.', '-')) || '-' || substr(gen_random_uuid()::text, 1, 8);

  -- Create new organization
  INSERT INTO public.organizations (name, slug, plan, subscription_status)
  VALUES (org_name, org_slug, 'free', 'trial')
  RETURNING id INTO new_org_id;

  -- Update profile with organization_id
  UPDATE public.profiles 
  SET organization_id = new_org_id 
  WHERE user_id = NEW.id;

  -- Assign admin role to the first user of the organization
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Create trigger that runs after profile is created (which happens after user signup)
DROP TRIGGER IF EXISTS on_profile_created_onboarding ON public.profiles;
CREATE TRIGGER on_profile_created_onboarding
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_onboarding();

-- Also handle case where profile already exists (for existing users)
-- This can be triggered manually or by updating the profile