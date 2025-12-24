-- Create table to track recurring add-ons per organization
CREATE TABLE public.organization_addons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.store_products(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  price_per_unit NUMERIC NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.organization_addons ENABLE ROW LEVEL SECURITY;

-- Users can view their organization's add-ons
CREATE POLICY "Users can view their organization addons"
ON public.organization_addons
FOR SELECT
USING (organization_id = get_user_organization_id(auth.uid()));

-- Super admins can view all add-ons
CREATE POLICY "Super admins can view all addons"
ON public.organization_addons
FOR SELECT
USING (is_super_admin(auth.uid()));

-- System can manage add-ons (for purchase function)
CREATE POLICY "System can manage addons"
ON public.organization_addons
FOR ALL
USING (true);

-- Add index for faster lookups
CREATE INDEX idx_organization_addons_org_id ON public.organization_addons(organization_id);
CREATE INDEX idx_organization_addons_active ON public.organization_addons(organization_id, is_active);

-- Update the purchase_product function to also create recurring add-ons
CREATE OR REPLACE FUNCTION public.purchase_product(
  _organization_id UUID,
  _product_id UUID,
  _quantity INTEGER DEFAULT 1
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _product RECORD;
  _total_amount NUMERIC;
  _has_balance BOOLEAN;
  _is_subscription BOOLEAN;
  _is_addon BOOLEAN;
BEGIN
  -- Get product details
  SELECT * INTO _product FROM store_products WHERE id = _product_id AND is_active = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found or inactive';
  END IF;
  
  -- Check if it's a subscription product
  _is_subscription := _product.product_type = 'subscription';
  
  -- Check if it's an add-on product (users, channels, etc.)
  _is_addon := _product.name ILIKE '%usuário%' OR _product.name ILIKE '%canal%' OR _product.name ILIKE '%adicional%';
  
  -- Subscriptions must have quantity 1
  IF _is_subscription AND _quantity != 1 THEN
    _quantity := 1;
  END IF;
  
  -- Calculate total amount
  _total_amount := _product.price * _quantity;
  
  -- Check if organization has enough balance
  SELECT check_organization_balance(_total_amount, _organization_id) INTO _has_balance;
  
  IF NOT _has_balance THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;
  
  -- Create purchase record
  INSERT INTO store_purchases (organization_id, product_id, amount, quantity, status, purchased_at)
  VALUES (_organization_id, _product_id, _total_amount, _quantity, 'completed', now());
  
  -- Debit balance
  PERFORM debit_organization_balance(_total_amount, 'Compra: ' || _product.name || ' x' || _quantity, _organization_id, _product_id::TEXT, 'store_purchase');
  
  -- Handle subscription products
  IF _is_subscription THEN
    UPDATE organizations
    SET subscription_paid_until = COALESCE(subscription_paid_until, now()) + INTERVAL '30 days',
        subscription_status = 'active',
        updated_at = now()
    WHERE id = _organization_id;
  END IF;
  
  -- Handle add-on products - create or update recurring add-on
  IF _is_addon AND NOT _is_subscription THEN
    -- Check if there's already an active add-on for this product
    IF EXISTS (SELECT 1 FROM organization_addons WHERE organization_id = _organization_id AND product_id = _product_id AND is_active = true) THEN
      -- Update quantity
      UPDATE organization_addons
      SET quantity = quantity + _quantity,
          updated_at = now()
      WHERE organization_id = _organization_id AND product_id = _product_id AND is_active = true;
    ELSE
      -- Create new add-on
      INSERT INTO organization_addons (organization_id, product_id, quantity, price_per_unit, is_active)
      VALUES (_organization_id, _product_id, _quantity, _product.price, true);
    END IF;
    
    -- Update max_users if it's a user add-on
    IF _product.name ILIKE '%usuário%' THEN
      UPDATE organizations
      SET max_users = COALESCE(max_users, 1) + _quantity,
          updated_at = now()
      WHERE id = _organization_id;
    END IF;
    
    -- Update max_channels if it's a channel add-on
    IF _product.name ILIKE '%canal%' THEN
      UPDATE organizations
      SET max_channels = COALESCE(max_channels, 1) + _quantity,
          updated_at = now()
      WHERE id = _organization_id;
    END IF;
  END IF;
  
  RETURN TRUE;
END;
$$;

-- Function to cancel an add-on
CREATE OR REPLACE FUNCTION public.cancel_addon(
  _addon_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _addon RECORD;
  _product RECORD;
BEGIN
  -- Get add-on details
  SELECT * INTO _addon FROM organization_addons WHERE id = _addon_id AND is_active = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Add-on not found or already cancelled';
  END IF;
  
  -- Get product details
  SELECT * INTO _product FROM store_products WHERE id = _addon.product_id;
  
  -- Mark add-on as cancelled
  UPDATE organization_addons
  SET is_active = false,
      cancelled_at = now(),
      updated_at = now()
  WHERE id = _addon_id;
  
  -- Decrease max_users if it's a user add-on
  IF _product.name ILIKE '%usuário%' THEN
    UPDATE organizations
    SET max_users = GREATEST(1, COALESCE(max_users, 1) - _addon.quantity),
        updated_at = now()
    WHERE id = _addon.organization_id;
  END IF;
  
  -- Decrease max_channels if it's a channel add-on
  IF _product.name ILIKE '%canal%' THEN
    UPDATE organizations
    SET max_channels = GREATEST(1, COALESCE(max_channels, 1) - _addon.quantity),
        updated_at = now()
    WHERE id = _addon.organization_id;
  END IF;
  
  RETURN TRUE;
END;
$$;

-- Function to calculate total subscription cost (plan + add-ons)
CREATE OR REPLACE FUNCTION public.calculate_subscription_total(
  _organization_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _base_price NUMERIC;
  _addons_total NUMERIC;
BEGIN
  -- Get base subscription price
  SELECT base_price INTO _base_price FROM subscription_pricing LIMIT 1;
  
  -- Calculate add-ons total
  SELECT COALESCE(SUM(quantity * price_per_unit), 0) INTO _addons_total
  FROM organization_addons
  WHERE organization_id = _organization_id AND is_active = true;
  
  RETURN COALESCE(_base_price, 0) + _addons_total;
END;
$$;