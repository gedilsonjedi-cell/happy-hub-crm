
-- Fix the handle_new_user_onboarding function to properly check for organization_id in metadata
-- The issue is that when a user is created via edge function with organization_id in metadata,
-- the trigger still creates a new organization because it only checks NEW.organization_id which is NULL at insert time

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
  
  -- Check if user was created by admin with pre-assigned organization in metadata
  meta_org_id := user_metadata ->> 'organization_id';
  
  -- If organization_id is in metadata, this user was created by an admin
  -- Skip creating a new organization - the edge function will set the org
  IF meta_org_id IS NOT NULL AND meta_org_id != '' THEN
    RETURN NEW;
  END IF;

  -- Check if user already has an organization assigned in the profile
  IF NEW.organization_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  
  -- Also check if there's already a profile with organization for this user
  -- (in case of race condition or update trigger)
  IF EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = NEW.user_id 
    AND organization_id IS NOT NULL
  ) THEN
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
$$;
