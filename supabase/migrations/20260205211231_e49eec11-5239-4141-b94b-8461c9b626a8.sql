-- Add custom subscription price field to organizations
-- When set, this overrides ALL automatic price calculations (base + users + channels)
ALTER TABLE public.organizations
ADD COLUMN custom_subscription_price numeric DEFAULT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.organizations.custom_subscription_price IS 'When set, this fixed price is used for subscription renewals instead of calculated price (base + addons)';
