-- Fix the handle_new_user_onboarding function to properly access user metadata
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
  trial_end_date timestamp with time zone;
  pending RECORD;
  referral_code_from_meta text;
  referrer_org_id uuid;
  user_email text;
  user_metadata jsonb;
BEGIN
  -- Fetch user data from auth.users since NEW refers to profiles table
  SELECT email, raw_user_meta_data INTO user_email, user_metadata
  FROM auth.users
  WHERE id = NEW.user_id;
  
  -- Check if user was created by super admin with pre-assigned organization
  meta_org_id := user_metadata ->> 'organization_id';
  
  IF meta_org_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Check if user already has an organization
  IF NEW.organization_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Get referral code from user metadata
  referral_code_from_meta := user_metadata ->> 'referral_code';
  
  IF referral_code_from_meta IS NOT NULL AND referral_code_from_meta != '' THEN
    SELECT organization_id INTO referrer_org_id
    FROM public.referral_codes
    WHERE code = referral_code_from_meta;
  END IF;

  -- Generate organization name and slug from email
  org_name := split_part(user_email, '@', 1) || '''s Organization';
  org_slug := lower(replace(split_part(user_email, '@', 1), '.', '-')) || '-' || substr(gen_random_uuid()::text, 1, 8);

  -- Calculate trial end date (7 days from now)
  trial_end_date := now() + interval '7 days';

  -- Create new organization with 7 days trial
  INSERT INTO public.organizations (
    name, 
    slug, 
    plan, 
    subscription_status,
    subscription_started_at,
    subscription_ends_at
  )
  VALUES (
    org_name, 
    org_slug, 
    'free', 
    'trial',
    now(),
    trial_end_date
  )
  RETURNING id INTO new_org_id;

  -- Update profile with organization_id
  UPDATE public.profiles 
  SET organization_id = new_org_id 
  WHERE user_id = NEW.user_id;

  -- Create referral if we found a valid referrer
  IF referrer_org_id IS NOT NULL AND referrer_org_id != new_org_id THEN
    INSERT INTO public.referrals (
      referrer_organization_id,
      referred_organization_id,
      referred_user_id,
      status
    ) VALUES (
      referrer_org_id,
      new_org_id,
      NEW.user_id,
      'pending'
    )
    ON CONFLICT (referred_organization_id) DO NOTHING;
  END IF;

  -- Assign admin role to the first user of the organization
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Create organization balance with R$10 bonus
  INSERT INTO public.organization_balance (organization_id, balance, total_credits_added)
  VALUES (new_org_id, 10.00, 10.00);

  -- Record the bonus transaction
  INSERT INTO public.balance_transactions (
    organization_id,
    type,
    amount,
    balance_before,
    balance_after,
    description
  )
  VALUES (
    new_org_id,
    'credit',
    10.00,
    0,
    10.00,
    'Bônus de boas-vindas'
  );

  RETURN NEW;
END;
$function$;