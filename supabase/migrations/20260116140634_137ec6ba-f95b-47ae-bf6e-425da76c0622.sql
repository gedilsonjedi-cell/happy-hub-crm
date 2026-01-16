-- Create function to check if user can access a campaign based on sector
CREATE OR REPLACE FUNCTION public.user_can_access_campaign(campaign_sector_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If no sector is assigned, everyone in the org can see it
  IF campaign_sector_id IS NULL THEN
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
  
  -- Regular users can only see campaigns from their assigned sectors
  RETURN EXISTS (
    SELECT 1 FROM user_sectors
    WHERE user_id = auth.uid()
    AND sector_id = campaign_sector_id
  );
END;
$$;

-- Drop existing SELECT policies for campaigns
DROP POLICY IF EXISTS "Organization members can view campaigns" ON campaigns;
DROP POLICY IF EXISTS "Super admins can view all campaigns" ON campaigns;

-- Create new SELECT policy that respects sector visibility
CREATE POLICY "Users can view campaigns in their sectors" 
ON campaigns
FOR SELECT
TO authenticated
USING (
  (
    -- Must be in the same organization OR super admin
    (organization_id = get_user_organization_id(auth.uid()) OR is_super_admin(auth.uid()))
    AND
    -- Must have sector access
    user_can_access_campaign(sector_id)
  )
);

-- Ensure sectors RLS allows users to view sectors they belong to
DROP POLICY IF EXISTS "Users can view their assigned sectors" ON sectors;
CREATE POLICY "Users can view their assigned sectors" 
ON sectors
FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR is_admin(auth.uid()) 
  OR EXISTS (
    SELECT 1 FROM user_sectors 
    WHERE user_sectors.sector_id = sectors.id 
    AND user_sectors.user_id = auth.uid()
  )
);