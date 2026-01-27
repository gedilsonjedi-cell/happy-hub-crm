-- Create table for flow-based chatbots
CREATE TABLE public.flow_bots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  ai_fallback_enabled BOOLEAN DEFAULT true,
  ai_fallback_message TEXT DEFAULT 'Deixa eu te ajudar com isso!',
  transfer_message TEXT DEFAULT 'Vou transferir você para um de nossos atendentes. Aguarde um momento.',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for flow nodes (blocks)
CREATE TABLE public.flow_nodes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  flow_bot_id UUID NOT NULL REFERENCES public.flow_bots(id) ON DELETE CASCADE,
  node_type TEXT NOT NULL CHECK (node_type IN ('start', 'message', 'buttons', 'collect_data', 'action')),
  position_x NUMERIC NOT NULL DEFAULT 0,
  position_y NUMERIC NOT NULL DEFAULT 0,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for flow connections (edges)
CREATE TABLE public.flow_edges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  flow_bot_id UUID NOT NULL REFERENCES public.flow_bots(id) ON DELETE CASCADE,
  source_node_id UUID NOT NULL REFERENCES public.flow_nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES public.flow_nodes(id) ON DELETE CASCADE,
  source_handle TEXT,
  label TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table to track user's current position in flow
CREATE TABLE public.flow_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  flow_bot_id UUID NOT NULL REFERENCES public.flow_bots(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.channels(id),
  contact_phone TEXT NOT NULL,
  current_node_id UUID REFERENCES public.flow_nodes(id),
  collected_data JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'transferred')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add bot_type column to chatbot_config to distinguish between AI and Flow bots
ALTER TABLE public.chatbot_config 
ADD COLUMN IF NOT EXISTS flow_bot_id UUID REFERENCES public.flow_bots(id),
ADD COLUMN IF NOT EXISTS bot_type TEXT DEFAULT 'ai' CHECK (bot_type IN ('ai', 'flow'));

-- Enable RLS
ALTER TABLE public.flow_bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for flow_bots
CREATE POLICY "Organization members can view flow bots"
  ON public.flow_bots FOR SELECT
  USING (organization_id = get_user_organization_id(auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "Organization members can create flow bots"
  ON public.flow_bots FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "Organization members can update flow bots"
  ON public.flow_bots FOR UPDATE
  USING (organization_id = get_user_organization_id(auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "Organization members can delete flow bots"
  ON public.flow_bots FOR DELETE
  USING (organization_id = get_user_organization_id(auth.uid()) OR is_super_admin(auth.uid()));

-- RLS Policies for flow_nodes (access through flow_bot)
CREATE POLICY "Users can view flow nodes"
  ON public.flow_nodes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM flow_bots 
    WHERE flow_bots.id = flow_nodes.flow_bot_id 
    AND (flow_bots.organization_id = get_user_organization_id(auth.uid()) OR is_super_admin(auth.uid()))
  ));

CREATE POLICY "Users can create flow nodes"
  ON public.flow_nodes FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM flow_bots 
    WHERE flow_bots.id = flow_nodes.flow_bot_id 
    AND (flow_bots.organization_id = get_user_organization_id(auth.uid()) OR is_super_admin(auth.uid()))
  ));

CREATE POLICY "Users can update flow nodes"
  ON public.flow_nodes FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM flow_bots 
    WHERE flow_bots.id = flow_nodes.flow_bot_id 
    AND (flow_bots.organization_id = get_user_organization_id(auth.uid()) OR is_super_admin(auth.uid()))
  ));

CREATE POLICY "Users can delete flow nodes"
  ON public.flow_nodes FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM flow_bots 
    WHERE flow_bots.id = flow_nodes.flow_bot_id 
    AND (flow_bots.organization_id = get_user_organization_id(auth.uid()) OR is_super_admin(auth.uid()))
  ));

-- RLS Policies for flow_edges (access through flow_bot)
CREATE POLICY "Users can view flow edges"
  ON public.flow_edges FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM flow_bots 
    WHERE flow_bots.id = flow_edges.flow_bot_id 
    AND (flow_bots.organization_id = get_user_organization_id(auth.uid()) OR is_super_admin(auth.uid()))
  ));

CREATE POLICY "Users can create flow edges"
  ON public.flow_edges FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM flow_bots 
    WHERE flow_bots.id = flow_edges.flow_bot_id 
    AND (flow_bots.organization_id = get_user_organization_id(auth.uid()) OR is_super_admin(auth.uid()))
  ));

CREATE POLICY "Users can update flow edges"
  ON public.flow_edges FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM flow_bots 
    WHERE flow_bots.id = flow_edges.flow_bot_id 
    AND (flow_bots.organization_id = get_user_organization_id(auth.uid()) OR is_super_admin(auth.uid()))
  ));

CREATE POLICY "Users can delete flow edges"
  ON public.flow_edges FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM flow_bots 
    WHERE flow_bots.id = flow_edges.flow_bot_id 
    AND (flow_bots.organization_id = get_user_organization_id(auth.uid()) OR is_super_admin(auth.uid()))
  ));

-- RLS Policies for flow_sessions (system needs full access for webhooks)
CREATE POLICY "System can manage flow sessions"
  ON public.flow_sessions FOR ALL
  USING (true);

-- Add updated_at trigger
CREATE TRIGGER update_flow_bots_updated_at
  BEFORE UPDATE ON public.flow_bots
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_flow_nodes_updated_at
  BEFORE UPDATE ON public.flow_nodes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_flow_sessions_updated_at
  BEFORE UPDATE ON public.flow_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_flow_nodes_flow_bot_id ON public.flow_nodes(flow_bot_id);
CREATE INDEX idx_flow_edges_flow_bot_id ON public.flow_edges(flow_bot_id);
CREATE INDEX idx_flow_sessions_contact ON public.flow_sessions(flow_bot_id, channel_id, contact_phone);

-- Add comments
COMMENT ON TABLE public.flow_bots IS 'Visual flow-based chatbots with drag-and-drop builder';
COMMENT ON TABLE public.flow_nodes IS 'Nodes/blocks in a flow bot (message, buttons, collect data, actions)';
COMMENT ON TABLE public.flow_edges IS 'Connections between nodes in a flow bot';
COMMENT ON TABLE public.flow_sessions IS 'Tracks user progress through a flow bot conversation';