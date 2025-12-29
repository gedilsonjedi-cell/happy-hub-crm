-- Desativar preço promocional (deixar zerado para indicar que não há promoção)
UPDATE public.subscription_pricing 
SET promotional_price = 0, updated_at = now();

-- Atualizar a função de onboarding para dar 7 dias de trial e R$10 de saldo bônus
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
$function$;