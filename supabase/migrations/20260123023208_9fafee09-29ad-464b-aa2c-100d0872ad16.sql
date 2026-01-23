-- Update purchase_product function to also update subscription_ends_at for consistency
CREATE OR REPLACE FUNCTION public.purchase_product(_organization_id uuid, _product_id uuid, _quantity integer DEFAULT 1)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _product RECORD;
  _total_amount NUMERIC;
  _has_balance BOOLEAN;
  _is_subscription BOOLEAN;
  _is_addon BOOLEAN;
  _new_expiry TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Get product details
  SELECT * INTO _product FROM store_products WHERE id = _product_id AND is_active = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found or inactive';
  END IF;
  
  -- Check if it's a subscription product
  _is_subscription := _product.product_type = 'subscription';
  
  -- Check if it's an add-on product (users, channels, higienização, etc.)
  _is_addon := _product.product_type = 'addon' OR _product.name ILIKE '%usuário%' OR _product.name ILIKE '%canal%' OR _product.name ILIKE '%adicional%' OR _product.name ILIKE '%higieniza%';
  
  -- Subscriptions and add-ons must have quantity 1
  IF (_is_subscription OR _is_addon) AND _quantity != 1 THEN
    _quantity := 1;
  END IF;
  
  -- Calculate total amount
  _total_amount := _product.price * _quantity;
  
  -- Check if organization has enough balance
  SELECT check_organization_balance(_organization_id, _total_amount) INTO _has_balance;
  
  IF NOT _has_balance THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;
  
  -- Create purchase record
  INSERT INTO store_purchases (organization_id, product_id, amount, quantity, status, purchased_at)
  VALUES (_organization_id, _product_id, _total_amount, _quantity, 'completed', now());
  
  -- Debit balance
  PERFORM debit_organization_balance(
    _organization_id,
    _total_amount,
    'Compra: ' || _product.name || CASE WHEN _quantity > 1 THEN ' x' || _quantity ELSE '' END,
    'store_purchase',
    _product_id::TEXT
  );
  
  -- Handle subscription products
  IF _is_subscription THEN
    -- Calculate new expiry date (+30 days from now or current expiry)
    _new_expiry := COALESCE(
      (SELECT subscription_paid_until FROM organizations WHERE id = _organization_id),
      now()
    ) + INTERVAL '30 days';
    
    -- Update BOTH subscription_paid_until AND subscription_ends_at for consistency
    UPDATE organizations
    SET subscription_paid_until = _new_expiry,
        subscription_ends_at = _new_expiry,
        subscription_status = 'active',
        updated_at = now()
    WHERE id = _organization_id;
    
    -- Process referral commission (20% of subscription value)
    PERFORM process_referral_commission(_organization_id, _product.price);
  END IF;
  
  -- Handle add-on products - create or update recurring add-on
  IF _is_addon AND NOT _is_subscription THEN
    -- Check if there's already an active add-on for this product
    IF EXISTS (SELECT 1 FROM organization_addons WHERE organization_id = _organization_id AND product_id = _product_id AND is_active = true) THEN
      -- For higienização, don't increase quantity, just keep as 1
      IF _product.name ILIKE '%higieniza%' THEN
        NULL;
      ELSE
        -- Update quantity for other add-ons
        UPDATE organization_addons
        SET quantity = quantity + _quantity,
            updated_at = now()
        WHERE organization_id = _organization_id AND product_id = _product_id AND is_active = true;
      END IF;
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
$function$;