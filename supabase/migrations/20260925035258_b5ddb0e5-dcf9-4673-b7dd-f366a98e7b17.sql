GRANT EXECUTE ON FUNCTION public.debit_organization_balance(uuid,numeric,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.credit_organization_balance(uuid,numeric,text,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.force_sync_all_campaign_counts() TO authenticated;