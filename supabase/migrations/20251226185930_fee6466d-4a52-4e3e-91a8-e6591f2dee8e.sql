-- Update the handle_new_user_onboarding function to skip when user is created by super admin
-- Check for organization_id in user metadata to know if user was manually assigned

CREATE OR REPLACE FUNCTION public.handle_new_user_onboarding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_org_id uuid;
  org_name text;
  org_slug text;
  meta_org_id text;
BEGIN
  -- Check if user was created by super admin with pre-assigned organization
  meta_org_id := NEW.raw_user_meta_data ->> 'organization_id';
  
  IF meta_org_id IS NOT NULL THEN
    -- User was created by super admin, skip auto-organization creation
    RETURN NEW;
  END IF;

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
$function$;