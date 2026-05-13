// Flow Bot Types

export interface FlowBot {
  id: string;
  organization_id: string;
  user_id: string;
  name: string;
  description?: string;
  is_active: boolean;
  ai_fallback_enabled: boolean;
  ai_fallback_message: string;
  transfer_message: string;
  created_at: string;
  updated_at: string;
}

export type NodeType = 'start' | 'template' | 'message' | 'buttons' | 'collect_data' | 'action';

export interface FlowNode {
  id: string;
  flow_bot_id: string;
  node_type: NodeType;
  position_x: number;
  position_y: number;
  data: NodeData;
  created_at: string;
  updated_at: string;
}

export interface FlowEdge {
  id: string;
  flow_bot_id: string;
  source_node_id: string;
  target_node_id: string;
  source_handle?: string;
  label?: string;
  created_at: string;
}

// Node Data Types
export interface StartNodeData {
  label: string;
}

export interface MessageNodeData {
  label: string;
  message: string;
  delay?: number; // seconds before sending
}

export interface ButtonOption {
  id: string;
  label: string;
  value: string;
}

export interface ButtonsNodeData {
  label: string;
  message: string;
  buttons: ButtonOption[];
}

export interface CollectDataNodeData {
  label: string;
  message: string;
  variable_name: string;
  variable_type: 'text' | 'number' | 'email' | 'phone';
  validation_message?: string;
}

export type ActionType = 'transfer' | 'move_pipeline' | 'webhook' | 'end';

export interface ActionNodeData {
  label: string;
  action_type: ActionType;
  // For transfer
  transfer_message?: string;
  // For move_pipeline
  pipeline_stage_id?: string;
  // For webhook
  webhook_url?: string;
  webhook_payload?: Record<string, string>;
}

export type NodeData = 
  | StartNodeData 
  | MessageNodeData 
  | ButtonsNodeData 
  | CollectDataNodeData 
  | ActionNodeData;

// Canvas types for react-flow-like behavior (using dnd-kit)
export interface CanvasNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: NodeData;
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  label?: string;
}

// Flow Session for tracking user progress
export interface FlowSession {
  id: string;
  flow_bot_id: string;
  channel_id: string;
  contact_phone: string;
  current_node_id: string | null;
  collected_data: Record<string, string>;
  status: 'active' | 'completed' | 'transferred';
  created_at: string;
  updated_at: string;
}
