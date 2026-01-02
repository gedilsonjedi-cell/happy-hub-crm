-- Drop and recreate RLS policies with correct column reference
DROP POLICY IF EXISTS "Users can view their organization referral code" ON public.referral_codes;
DROP POLICY IF EXISTS "Users can create referral code for their organization" ON public.referral_codes;

-- Recreate with correct user_id reference
CREATE POLICY "Users can view their organization referral code"
ON public.referral_codes
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can create referral code for their organization"
ON public.referral_codes
FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- Also fix the referrals policy
DROP POLICY IF EXISTS "Users can view referrals where they are the referrer" ON public.referrals;

CREATE POLICY "Users can view referrals where they are the referrer"
ON public.referrals
FOR SELECT
USING (
  referrer_organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
);