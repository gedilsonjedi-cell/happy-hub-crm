-- Create organization_balance table for credits/balance per organization
CREATE TABLE public.organization_balance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  balance NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
  total_credits_added NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
  total_spent NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create balance_transactions table for tracking all credits/debits
CREATE TABLE public.balance_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
  amount NUMERIC(12, 4) NOT NULL,
  balance_before NUMERIC(12, 4) NOT NULL,
  balance_after NUMERIC(12, 4) NOT NULL,
  description TEXT,
  reference_type TEXT, -- 'message', 'campaign', 'manual', 'stripe', 'pix'
  reference_id TEXT, -- message_id, campaign_id, payment_id, etc.
  created_by UUID, -- user who made the transaction (for manual credits)
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX idx_organization_balance_org ON public.organization_balance(organization_id);
CREATE INDEX idx_balance_transactions_org ON public.balance_transactions(organization_id);
CREATE INDEX idx_balance_transactions_created_at ON public.balance_transactions(created_at DESC);

-- Enable RLS
ALTER TABLE public.organization_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.balance_transactions ENABLE ROW LEVEL SECURITY;

-- RLS policies for organization_balance
CREATE POLICY "Users can view their organization balance"
  ON public.organization_balance FOR SELECT
  USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Super admins can view all balances"
  ON public.organization_balance FOR SELECT
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can insert balances"
  ON public.organization_balance FOR INSERT
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update balances"
  ON public.organization_balance FOR UPDATE
  USING (is_super_admin(auth.uid()));

CREATE POLICY "System can manage balances"
  ON public.organization_balance FOR ALL
  USING (true);

-- RLS policies for balance_transactions
CREATE POLICY "Users can view their organization transactions"
  ON public.balance_transactions FOR SELECT
  USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Super admins can view all transactions"
  ON public.balance_transactions FOR SELECT
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can insert transactions"
  ON public.balance_transactions FOR INSERT
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "System can insert transactions"
  ON public.balance_transactions FOR INSERT
  WITH CHECK (true);

-- Create function to check if organization has sufficient balance
CREATE OR REPLACE FUNCTION public.check_organization_balance(
  _organization_id UUID,
  _amount NUMERIC
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT balance >= _amount FROM organization_balance WHERE organization_id = _organization_id),
    FALSE
  )
$$;

-- Create function to debit balance (for message sending)
CREATE OR REPLACE FUNCTION public.debit_organization_balance(
  _organization_id UUID,
  _amount NUMERIC,
  _description TEXT DEFAULT NULL,
  _reference_type TEXT DEFAULT NULL,
  _reference_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_balance NUMERIC;
  _new_balance NUMERIC;
BEGIN
  -- Get current balance with row lock
  SELECT balance INTO _current_balance
  FROM organization_balance
  WHERE organization_id = _organization_id
  FOR UPDATE;
  
  -- Check if organization has balance record
  IF _current_balance IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Check if sufficient balance
  IF _current_balance < _amount THEN
    RETURN FALSE;
  END IF;
  
  -- Calculate new balance
  _new_balance := _current_balance - _amount;
  
  -- Update balance
  UPDATE organization_balance
  SET 
    balance = _new_balance,
    total_spent = total_spent + _amount,
    updated_at = now()
  WHERE organization_id = _organization_id;
  
  -- Record transaction
  INSERT INTO balance_transactions (
    organization_id, type, amount, balance_before, balance_after,
    description, reference_type, reference_id
  ) VALUES (
    _organization_id, 'debit', _amount, _current_balance, _new_balance,
    _description, _reference_type, _reference_id
  );
  
  RETURN TRUE;
END;
$$;

-- Create function to credit balance (for recharges)
CREATE OR REPLACE FUNCTION public.credit_organization_balance(
  _organization_id UUID,
  _amount NUMERIC,
  _description TEXT DEFAULT NULL,
  _reference_type TEXT DEFAULT NULL,
  _reference_id TEXT DEFAULT NULL,
  _created_by UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_balance NUMERIC;
  _new_balance NUMERIC;
BEGIN
  -- Check if balance record exists, create if not
  INSERT INTO organization_balance (organization_id, balance, total_credits_added)
  VALUES (_organization_id, 0, 0)
  ON CONFLICT (organization_id) DO NOTHING;
  
  -- Get current balance with row lock
  SELECT balance INTO _current_balance
  FROM organization_balance
  WHERE organization_id = _organization_id
  FOR UPDATE;
  
  -- Calculate new balance
  _new_balance := _current_balance + _amount;
  
  -- Update balance
  UPDATE organization_balance
  SET 
    balance = _new_balance,
    total_credits_added = total_credits_added + _amount,
    updated_at = now()
  WHERE organization_id = _organization_id;
  
  -- Record transaction
  INSERT INTO balance_transactions (
    organization_id, type, amount, balance_before, balance_after,
    description, reference_type, reference_id, created_by
  ) VALUES (
    _organization_id, 'credit', _amount, _current_balance, _new_balance,
    _description, _reference_type, _reference_id, _created_by
  );
  
  RETURN TRUE;
END;
$$;

-- Create trigger to update updated_at
CREATE TRIGGER update_organization_balance_updated_at
  BEFORE UPDATE ON public.organization_balance
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();