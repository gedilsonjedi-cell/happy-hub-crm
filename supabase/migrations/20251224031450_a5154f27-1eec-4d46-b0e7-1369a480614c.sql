-- Create blacklist table to store blocked contacts
CREATE TABLE public.blacklist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT,
  reason TEXT,
  blocked_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, phone)
);

-- Enable RLS
ALTER TABLE public.blacklist ENABLE ROW LEVEL SECURITY;

-- Users can view their organization's blacklist
CREATE POLICY "Users can view their organization blacklist"
ON public.blacklist
FOR SELECT
USING (organization_id = get_user_organization_id(auth.uid()));

-- Admins and supervisors can manage blacklist
CREATE POLICY "Admins can insert blacklist"
ON public.blacklist
FOR INSERT
WITH CHECK (organization_id = get_user_organization_id(auth.uid()) AND is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Admins can update blacklist"
ON public.blacklist
FOR UPDATE
USING (organization_id = get_user_organization_id(auth.uid()) AND is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Admins can delete blacklist"
ON public.blacklist
FOR DELETE
USING (organization_id = get_user_organization_id(auth.uid()) AND is_admin_or_supervisor(auth.uid()));

-- Super admins can view all blacklists
CREATE POLICY "Super admins can view all blacklists"
ON public.blacklist
FOR SELECT
USING (is_super_admin(auth.uid()));

-- Add indexes for faster lookups
CREATE INDEX idx_blacklist_org_phone ON public.blacklist(organization_id, phone);
CREATE INDEX idx_blacklist_phone ON public.blacklist(phone);

-- Function to check if a phone is blacklisted
CREATE OR REPLACE FUNCTION public.is_phone_blacklisted(
  _organization_id UUID,
  _phone TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM blacklist
    WHERE organization_id = _organization_id
    AND phone = _phone
  )
$$;