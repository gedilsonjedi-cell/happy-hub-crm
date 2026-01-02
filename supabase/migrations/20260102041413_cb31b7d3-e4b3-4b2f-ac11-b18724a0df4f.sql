-- Create referral_codes table to store unique referral codes for each organization
CREATE TABLE public.referral_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code VARCHAR(20) NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT unique_org_referral UNIQUE (organization_id)
);

-- Create referrals table to track referral relationships and commissions
CREATE TABLE public.referrals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  referred_organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'converted', 'credited')),
  subscription_value DECIMAL(10,2),
  commission_percentage DECIMAL(5,2) NOT NULL DEFAULT 20.00,
  commission_amount DECIMAL(10,2),
  credited_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT unique_referred_org UNIQUE (referred_organization_id)
);

-- Enable RLS on both tables
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- RLS policies for referral_codes
CREATE POLICY "Users can view their organization referral code"
ON public.referral_codes
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can create referral code for their organization"
ON public.referral_codes
FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  )
);

-- RLS policies for referrals
CREATE POLICY "Users can view referrals where they are the referrer"
ON public.referrals
FOR SELECT
USING (
  referrer_organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  )
);

-- Function to generate unique referral code
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS VARCHAR(20) AS $$
DECLARE
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result VARCHAR(20) := '';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Function to get or create referral code for organization
CREATE OR REPLACE FUNCTION public.get_or_create_referral_code(org_id UUID)
RETURNS VARCHAR(20) AS $$
DECLARE
  existing_code VARCHAR(20);
  new_code VARCHAR(20);
BEGIN
  -- Check if code already exists
  SELECT code INTO existing_code FROM public.referral_codes WHERE organization_id = org_id;
  
  IF existing_code IS NOT NULL THEN
    RETURN existing_code;
  END IF;
  
  -- Generate new unique code
  LOOP
    new_code := public.generate_referral_code();
    BEGIN
      INSERT INTO public.referral_codes (organization_id, code) VALUES (org_id, new_code);
      RETURN new_code;
    EXCEPTION WHEN unique_violation THEN
      -- Code already exists, try again
      CONTINUE;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to process referral commission when subscription is paid
CREATE OR REPLACE FUNCTION public.process_referral_commission(
  referred_org_id UUID,
  subscription_amount DECIMAL(10,2)
)
RETURNS BOOLEAN AS $$
DECLARE
  referral_record RECORD;
  commission DECIMAL(10,2);
BEGIN
  -- Find pending referral for this organization
  SELECT * INTO referral_record 
  FROM public.referrals 
  WHERE referred_organization_id = referred_org_id 
    AND status = 'pending';
  
  IF referral_record IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Calculate commission (percentage of subscription value)
  commission := subscription_amount * (referral_record.commission_percentage / 100);
  
  -- Update referral record
  UPDATE public.referrals 
  SET 
    status = 'credited',
    subscription_value = subscription_amount,
    commission_amount = commission,
    credited_at = now(),
    updated_at = now()
  WHERE id = referral_record.id;
  
  -- Add credit to referrer's balance
  UPDATE public.organization_balance
  SET current_balance = current_balance + commission
  WHERE organization_id = referral_record.referrer_organization_id;
  
  -- If no balance record exists, create one
  IF NOT FOUND THEN
    INSERT INTO public.organization_balance (organization_id, current_balance)
    VALUES (referral_record.referrer_organization_id, commission);
  END IF;
  
  -- Record the transaction
  INSERT INTO public.balance_transactions (
    organization_id,
    amount,
    type,
    description,
    reference_type,
    reference_id
  ) VALUES (
    referral_record.referrer_organization_id,
    commission,
    'credit',
    'Comissão de indicação - ' || commission::TEXT || ' reais',
    'referral',
    referral_record.id::TEXT
  );
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to update updated_at
CREATE TRIGGER update_referrals_updated_at
BEFORE UPDATE ON public.referrals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for referrals table
ALTER PUBLICATION supabase_realtime ADD TABLE public.referrals;