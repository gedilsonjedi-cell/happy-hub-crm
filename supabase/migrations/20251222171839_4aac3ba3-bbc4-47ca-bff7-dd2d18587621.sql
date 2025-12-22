-- Create organizations/clients table
CREATE TABLE public.organizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  plan TEXT NOT NULL DEFAULT 'free',
  subscription_status TEXT NOT NULL DEFAULT 'active',
  subscription_started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  subscription_ends_at TIMESTAMP WITH TIME ZONE,
  max_users INTEGER DEFAULT 5,
  max_channels INTEGER DEFAULT 2,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add organization_id to profiles table
ALTER TABLE public.profiles 
ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

-- Add organization_id to other tables that need multi-tenancy
ALTER TABLE public.channels ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.leads ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.campaigns ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.message_templates ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.ai_agents ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sectors ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.pipeline_stages ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.dispatch_costs ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Enable RLS on organizations
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Create function to check if user is super admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'super_admin'
  )
$$;

-- Super admins can view all organizations
CREATE POLICY "Super admins can view all organizations"
ON public.organizations
FOR SELECT
USING (is_super_admin(auth.uid()));

-- Super admins can manage all organizations
CREATE POLICY "Super admins can insert organizations"
ON public.organizations
FOR INSERT
WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update organizations"
ON public.organizations
FOR UPDATE
USING (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete organizations"
ON public.organizations
FOR DELETE
USING (is_super_admin(auth.uid()));

-- Users can view their own organization (using function to avoid recursion)
CREATE OR REPLACE FUNCTION public.get_user_organization_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

CREATE POLICY "Users can view their own organization"
ON public.organizations
FOR SELECT
USING (id = get_user_organization_id(auth.uid()));

-- Create indexes for performance
CREATE INDEX idx_profiles_organization ON public.profiles(organization_id);
CREATE INDEX idx_channels_organization ON public.channels(organization_id);
CREATE INDEX idx_leads_organization ON public.leads(organization_id);
CREATE INDEX idx_campaigns_organization ON public.campaigns(organization_id);
CREATE INDEX idx_templates_organization ON public.message_templates(organization_id);
CREATE INDEX idx_agents_organization ON public.ai_agents(organization_id);
CREATE INDEX idx_sectors_organization ON public.sectors(organization_id);
CREATE INDEX idx_pipeline_stages_organization ON public.pipeline_stages(organization_id);
CREATE INDEX idx_dispatch_costs_organization ON public.dispatch_costs(organization_id);

-- Trigger for updated_at
CREATE TRIGGER update_organizations_updated_at
BEFORE UPDATE ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();