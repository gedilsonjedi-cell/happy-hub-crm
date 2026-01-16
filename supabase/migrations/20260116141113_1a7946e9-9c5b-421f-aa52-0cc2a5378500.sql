-- Create function to check if user can access a conversation based on sector
CREATE OR REPLACE FUNCTION public.user_can_access_conversation(conversation_sector_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If no sector is assigned, everyone in the org can see it
  IF conversation_sector_id IS NULL THEN
    RETURN TRUE;
  END IF;
  
  -- Super admins can see everything
  IF is_super_admin(auth.uid()) THEN
    RETURN TRUE;
  END IF;
  
  -- Admins can see everything in their org
  IF is_admin(auth.uid()) THEN
    RETURN TRUE;
  END IF;
  
  -- Supervisors can see everything in their org
  IF is_admin_or_supervisor(auth.uid()) THEN
    RETURN TRUE;
  END IF;
  
  -- Regular users can only see conversations from their assigned sectors
  RETURN EXISTS (
    SELECT 1 FROM user_sectors
    WHERE user_id = auth.uid()
    AND sector_id = conversation_sector_id
  );
END;
$$;

-- Drop existing SELECT policies for conversation_assignments
DROP POLICY IF EXISTS "Organization members can view conversation assignments" ON conversation_assignments;
DROP POLICY IF EXISTS "System can manage assignments" ON conversation_assignments;

-- Create new SELECT policy that respects sector visibility
CREATE POLICY "Users can view conversations in their sectors" 
ON conversation_assignments
FOR SELECT
TO authenticated
USING (
  (
    -- Must have channel access (organization check)
    (channel_id IN (SELECT id FROM channels WHERE organization_id = get_user_organization_id(auth.uid())))
    OR is_super_admin(auth.uid())
  )
  AND
  -- Must have sector access
  user_can_access_conversation(sector_id)
);

-- Keep system policy for service role operations
CREATE POLICY "Service role can manage all assignments" 
ON conversation_assignments
FOR ALL
USING (true)
WITH CHECK (true);

-- Create function to get sector_id from campaign (using sector_id field, not team)
CREATE OR REPLACE FUNCTION public.get_campaign_sector_for_phone(_organization_id uuid, _phone text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sector_id uuid;
BEGIN
  -- Find most recent campaign recipient for this phone and get the campaign's sector_id
  SELECT c.sector_id INTO _sector_id
  FROM campaign_recipients cr
  JOIN campaigns c ON c.id = cr.campaign_id
  WHERE cr.phone = _phone
    AND c.organization_id = _organization_id
    AND c.sector_id IS NOT NULL
  ORDER BY cr.created_at DESC
  LIMIT 1;
  
  RETURN _sector_id;
END;
$$;