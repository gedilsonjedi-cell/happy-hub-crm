-- Tabela para horários de atendimento
CREATE TABLE public.business_hours (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id),
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME NOT NULL DEFAULT '09:00',
  end_time TIME NOT NULL DEFAULT '18:00',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, day_of_week)
);

-- Tabela para mensagem de ausência
CREATE TABLE public.away_message_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) UNIQUE,
  is_enabled BOOLEAN DEFAULT true,
  message TEXT DEFAULT 'Olá! No momento estamos fora do horário de atendimento. Retornaremos em breve.',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para feriados
CREATE TABLE public.holidays (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id),
  name TEXT NOT NULL,
  date DATE NOT NULL,
  is_recurring BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para tags de leads
CREATE TABLE public.lead_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id),
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3b82f6',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.away_message_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tags ENABLE ROW LEVEL SECURITY;

-- Policies for business_hours
CREATE POLICY "Users can view their organization business hours" ON public.business_hours
  FOR SELECT USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Admins can manage business hours" ON public.business_hours
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()) AND is_admin_or_supervisor(auth.uid()));

-- Policies for away_message_config
CREATE POLICY "Users can view their organization away message" ON public.away_message_config
  FOR SELECT USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Admins can manage away message" ON public.away_message_config
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()) AND is_admin_or_supervisor(auth.uid()));

-- Policies for holidays
CREATE POLICY "Users can view their organization holidays" ON public.holidays
  FOR SELECT USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Admins can manage holidays" ON public.holidays
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()) AND is_admin_or_supervisor(auth.uid()));

-- Policies for lead_tags
CREATE POLICY "Users can view their organization tags" ON public.lead_tags
  FOR SELECT USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Admins can manage tags" ON public.lead_tags
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()) AND is_admin_or_supervisor(auth.uid()));