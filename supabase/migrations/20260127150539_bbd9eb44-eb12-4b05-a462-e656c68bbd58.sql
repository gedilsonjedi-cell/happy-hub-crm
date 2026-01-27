-- Fix security issue: attendant_availability_user_exposure
-- Remove the public SELECT policy that exposes user_id
DROP POLICY IF EXISTS "System can view all availability for distribution" ON public.attendant_availability;

-- Add organization-scoped policy for attendant distribution
-- This allows viewing availability within the same organization only
CREATE POLICY "Organization members can view availability for distribution"
ON public.attendant_availability
FOR SELECT
USING (
  is_super_admin(auth.uid()) OR
  organization_id = get_user_organization_id(auth.uid())
);

-- Fix security issue: conversation_assignments_phone_exposure
-- The "Service role can manage all assignments" with USING(true) allows public access
-- This policy is dangerous - service role access should be handled via service key, not RLS
DROP POLICY IF EXISTS "Service role can manage all assignments" ON public.conversation_assignments;

-- Fix security issue: chatbot_config_business_logic_exposure
-- Remove the public SELECT policy
DROP POLICY IF EXISTS "System can read chatbot config" ON public.chatbot_config;

-- Add organization-scoped policy for chatbot config viewing
CREATE POLICY "Organization members can view chatbot config"
ON public.chatbot_config
FOR SELECT
USING (
  is_super_admin(auth.uid()) OR
  organization_id = get_user_organization_id(auth.uid())
);

-- Fix security issue: organization_addons_revenue_exposure
-- The "System can manage addons" with USING(true) allows public access
DROP POLICY IF EXISTS "System can manage addons" ON public.organization_addons;