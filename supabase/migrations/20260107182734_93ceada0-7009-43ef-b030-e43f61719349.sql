-- Allow super admins to insert leads into any organization
CREATE POLICY "Super admins can insert leads"
ON public.leads
FOR INSERT
WITH CHECK (is_super_admin(auth.uid()));

-- Allow super admins to update leads in any organization
CREATE POLICY "Super admins can update leads"
ON public.leads
FOR UPDATE
USING (is_super_admin(auth.uid()));

-- Allow super admins to delete leads in any organization
CREATE POLICY "Super admins can delete leads"
ON public.leads
FOR DELETE
USING (is_super_admin(auth.uid()));

-- Allow super admins to insert balance transactions (needed for impersonation)
CREATE POLICY "Super admins can manage balance transactions"
ON public.balance_transactions
FOR ALL
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- Allow super admins to manage campaigns
CREATE POLICY "Super admins can insert campaigns"
ON public.campaigns
FOR INSERT
WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update campaigns"
ON public.campaigns
FOR UPDATE
USING (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete campaigns"
ON public.campaigns
FOR DELETE
USING (is_super_admin(auth.uid()));

-- Allow super admins to insert campaign recipients
CREATE POLICY "Super admins can insert campaign recipients"
ON public.campaign_recipients
FOR INSERT
WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update campaign recipients"
ON public.campaign_recipients
FOR UPDATE
USING (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can view campaign recipients"
ON public.campaign_recipients
FOR SELECT
USING (is_super_admin(auth.uid()));

-- Allow super admins to manage campaign channels
CREATE POLICY "Super admins can manage campaign channels"
ON public.campaign_channels
FOR ALL
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- Allow super admins to manage client portfolios
CREATE POLICY "Super admins can manage client portfolios"
ON public.client_portfolios
FOR ALL
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- Allow super admins to view/manage whatsapp messages
CREATE POLICY "Super admins can view all whatsapp messages"
ON public.whatsapp_messages
FOR SELECT
USING (is_super_admin(auth.uid()));

-- Allow super admins to manage lead tags
CREATE POLICY "Super admins can manage lead tags"
ON public.lead_tags
FOR ALL
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- Allow super admins to manage conversation assignments
CREATE POLICY "Super admins can manage conversation assignments"
ON public.conversation_assignments
FOR ALL
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- Allow super admins to view and manage attendant availability
CREATE POLICY "Super admins can manage attendant availability"
ON public.attendant_availability
FOR ALL
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));