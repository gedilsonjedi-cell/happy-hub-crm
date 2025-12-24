-- Enable realtime for organization_balance table
ALTER PUBLICATION supabase_realtime ADD TABLE public.organization_balance;

-- Enable realtime for balance_transactions table
ALTER PUBLICATION supabase_realtime ADD TABLE public.balance_transactions;