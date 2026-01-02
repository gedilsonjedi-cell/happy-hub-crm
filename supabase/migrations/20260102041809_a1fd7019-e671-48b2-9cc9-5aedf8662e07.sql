-- Create pending_referrals table to handle timing issues
CREATE TABLE IF NOT EXISTS public.pending_referrals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  referrer_organization_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.pending_referrals ENABLE ROW LEVEL SECURITY;

-- Function to process pending referrals after organization is assigned
CREATE OR REPLACE FUNCTION public.process_pending_referral()
RETURNS TRIGGER AS $$
DECLARE
  pending RECORD;
BEGIN
  -- Only process if organization_id was just assigned
  IF NEW.organization_id IS NOT NULL AND (OLD.organization_id IS NULL OR OLD.organization_id != NEW.organization_id) THEN
    -- Check for pending referral
    SELECT * INTO pending
    FROM public.pending_referrals
    WHERE user_id = NEW.id;
    
    IF pending IS NOT NULL THEN
      -- Don't create referral if referrer and referred are the same org
      IF pending.referrer_organization_id != NEW.organization_id THEN
        -- Create the referral record
        INSERT INTO public.referrals (
          referrer_organization_id,
          referred_organization_id,
          referred_user_id,
          status
        ) VALUES (
          pending.referrer_organization_id,
          NEW.organization_id,
          NEW.id,
          'pending'
        )
        ON CONFLICT (referred_organization_id) DO NOTHING;
      END IF;
      
      -- Delete pending referral
      DELETE FROM public.pending_referrals WHERE id = pending.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to process pending referrals when profile is updated
DROP TRIGGER IF EXISTS process_pending_referral_trigger ON public.profiles;
CREATE TRIGGER process_pending_referral_trigger
AFTER UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.process_pending_referral();

-- Update handle_new_user_onboarding to process referral after org is created
CREATE OR REPLACE FUNCTION public.handle_new_user_onboarding()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id uuid;
  org_name text;
  org_slug text;
  meta_org_id text;
  trial_end_date timestamp with time zone;
  pending RECORD;
  referral_code_from_meta text;
  referrer_org_id uuid;
BEGIN
  -- Check if user was created by super admin with pre-assigned organization
  meta_org_id := NEW.raw_user_meta_data ->> 'organization_id';
  
  IF meta_org_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Check if user already has an organization
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = NEW.id AND organization_id IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  -- Get referral code from user metadata
  referral_code_from_meta := NEW.raw_user_meta_data ->> 'referral_code';
  
  IF referral_code_from_meta IS NOT NULL AND referral_code_from_meta != '' THEN
    SELECT organization_id INTO referrer_org_id
    FROM public.referral_codes
    WHERE code = referral_code_from_meta;
  END IF;

  -- Generate organization name and slug from email
  org_name := split_part(NEW.email, '@', 1) || '''s Organization';
  org_slug := lower(replace(split_part(NEW.email, '@', 1), '.', '-')) || '-' || substr(gen_random_uuid()::text, 1, 8);

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
  WHERE user_id = NEW.id;

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
      NEW.id,
      'pending'
    )
    ON CONFLICT (referred_organization_id) DO NOTHING;
  END IF;

  -- Assign admin role to the first user of the organization
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'admin')
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;