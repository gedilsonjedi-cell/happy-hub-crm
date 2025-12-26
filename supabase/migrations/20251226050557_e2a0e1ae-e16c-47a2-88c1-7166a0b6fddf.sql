-- Remove the overly permissive policy that allows public read
DROP POLICY IF EXISTS "System can manage balances" ON organization_balance;