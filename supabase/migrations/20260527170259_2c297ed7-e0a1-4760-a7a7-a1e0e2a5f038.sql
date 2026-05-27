
-- 1) auto_recharge_config: revoke SELECT on sensitive card columns from client roles
REVOKE SELECT (card_token, customer_id, card_last_four, card_brand, cardholder_name)
  ON public.auto_recharge_config FROM authenticated;
REVOKE SELECT (card_token, customer_id, card_last_four, card_brand, cardholder_name)
  ON public.auto_recharge_config FROM anon;
REVOKE ALL ON public.auto_recharge_config FROM anon;

-- 2) ai_agents: enforce organization_id matches caller's org on INSERT/UPDATE
DROP POLICY IF EXISTS "Users can create their own agents" ON public.ai_agents;
DROP POLICY IF EXISTS "Users can update their own agents" ON public.ai_agents;

CREATE POLICY "Users can create their own agents"
  ON public.ai_agents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      organization_id IS NULL
      OR organization_id = public.get_user_organization_id(auth.uid())
    )
  );

CREATE POLICY "Users can update their own agents"
  ON public.ai_agents
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (
      organization_id IS NULL
      OR organization_id = public.get_user_organization_id(auth.uid())
    )
  );

-- 3) conversation_memory: split read (org members) from write (admins/supervisors)
DROP POLICY IF EXISTS "Organization members can manage conversation memory" ON public.conversation_memory;

CREATE POLICY "Org members can read conversation memory"
  ON public.conversation_memory
  FOR SELECT
  TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Admins and supervisors can insert conversation memory"
  ON public.conversation_memory
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id(auth.uid())
    AND (
      public.is_admin(auth.uid())
      OR public.has_role(auth.uid(), 'supervisor'::app_role)
    )
  );

CREATE POLICY "Admins and supervisors can update conversation memory"
  ON public.conversation_memory
  FOR UPDATE
  TO authenticated
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
    AND (
      public.is_admin(auth.uid())
      OR public.has_role(auth.uid(), 'supervisor'::app_role)
    )
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id(auth.uid())
    AND (
      public.is_admin(auth.uid())
      OR public.has_role(auth.uid(), 'supervisor'::app_role)
    )
  );

CREATE POLICY "Admins and supervisors can delete conversation memory"
  ON public.conversation_memory
  FOR DELETE
  TO authenticated
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
    AND (
      public.is_admin(auth.uid())
      OR public.has_role(auth.uid(), 'supervisor'::app_role)
    )
  );
