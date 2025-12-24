-- Update purchase_product function to handle quantity and increment max_users
CREATE OR REPLACE FUNCTION public.purchase_product(
  _organization_id UUID,
  _product_id UUID,
  _quantity INTEGER DEFAULT 1
) RETURNS BOOLEAN AS $$
DECLARE
  _product_price NUMERIC;
  _product_name TEXT;
  _product_type TEXT;
  _current_balance NUMERIC;
  _total_amount NUMERIC;
  _purchase_id UUID;
BEGIN
  -- Validate quantity
  IF _quantity < 1 THEN
    _quantity := 1;
  END IF;

  -- Get product details
  SELECT price, name, product_type INTO _product_price, _product_name, _product_type
  FROM public.store_products
  WHERE id = _product_id AND is_active = true;
  
  IF _product_price IS NULL THEN
    RAISE EXCEPTION 'Product not found or inactive';
  END IF;
  
  -- For subscriptions, quantity must be 1
  IF _product_type = 'subscription' THEN
    _quantity := 1;
  END IF;
  
  -- Calculate total amount
  _total_amount := _product_price * _quantity;
  
  -- Check balance
  SELECT balance INTO _current_balance
  FROM public.organization_balance
  WHERE organization_id = _organization_id;
  
  IF _current_balance IS NULL OR _current_balance < _total_amount THEN
    RETURN false;
  END IF;
  
  -- Create purchase record
  INSERT INTO public.store_purchases (organization_id, product_id, amount, status, purchased_at)
  VALUES (_organization_id, _product_id, _total_amount, 'completed', now())
  RETURNING id INTO _purchase_id;
  
  -- Debit balance
  PERFORM public.debit_organization_balance(
    _organization_id,
    _total_amount,
    'Compra: ' || _product_name || CASE WHEN _quantity > 1 THEN ' (x' || _quantity || ')' ELSE '' END,
    'store_purchase',
    _purchase_id::text
  );
  
  -- Handle specific product types
  IF _product_type = 'subscription' THEN
    -- Update subscription_paid_until
    UPDATE public.organizations
    SET subscription_paid_until = COALESCE(subscription_paid_until, now()) + INTERVAL '30 days',
        subscription_status = 'active',
        updated_at = now()
    WHERE id = _organization_id;
  ELSIF _product_name ILIKE '%usuário%' OR _product_name ILIKE '%usuario%' THEN
    -- Increment max_users
    UPDATE public.organizations
    SET max_users = COALESCE(max_users, 1) + _quantity,
        updated_at = now()
    WHERE id = _organization_id;
  END IF;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Add quantity column to store_purchases if needed for tracking
ALTER TABLE public.store_purchases ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;