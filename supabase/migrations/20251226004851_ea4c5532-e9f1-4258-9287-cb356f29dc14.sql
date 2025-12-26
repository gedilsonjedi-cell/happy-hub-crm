-- Add partner plan configuration
-- Partners don't pay subscription, only pay for additional resources

-- Update status config to include partner status
ALTER TABLE organizations 
  ADD COLUMN IF NOT EXISTS is_partner BOOLEAN DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN organizations.is_partner IS 'Partner organizations do not pay subscription automatically, only pay for additional products/resources manually';

-- Create a function to manually add products to an organization (for super admin use)
CREATE OR REPLACE FUNCTION public.admin_add_product_to_organization(
  _organization_id uuid,
  _product_id uuid,
  _quantity integer DEFAULT 1,
  _is_free boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _product RECORD;
  _total_amount NUMERIC;
BEGIN
  -- Get product details
  SELECT * INTO _product FROM store_products WHERE id = _product_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;
  
  -- Calculate total (0 if free)
  _total_amount := CASE WHEN _is_free THEN 0 ELSE _product.price * _quantity END;
  
  -- Create purchase record
  INSERT INTO store_purchases (organization_id, product_id, amount, quantity, status, purchased_at)
  VALUES (_organization_id, _product_id, _total_amount, _quantity, 'completed', now());
  
  -- If it's a paid purchase, debit balance
  IF NOT _is_free AND _total_amount > 0 THEN
    PERFORM debit_organization_balance(
      _organization_id,
      _total_amount,
      'Compra manual (admin): ' || _product.name || ' x' || _quantity,
      'admin_purchase',
      _product_id::text
    );
  END IF;
  
  -- Handle subscription products
  IF _product.product_type = 'subscription' THEN
    UPDATE organizations
    SET subscription_paid_until = COALESCE(subscription_paid_until, now()) + INTERVAL '30 days',
        subscription_status = 'active',
        updated_at = now()
    WHERE id = _organization_id;
  END IF;
  
  -- Handle add-on products - create or update recurring add-on
  IF _product.name ILIKE '%usuário%' OR _product.name ILIKE '%canal%' OR _product.name ILIKE '%adicional%' THEN
    -- Check if there's already an active add-on for this product
    IF EXISTS (SELECT 1 FROM organization_addons WHERE organization_id = _organization_id AND product_id = _product_id AND is_active = true) THEN
      -- Update quantity
      UPDATE organization_addons
      SET quantity = quantity + _quantity,
          updated_at = now()
      WHERE organization_id = _organization_id AND product_id = _product_id AND is_active = true;
    ELSE
      -- Create new add-on (with price 0 if free for partners)
      INSERT INTO organization_addons (organization_id, product_id, quantity, price_per_unit, is_active)
      VALUES (_organization_id, _product_id, _quantity, CASE WHEN _is_free THEN 0 ELSE _product.price END, true);
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