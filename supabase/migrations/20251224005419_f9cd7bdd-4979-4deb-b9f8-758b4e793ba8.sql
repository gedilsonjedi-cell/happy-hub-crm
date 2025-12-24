-- Create a function to debit balance allowing negative (for incoming messages)
CREATE OR REPLACE FUNCTION public.debit_organization_balance_allow_negative(
  _organization_id uuid,
  _amount numeric,
  _description text DEFAULT NULL,
  _reference_type text DEFAULT NULL,
  _reference_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _current_balance NUMERIC;
  _new_balance NUMERIC;
BEGIN
  -- Check if balance record exists, create if not
  INSERT INTO organization_balance (organization_id, balance, total_credits_added, total_spent)
  VALUES (_organization_id, 0, 0, 0)
  ON CONFLICT (organization_id) DO NOTHING;
  
  -- Get current balance with row lock
  SELECT balance INTO _current_balance
  FROM organization_balance
  WHERE organization_id = _organization_id
  FOR UPDATE;
  
  -- Calculate new balance (can go negative)
  _new_balance := _current_balance - _amount;
  
  -- Update balance (allowing negative)
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