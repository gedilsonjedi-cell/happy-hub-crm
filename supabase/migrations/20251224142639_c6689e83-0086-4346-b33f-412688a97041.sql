-- Add promotional price and is_first_subscription columns
ALTER TABLE subscription_pricing 
ADD COLUMN IF NOT EXISTS promotional_price numeric NOT NULL DEFAULT 129.90;

-- Update base_price to 229.90
UPDATE subscription_pricing SET base_price = 229.90, promotional_price = 129.90;

-- Add is_first_subscription to organizations to track if they've ever paid
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS has_paid_first_subscription boolean NOT NULL DEFAULT false;