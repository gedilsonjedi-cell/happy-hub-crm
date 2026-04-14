CREATE OR REPLACE FUNCTION public.get_campaign_sector_for_phone(_organization_id uuid, _phone text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sector_id uuid;
  _phone_suffix text;
BEGIN
  -- Extract last 8 digits for flexible matching (handles 9th digit differences)
  _phone_suffix := right(regexp_replace(_phone, '\D', '', 'g'), 8);
  
  -- Find most recent campaign recipient for this phone and get the campaign's sector_id
  SELECT c.sector_id INTO _sector_id
  FROM campaign_recipients cr
  JOIN campaigns c ON c.id = cr.campaign_id
  WHERE c.organization_id = _organization_id
    AND c.sector_id IS NOT NULL
    AND right(regexp_replace(cr.phone, '\D', '', 'g'), 8) = _phone_suffix
  ORDER BY cr.created_at DESC
  LIMIT 1;
  
  RETURN _sector_id;
END;
$$;