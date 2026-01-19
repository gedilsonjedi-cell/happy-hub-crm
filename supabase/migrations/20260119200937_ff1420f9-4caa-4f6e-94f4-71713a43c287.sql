-- =============================================
-- TABELA: conversation_metrics
-- Armazena métricas de tempo por conversa
-- =============================================
CREATE TABLE public.conversation_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_assignment_id UUID REFERENCES public.conversation_assignments(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  assigned_to UUID,
  sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL,
  
  -- Timestamps de eventos
  first_message_at TIMESTAMP WITH TIME ZONE,
  first_response_at TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  
  -- Métricas calculadas (em segundos)
  first_response_time_seconds INTEGER, -- TMR: Tempo até primeira resposta
  total_handling_time_seconds INTEGER, -- TMA: Tempo total de atendimento
  wait_time_seconds INTEGER, -- TME: Tempo de espera na fila
  
  -- Contadores
  message_count INTEGER DEFAULT 0,
  agent_message_count INTEGER DEFAULT 0,
  customer_message_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =============================================
-- TABELA: lead_activity_log
-- Timeline unificada de todas atividades do lead
-- =============================================
CREATE TABLE public.lead_activity_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Tipo de atividade
  activity_type TEXT NOT NULL, -- 'message_sent', 'message_received', 'stage_changed', 'tag_added', 'tag_removed', 'note_added', 'campaign_sent', 'follow_up_sent', 'assigned_to', 'conversation_started', 'conversation_resolved', 'custom_field_updated'
  
  -- Detalhes da atividade
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Referências opcionais
  performed_by UUID, -- user_id que executou a ação
  channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =============================================
-- ÍNDICES para performance
-- =============================================
CREATE INDEX idx_conversation_metrics_org ON public.conversation_metrics(organization_id);
CREATE INDEX idx_conversation_metrics_assigned_to ON public.conversation_metrics(assigned_to);
CREATE INDEX idx_conversation_metrics_sector ON public.conversation_metrics(sector_id);
CREATE INDEX idx_conversation_metrics_created ON public.conversation_metrics(created_at);
CREATE INDEX idx_conversation_metrics_assignment ON public.conversation_metrics(conversation_assignment_id);

CREATE INDEX idx_lead_activity_log_lead ON public.lead_activity_log(lead_id);
CREATE INDEX idx_lead_activity_log_org ON public.lead_activity_log(organization_id);
CREATE INDEX idx_lead_activity_log_type ON public.lead_activity_log(activity_type);
CREATE INDEX idx_lead_activity_log_created ON public.lead_activity_log(created_at);

-- =============================================
-- RLS: conversation_metrics
-- =============================================
ALTER TABLE public.conversation_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view metrics for their organization"
  ON public.conversation_metrics FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert metrics"
  ON public.conversation_metrics FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update metrics"
  ON public.conversation_metrics FOR UPDATE
  USING (true);

-- =============================================
-- RLS: lead_activity_log
-- =============================================
ALTER TABLE public.lead_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view activity for their organization"
  ON public.lead_activity_log FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert activity for their organization"
  ON public.lead_activity_log FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- =============================================
-- TRIGGER: Auto-update timestamp
-- =============================================
CREATE TRIGGER update_conversation_metrics_updated_at
  BEFORE UPDATE ON public.conversation_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- REALTIME para métricas
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_metrics;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_activity_log;