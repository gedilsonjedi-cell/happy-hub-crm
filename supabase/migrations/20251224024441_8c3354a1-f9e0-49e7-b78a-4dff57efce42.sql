
-- Create store products table
CREATE TABLE public.store_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL DEFAULT 0.00,
  product_type TEXT NOT NULL DEFAULT 'one_time', -- 'subscription' or 'one_time'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create store purchases table
CREATE TABLE public.store_purchases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.store_products(id),
  amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'cancelled'
  purchased_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.store_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_purchases ENABLE ROW LEVEL SECURITY;

-- RLS policies for store_products (everyone can view active products)
CREATE POLICY "Everyone can view active products"
ON public.store_products
FOR SELECT
USING (is_active = true);

CREATE POLICY "Super admins can manage products"
ON public.store_products
FOR ALL
USING (is_super_admin(auth.uid()));

-- RLS policies for store_purchases
CREATE POLICY "Users can view their organization purchases"
ON public.store_purchases
FOR SELECT
USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can create purchases for their organization"
ON public.store_purchases
FOR INSERT
WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Super admins can view all purchases"
ON public.store_purchases
FOR SELECT
USING (is_super_admin(auth.uid()));

-- Insert default products
INSERT INTO public.store_products (name, description, price, product_type) VALUES
('Plano Mensal', 'Acesso completo à plataforma por 30 dias', 289.00, 'subscription'),
('Criação da API Oficial', 'Configuração e criação da API oficial do WhatsApp Business', 199.00, 'one_time');

-- Add subscription_paid_until to organizations
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS subscription_paid_until TIMESTAMP WITH TIME ZONE;

-- Create function to purchase product using balance
CREATE OR REPLACE FUNCTION public.purchase_product(
  _organization_id UUID,
  _product_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  _product_price NUMERIC;
  _product_name TEXT;
  _product_type TEXT;
  _current_balance NUMERIC;
  _purchase_id UUID;
BEGIN
  -- Get product details
  SELECT price, name, product_type INTO _product_price, _product_name, _product_type
  FROM public.store_products
  WHERE id = _product_id AND is_active = true;
  
  IF _product_price IS NULL THEN
    RAISE EXCEPTION 'Product not found or inactive';
  END IF;
  
  -- Check balance
  SELECT balance INTO _current_balance
  FROM public.organization_balance
  WHERE organization_id = _organization_id;
  
  IF _current_balance IS NULL OR _current_balance < _product_price THEN
    RETURN false;
  END IF;
  
  -- Create purchase record
  INSERT INTO public.store_purchases (organization_id, product_id, amount, status, purchased_at)
  VALUES (_organization_id, _product_id, _product_price, 'completed', now())
  RETURNING id INTO _purchase_id;
  
  -- Debit balance
  PERFORM public.debit_organization_balance(
    _organization_id,
    _product_price,
    'Compra: ' || _product_name,
    'store_purchase',
    _purchase_id::text
  );
  
  -- If subscription, update subscription_paid_until
  IF _product_type = 'subscription' THEN
    UPDATE public.organizations
    SET subscription_paid_until = COALESCE(subscription_paid_until, now()) + INTERVAL '30 days',
        subscription_status = 'active',
        updated_at = now()
    WHERE id = _organization_id;
  END IF;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
