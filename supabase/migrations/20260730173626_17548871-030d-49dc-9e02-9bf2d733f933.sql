-- 1) Remove session-level caching from the org resolver (pooling safety)
CREATE OR REPLACE FUNCTION public.get_user_organization_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT organization_id FROM public.profiles WHERE user_id = _user_id LIMIT 1;
$function$;

-- 2) Align campaign_channels policies with organization scoping
DROP POLICY IF EXISTS "Users can view their campaign channels" ON public.campaign_channels;
DROP POLICY IF EXISTS "Users can update their campaign channels" ON public.campaign_channels;
DROP POLICY IF EXISTS "Users can delete their campaign channels" ON public.campaign_channels;
DROP POLICY IF EXISTS "Users can manage their campaign channels" ON public.campaign_channels;

CREATE POLICY "Users can view their campaign channels"
ON public.campaign_channels FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.campaigns c
  WHERE c.id = campaign_channels.campaign_id
    AND (
      c.user_id = auth.uid()
      OR (c.organization_id IS NOT NULL AND c.organization_id = public.get_user_organization_id(auth.uid()))
    )
));

CREATE POLICY "Users can manage their campaign channels"
ON public.campaign_channels FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.campaigns c
  WHERE c.id = campaign_channels.campaign_id
    AND (
      c.user_id = auth.uid()
      OR (c.organization_id IS NOT NULL AND c.organization_id = public.get_user_organization_id(auth.uid()))
    )
));

CREATE POLICY "Users can update their campaign channels"
ON public.campaign_channels FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.campaigns c
  WHERE c.id = campaign_channels.campaign_id
    AND (
      c.user_id = auth.uid()
      OR (c.organization_id IS NOT NULL AND c.organization_id = public.get_user_organization_id(auth.uid()))
    )
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.campaigns c
  WHERE c.id = campaign_channels.campaign_id
    AND (
      c.user_id = auth.uid()
      OR (c.organization_id IS NOT NULL AND c.organization_id = public.get_user_organization_id(auth.uid()))
    )
));

CREATE POLICY "Users can delete their campaign channels"
ON public.campaign_channels FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.campaigns c
  WHERE c.id = campaign_channels.campaign_id
    AND (
      c.user_id = auth.uid()
      OR (c.organization_id IS NOT NULL AND c.organization_id = public.get_user_organization_id(auth.uid()))
    )
));