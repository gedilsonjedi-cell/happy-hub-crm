-- Create subscription pricing configuration table
CREATE TABLE public.subscription_pricing (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  base_price numeric NOT NULL DEFAULT 299.00,
  price_per_user numeric NOT NULL DEFAULT 85.00,
  price_per_channel numeric NOT NULL DEFAULT 85.00,
  included_users integer NOT NULL DEFAULT 1,
  included_channels integer NOT NULL DEFAULT 1,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.subscription_pricing ENABLE ROW LEVEL SECURITY;

-- Everyone can view pricing
CREATE POLICY "Everyone can view subscription pricing"
ON public.subscription_pricing
FOR SELECT
USING (true);

-- Only super admins can modify pricing
CREATE POLICY "Super admins can update subscription pricing"
ON public.subscription_pricing
FOR UPDATE
USING (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can insert subscription pricing"
ON public.subscription_pricing
FOR INSERT
WITH CHECK (is_super_admin(auth.uid()));

-- Insert default pricing
INSERT INTO public.subscription_pricing (base_price, price_per_user, price_per_channel, included_users, included_channels)
VALUES (299.00, 85.00, 85.00, 1, 1);

-- Remove the plan column from organizations since we're using a single plan model
-- Keep max_users and max_channels for tracking what each org has contracted