
DROP POLICY IF EXISTS "Users can insert their own costs" ON public.dispatch_costs;
CREATE POLICY "Users can insert their own costs" ON public.dispatch_costs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND organization_id = public.get_user_organization_id(auth.uid()));

DROP POLICY IF EXISTS "Users can create purchases for their organization" ON public.store_purchases;
CREATE POLICY "Users can create purchases for their organization" ON public.store_purchases
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id(auth.uid())
    AND status = 'pending'
  );
