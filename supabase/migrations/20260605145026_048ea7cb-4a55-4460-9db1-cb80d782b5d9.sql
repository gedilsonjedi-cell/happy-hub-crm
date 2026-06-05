
-- 1) Restrict SELECT on sensitive columns of public.channels for authenticated
REVOKE SELECT ON public.channels FROM authenticated;
GRANT SELECT (id, user_id, name, phone, provider, app_name, connected, created_at, updated_at, organization_id, waba_id) ON public.channels TO authenticated;

-- 2) Restrict SELECT on sensitive columns of public.auto_recharge_config for authenticated
REVOKE SELECT ON public.auto_recharge_config FROM authenticated;
GRANT SELECT (id, organization_id, is_enabled, min_balance_threshold, recharge_amount, created_at, updated_at) ON public.auto_recharge_config TO authenticated;

-- 3) Restrict dispatch_pricing writes to super_admin only (remove org-admin policies)
DROP POLICY IF EXISTS "Admins can delete pricing" ON public.dispatch_pricing;
DROP POLICY IF EXISTS "Admins can insert pricing" ON public.dispatch_pricing;
DROP POLICY IF EXISTS "Admins can update pricing" ON public.dispatch_pricing;
