
-- 1. Remove overly permissive INSERT policy on balance_transactions
DROP POLICY IF EXISTS "System can insert transactions" ON public.balance_transactions;

-- 2. Remove overly permissive ALL policy on scheduled_messages
DROP POLICY IF EXISTS "System can manage scheduled messages" ON public.scheduled_messages;

-- 3. Fix user_roles policies to prevent admin → super_admin escalation
-- Drop existing admin policies
DROP POLICY IF EXISTS "Admins can create roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;

-- Recreate with super_admin protection
CREATE POLICY "Admins can create roles (no super_admin)"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  (public.is_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
  AND (
    role != 'super_admin' OR public.is_super_admin(auth.uid())
  )
);

CREATE POLICY "Admins can update roles (no super_admin)"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  public.is_admin(auth.uid()) OR public.is_super_admin(auth.uid())
)
WITH CHECK (
  (public.is_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
  AND (
    role != 'super_admin' OR public.is_super_admin(auth.uid())
  )
);

CREATE POLICY "Admins can delete roles (no super_admin)"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  (public.is_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
  AND (
    role != 'super_admin' OR public.is_super_admin(auth.uid())
  )
);

-- 4. Fix auto_recharge_config SELECT policy to restrict to admins only
DROP POLICY IF EXISTS "Users can view their organization's auto recharge config" ON public.auto_recharge_config;

CREATE POLICY "Admins can view their organization's auto recharge config"
ON public.auto_recharge_config
FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT p.organization_id FROM public.profiles p WHERE p.user_id = auth.uid()
  )
  AND (public.is_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
);
