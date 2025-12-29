export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_agents: {
        Row: {
          agent_profile: string | null
          auto_escalate_enabled: boolean | null
          auto_greet_enabled: boolean | null
          communication_style: string | null
          company_info: string | null
          created_at: string
          escalate_after_messages: number | null
          escalate_keywords: string[] | null
          escalate_on_sentiment: boolean | null
          faq: string | null
          greeting_delay_seconds: number | null
          id: string
          is_active: boolean | null
          name: string
          nickname: string | null
          objective: string | null
          organization_id: string | null
          out_of_hours_message: string | null
          products_services: string | null
          response_delay_max: number | null
          response_delay_min: number | null
          sign_conversations: boolean | null
          simulate_typing: boolean | null
          updated_at: string
          use_business_hours: boolean | null
          user_id: string
        }
        Insert: {
          agent_profile?: string | null
          auto_escalate_enabled?: boolean | null
          auto_greet_enabled?: boolean | null
          communication_style?: string | null
          company_info?: string | null
          created_at?: string
          escalate_after_messages?: number | null
          escalate_keywords?: string[] | null
          escalate_on_sentiment?: boolean | null
          faq?: string | null
          greeting_delay_seconds?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          nickname?: string | null
          objective?: string | null
          organization_id?: string | null
          out_of_hours_message?: string | null
          products_services?: string | null
          response_delay_max?: number | null
          response_delay_min?: number | null
          sign_conversations?: boolean | null
          simulate_typing?: boolean | null
          updated_at?: string
          use_business_hours?: boolean | null
          user_id: string
        }
        Update: {
          agent_profile?: string | null
          auto_escalate_enabled?: boolean | null
          auto_greet_enabled?: boolean | null
          communication_style?: string | null
          company_info?: string | null
          created_at?: string
          escalate_after_messages?: number | null
          escalate_keywords?: string[] | null
          escalate_on_sentiment?: boolean | null
          faq?: string | null
          greeting_delay_seconds?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          nickname?: string | null
          objective?: string | null
          organization_id?: string | null
          out_of_hours_message?: string | null
          products_services?: string | null
          response_delay_max?: number | null
          response_delay_min?: number | null
          sign_conversations?: boolean | null
          simulate_typing?: boolean | null
          updated_at?: string
          use_business_hours?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      attendant_availability: {
        Row: {
          current_conversations: number | null
          id: string
          is_available: boolean | null
          last_assignment_at: string | null
          max_conversations: number | null
          organization_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          current_conversations?: number | null
          id?: string
          is_available?: boolean | null
          last_assignment_at?: string | null
          max_conversations?: number | null
          organization_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          current_conversations?: number | null
          id?: string
          is_available?: boolean | null
          last_assignment_at?: string | null
          max_conversations?: number | null
          organization_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendant_availability_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_recharge_config: {
        Row: {
          card_brand: string | null
          card_last_four: string | null
          card_token: string | null
          cardholder_name: string | null
          created_at: string
          customer_id: string | null
          id: string
          is_enabled: boolean | null
          min_balance_threshold: number | null
          organization_id: string
          recharge_amount: number | null
          updated_at: string
        }
        Insert: {
          card_brand?: string | null
          card_last_four?: string | null
          card_token?: string | null
          cardholder_name?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          is_enabled?: boolean | null
          min_balance_threshold?: number | null
          organization_id: string
          recharge_amount?: number | null
          updated_at?: string
        }
        Update: {
          card_brand?: string | null
          card_last_four?: string | null
          card_token?: string | null
          cardholder_name?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          is_enabled?: boolean | null
          min_balance_threshold?: number | null
          organization_id?: string
          recharge_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "auto_recharge_config_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      away_message_config: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean | null
          message: string | null
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean | null
          message?: string | null
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean | null
          message?: string | null
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "away_message_config_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      balance_transactions: {
        Row: {
          amount: number
          balance_after: number
          balance_before: number
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          organization_id: string
          reference_id: string | null
          reference_type: string | null
          type: string
        }
        Insert: {
          amount: number
          balance_after: number
          balance_before: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          organization_id: string
          reference_id?: string | null
          reference_type?: string | null
          type: string
        }
        Update: {
          amount?: number
          balance_after?: number
          balance_before?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          organization_id?: string
          reference_id?: string | null
          reference_type?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "balance_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      blacklist: {
        Row: {
          blocked_by: string | null
          created_at: string
          id: string
          name: string | null
          organization_id: string
          phone: string
          reason: string | null
          updated_at: string
        }
        Insert: {
          blocked_by?: string | null
          created_at?: string
          id?: string
          name?: string | null
          organization_id: string
          phone: string
          reason?: string | null
          updated_at?: string
        }
        Update: {
          blocked_by?: string | null
          created_at?: string
          id?: string
          name?: string | null
          organization_id?: string
          phone?: string
          reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blacklist_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      business_hours: {
        Row: {
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean | null
          organization_id: string | null
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_time?: string
          id?: string
          is_active?: boolean | null
          organization_id?: string | null
          start_time?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean | null
          organization_id?: string | null
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_hours_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_channels: {
        Row: {
          campaign_id: string
          channel_id: string
          id: string
          order_index: number
          template_id: string | null
        }
        Insert: {
          campaign_id: string
          channel_id: string
          id?: string
          order_index?: number
          template_id?: string | null
        }
        Update: {
          campaign_id?: string
          channel_id?: string
          id?: string
          order_index?: number
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_channels_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_channels_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_channels_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          chatbot_enabled: boolean
          chatbot_id: string | null
          completed_at: string | null
          created_at: string
          delivered_count: number
          dispatch_interval: number
          failed_count: number
          id: string
          max_interval: number | null
          min_interval: number | null
          name: string
          organization_id: string | null
          scheduled_at: string | null
          sent_count: number
          started_at: string | null
          status: string
          team: string | null
          total_recipients: number
          unified_template_id: string | null
          updated_at: string
          use_unified_template: boolean
          user_id: string
        }
        Insert: {
          chatbot_enabled?: boolean
          chatbot_id?: string | null
          completed_at?: string | null
          created_at?: string
          delivered_count?: number
          dispatch_interval?: number
          failed_count?: number
          id?: string
          max_interval?: number | null
          min_interval?: number | null
          name: string
          organization_id?: string | null
          scheduled_at?: string | null
          sent_count?: number
          started_at?: string | null
          status?: string
          team?: string | null
          total_recipients?: number
          unified_template_id?: string | null
          updated_at?: string
          use_unified_template?: boolean
          user_id: string
        }
        Update: {
          chatbot_enabled?: boolean
          chatbot_id?: string | null
          completed_at?: string | null
          created_at?: string
          delivered_count?: number
          dispatch_interval?: number
          failed_count?: number
          id?: string
          max_interval?: number | null
          min_interval?: number | null
          name?: string
          organization_id?: string | null
          scheduled_at?: string | null
          sent_count?: number
          started_at?: string | null
          status?: string
          team?: string | null
          total_recipients?: number
          unified_template_id?: string | null
          updated_at?: string
          use_unified_template?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_chatbot_id_fkey"
            columns: ["chatbot_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_unified_template_id_fkey"
            columns: ["unified_template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_templates: {
        Row: {
          approved_at: string
          channel_id: string
          id: string
          template_id: string
        }
        Insert: {
          approved_at?: string
          channel_id: string
          id?: string
          template_id: string
        }
        Update: {
          approved_at?: string
          channel_id?: string
          id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_templates_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_templates_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          access_token: string | null
          app_name: string | null
          connected: boolean
          created_at: string
          id: string
          name: string
          organization_id: string | null
          phone: string
          provider: string
          updated_at: string
          user_id: string
          waba_id: string | null
          webhook_verify_token: string | null
        }
        Insert: {
          access_token?: string | null
          app_name?: string | null
          connected?: boolean
          created_at?: string
          id?: string
          name: string
          organization_id?: string | null
          phone: string
          provider?: string
          updated_at?: string
          user_id: string
          waba_id?: string | null
          webhook_verify_token?: string | null
        }
        Update: {
          access_token?: string | null
          app_name?: string | null
          connected?: boolean
          created_at?: string
          id?: string
          name?: string
          organization_id?: string | null
          phone?: string
          provider?: string
          updated_at?: string
          user_id?: string
          waba_id?: string | null
          webhook_verify_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channels_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_conversations: {
        Row: {
          created_at: string
          id: string
          lead_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_config: {
        Row: {
          agent_id: string | null
          auto_qualify_enabled: boolean | null
          auto_reply_when_unavailable: boolean | null
          away_message: string | null
          channel_id: string | null
          created_at: string
          id: string
          initial_stage_id: string | null
          is_enabled: boolean | null
          organization_id: string | null
          qualification_keywords: string[] | null
          qualified_stage_id: string | null
          transfer_message: string | null
          updated_at: string
          user_id: string
          welcome_message: string | null
        }
        Insert: {
          agent_id?: string | null
          auto_qualify_enabled?: boolean | null
          auto_reply_when_unavailable?: boolean | null
          away_message?: string | null
          channel_id?: string | null
          created_at?: string
          id?: string
          initial_stage_id?: string | null
          is_enabled?: boolean | null
          organization_id?: string | null
          qualification_keywords?: string[] | null
          qualified_stage_id?: string | null
          transfer_message?: string | null
          updated_at?: string
          user_id: string
          welcome_message?: string | null
        }
        Update: {
          agent_id?: string | null
          auto_qualify_enabled?: boolean | null
          auto_reply_when_unavailable?: boolean | null
          away_message?: string | null
          channel_id?: string | null
          created_at?: string
          id?: string
          initial_stage_id?: string | null
          is_enabled?: boolean | null
          organization_id?: string | null
          qualification_keywords?: string[] | null
          qualified_stage_id?: string | null
          transfer_message?: string | null
          updated_at?: string
          user_id?: string
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_config_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_config_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_config_initial_stage_id_fkey"
            columns: ["initial_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_config_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_config_qualified_stage_id_fkey"
            columns: ["qualified_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portfolios: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          organization_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          organization_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          organization_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_portfolios_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portfolios_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_assignments: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          campaign_chatbot_id: string | null
          channel_id: string | null
          conversation_phone: string
          created_at: string
          id: string
          is_bot_handling: boolean | null
          lead_id: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          campaign_chatbot_id?: string | null
          channel_id?: string | null
          conversation_phone: string
          created_at?: string
          id?: string
          is_bot_handling?: boolean | null
          lead_id?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          campaign_chatbot_id?: string | null
          channel_id?: string | null
          conversation_phone?: string
          created_at?: string
          id?: string
          is_bot_handling?: boolean | null
          lead_id?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_assignments_campaign_chatbot_id_fkey"
            columns: ["campaign_chatbot_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_assignments_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_assignments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_notes: {
        Row: {
          channel_id: string | null
          contact_phone: string
          content: string
          created_at: string
          created_by: string
          id: string
          organization_id: string | null
        }
        Insert: {
          channel_id?: string | null
          contact_phone: string
          content: string
          created_at?: string
          created_by: string
          id?: string
          organization_id?: string | null
        }
        Update: {
          channel_id?: string | null
          contact_phone?: string
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_notes_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_costs: {
        Row: {
          campaign_id: string | null
          created_at: string
          dispatch_date: string
          dispatch_type: Database["public"]["Enums"]["dispatch_type"]
          id: string
          organization_id: string | null
          price_per_message: number
          successful_count: number
          total_cost: number
          user_id: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          dispatch_date?: string
          dispatch_type: Database["public"]["Enums"]["dispatch_type"]
          id?: string
          organization_id?: string | null
          price_per_message: number
          successful_count?: number
          total_cost?: number
          user_id: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          dispatch_date?: string
          dispatch_type?: Database["public"]["Enums"]["dispatch_type"]
          id?: string
          organization_id?: string | null
          price_per_message?: number
          successful_count?: number
          total_cost?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_costs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_costs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_pricing: {
        Row: {
          dispatch_type: Database["public"]["Enums"]["dispatch_type"]
          id: string
          price_per_message: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          dispatch_type: Database["public"]["Enums"]["dispatch_type"]
          id?: string
          price_per_message?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          dispatch_type?: Database["public"]["Enums"]["dispatch_type"]
          id?: string
          price_per_message?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      follow_up_instances: {
        Row: {
          channel_id: string | null
          created_at: string
          id: string
          last_message_sent_at: string | null
          lead_id: string
          next_message_index: number | null
          organization_id: string | null
          sequence_id: string
          started_at: string
          started_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          id?: string
          last_message_sent_at?: string | null
          lead_id: string
          next_message_index?: number | null
          organization_id?: string | null
          sequence_id: string
          started_at?: string
          started_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          id?: string
          last_message_sent_at?: string | null
          lead_id?: string
          next_message_index?: number | null
          organization_id?: string | null
          sequence_id?: string
          started_at?: string
          started_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_up_instances_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_instances_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_instances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_instances_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "follow_up_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_up_logs: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          instance_id: string
          message_id: string
          sent_at: string
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          instance_id: string
          message_id: string
          sent_at?: string
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          instance_id?: string
          message_id?: string
          sent_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_up_logs_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "follow_up_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_logs_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "follow_up_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_up_messages: {
        Row: {
          created_at: string
          day_offset: number
          id: string
          order_index: number
          send_time: string
          sequence_id: string
          template_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_offset?: number
          id?: string
          order_index?: number
          send_time?: string
          sequence_id: string
          template_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_offset?: number
          id?: string
          order_index?: number
          send_time?: string
          sequence_id?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_up_messages_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "follow_up_sequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_messages_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_up_sequences: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_up_sequences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          created_at: string
          date: string
          id: string
          is_recurring: boolean | null
          name: string
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          is_recurring?: boolean | null
          name: string
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          is_recurring?: boolean | null
          name?: string
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "holidays_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hygiene_history: {
        Row: {
          blacklisted_count: number
          created_at: string
          duplicate_count: number
          id: string
          invalid_count: number
          leads_deleted: number
          leads_saved: number
          organization_id: string | null
          source_type: string
          total_numbers: number
          user_id: string
          valid_count: number
        }
        Insert: {
          blacklisted_count?: number
          created_at?: string
          duplicate_count?: number
          id?: string
          invalid_count?: number
          leads_deleted?: number
          leads_saved?: number
          organization_id?: string | null
          source_type: string
          total_numbers?: number
          user_id: string
          valid_count?: number
        }
        Update: {
          blacklisted_count?: number
          created_at?: string
          duplicate_count?: number
          id?: string
          invalid_count?: number
          leads_deleted?: number
          leads_saved?: number
          organization_id?: string | null
          source_type?: string
          total_numbers?: number
          user_id?: string
          valid_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "hygiene_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_documents: {
        Row: {
          agent_id: string | null
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          user_id: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_documents_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_custom_field_definitions: {
        Row: {
          created_at: string
          display_order: number | null
          field_label: string
          field_name: string
          field_options: string[] | null
          field_type: string
          id: string
          is_required: boolean | null
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          field_label: string
          field_name: string
          field_options?: string[] | null
          field_type?: string
          id?: string
          is_required?: boolean | null
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number | null
          field_label?: string
          field_name?: string
          field_options?: string[] | null
          field_type?: string
          id?: string
          is_required?: boolean | null
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_custom_field_definitions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_tags: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_tags_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          city: string | null
          created_at: string
          custom_fields: Json | null
          document: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string | null
          phone: string
          stage_id: string | null
          state: string | null
          status: string
          tags: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          custom_fields?: Json | null
          document?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id?: string | null
          phone: string
          stage_id?: string | null
          state?: string | null
          status?: string
          tags?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          city?: string | null
          created_at?: string
          custom_fields?: Json | null
          document?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string | null
          phone?: string
          stage_id?: string | null
          state?: string | null
          status?: string
          tags?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          components: Json | null
          content: string
          created_at: string
          dispatch_type: Database["public"]["Enums"]["dispatch_type"]
          id: string
          name: string
          organization_id: string | null
          status: string
          updated_at: string
          user_id: string
          variable_mappings: Json | null
          variables: string[] | null
        }
        Insert: {
          components?: Json | null
          content: string
          created_at?: string
          dispatch_type?: Database["public"]["Enums"]["dispatch_type"]
          id?: string
          name: string
          organization_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
          variable_mappings?: Json | null
          variables?: string[] | null
        }
        Update: {
          components?: Json | null
          content?: string
          created_at?: string
          dispatch_type?: Database["public"]["Enums"]["dispatch_type"]
          id?: string
          name?: string
          organization_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          variable_mappings?: Json | null
          variables?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_addons: {
        Row: {
          cancelled_at: string | null
          created_at: string
          id: string
          is_active: boolean
          organization_id: string
          price_per_unit: number
          product_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id: string
          price_per_unit: number
          product_id: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          price_per_unit?: number
          product_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_addons_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_addons_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "store_products"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_balance: {
        Row: {
          balance: number
          created_at: string
          id: string
          organization_id: string
          total_credits_added: number
          total_spent: number
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          organization_id: string
          total_credits_added?: number
          total_spent?: number
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          organization_id?: string
          total_credits_added?: number
          total_spent?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_balance_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          has_paid_first_subscription: boolean
          id: string
          is_active: boolean
          is_partner: boolean | null
          logo_url: string | null
          max_channels: number | null
          max_users: number | null
          name: string
          plan: string
          slug: string
          subscription_ends_at: string | null
          subscription_paid_until: string | null
          subscription_started_at: string | null
          subscription_status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          has_paid_first_subscription?: boolean
          id?: string
          is_active?: boolean
          is_partner?: boolean | null
          logo_url?: string | null
          max_channels?: number | null
          max_users?: number | null
          name: string
          plan?: string
          slug: string
          subscription_ends_at?: string | null
          subscription_paid_until?: string | null
          subscription_started_at?: string | null
          subscription_status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          has_paid_first_subscription?: boolean
          id?: string
          is_active?: boolean
          is_partner?: boolean | null
          logo_url?: string | null
          max_channels?: number | null
          max_users?: number | null
          name?: string
          plan?: string
          slug?: string
          subscription_ends_at?: string | null
          subscription_paid_until?: string | null
          subscription_started_at?: string | null
          subscription_status?: string
          updated_at?: string
        }
        Relationships: []
      }
      pipeline_stages: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          order_index: number
          organization_id: string | null
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          order_index?: number
          organization_id?: string | null
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          order_index?: number
          organization_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pix_payments: {
        Row: {
          amount: number
          created_at: string
          expires_at: string | null
          id: string
          mercadopago_id: string
          organization_id: string
          paid_at: string | null
          payment_type: string
          pix_copy_paste: string | null
          pix_qr_code: string | null
          pix_qr_code_base64: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          expires_at?: string | null
          id?: string
          mercadopago_id: string
          organization_id: string
          paid_at?: string | null
          payment_type: string
          pix_copy_paste?: string | null
          pix_qr_code?: string | null
          pix_qr_code_base64?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          mercadopago_id?: string
          organization_id?: string
          paid_at?: string | null
          payment_type?: string
          pix_copy_paste?: string | null
          pix_qr_code?: string | null
          pix_qr_code_base64?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pix_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_active: boolean
          organization_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_responses: {
        Row: {
          category: string | null
          content: string
          created_at: string
          display_order: number | null
          id: string
          is_global: boolean | null
          organization_id: string | null
          shortcut: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string
          display_order?: number | null
          id?: string
          is_global?: boolean | null
          organization_id?: string | null
          shortcut?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string
          display_order?: number | null
          id?: string
          is_global?: boolean | null
          organization_id?: string | null
          shortcut?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_responses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_messages: {
        Row: {
          channel_id: string
          created_at: string
          created_by: string
          destination_name: string | null
          destination_phone: string
          error_message: string | null
          id: string
          lead_id: string | null
          organization_id: string | null
          scheduled_at: string
          sent_at: string | null
          status: string
          template_id: string
          updated_at: string
          variable_values: Json | null
        }
        Insert: {
          channel_id: string
          created_at?: string
          created_by: string
          destination_name?: string | null
          destination_phone: string
          error_message?: string | null
          id?: string
          lead_id?: string | null
          organization_id?: string | null
          scheduled_at: string
          sent_at?: string | null
          status?: string
          template_id: string
          updated_at?: string
          variable_values?: Json | null
        }
        Update: {
          channel_id?: string
          created_at?: string
          created_by?: string
          destination_name?: string | null
          destination_phone?: string
          error_message?: string | null
          id?: string
          lead_id?: string | null
          organization_id?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          template_id?: string
          updated_at?: string
          variable_values?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      sectors: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sectors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      store_products: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          price: number
          product_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          price?: number
          product_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          price?: number
          product_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      store_purchases: {
        Row: {
          amount: number
          created_at: string
          id: string
          organization_id: string
          product_id: string
          purchased_at: string | null
          quantity: number | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          organization_id: string
          product_id: string
          purchased_at?: string | null
          quantity?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          organization_id?: string
          product_id?: string
          purchased_at?: string | null
          quantity?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_purchases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_purchases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "store_products"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_pricing: {
        Row: {
          base_price: number
          id: string
          included_channels: number
          included_users: number
          price_per_channel: number
          price_per_user: number
          promotional_price: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          base_price?: number
          id?: string
          included_channels?: number
          included_users?: number
          price_per_channel?: number
          price_per_user?: number
          promotional_price?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          base_price?: number
          id?: string
          included_channels?: number
          included_users?: number
          price_per_channel?: number
          price_per_user?: number
          promotional_price?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_sectors: {
        Row: {
          created_at: string
          id: string
          sector_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          sector_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          sector_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sectors_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          channel_id: string | null
          content: string | null
          created_at: string
          direction: string
          id: string
          is_read: boolean | null
          media_url: string | null
          message_id: string
          message_type: string
          metadata: Json | null
          organization_id: string | null
          sender_name: string | null
          sender_phone: string
          status: string | null
          updated_at: string
        }
        Insert: {
          channel_id?: string | null
          content?: string | null
          created_at?: string
          direction?: string
          id?: string
          is_read?: boolean | null
          media_url?: string | null
          message_id: string
          message_type?: string
          metadata?: Json | null
          organization_id?: string | null
          sender_name?: string | null
          sender_phone: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          channel_id?: string | null
          content?: string | null
          created_at?: string
          direction?: string
          id?: string
          is_read?: boolean | null
          media_url?: string | null
          message_id?: string
          message_type?: string
          metadata?: Json | null
          organization_id?: string | null
          sender_name?: string | null
          sender_phone?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_add_product_to_organization: {
        Args: {
          _is_free?: boolean
          _organization_id: string
          _product_id: string
          _quantity?: number
        }
        Returns: boolean
      }
      admin_create_user_role: {
        Args: {
          _role?: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      calculate_subscription_total: {
        Args: { _organization_id: string }
        Returns: number
      }
      cancel_addon: { Args: { _addon_id: string }; Returns: boolean }
      check_organization_balance: {
        Args: { _amount: number; _organization_id: string }
        Returns: boolean
      }
      credit_organization_balance: {
        Args: {
          _amount: number
          _created_by?: string
          _description?: string
          _organization_id: string
          _reference_id?: string
          _reference_type?: string
        }
        Returns: boolean
      }
      debit_organization_balance: {
        Args: {
          _amount: number
          _description?: string
          _organization_id: string
          _reference_id?: string
          _reference_type?: string
        }
        Returns: boolean
      }
      debit_organization_balance_allow_negative: {
        Args: {
          _amount: number
          _description?: string
          _organization_id: string
          _reference_id?: string
          _reference_type?: string
        }
        Returns: boolean
      }
      get_user_organization_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_admin_or_supervisor: { Args: { _user_id: string }; Returns: boolean }
      is_phone_blacklisted: {
        Args: { _organization_id: string; _phone: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      purchase_product:
        | {
            Args: { _organization_id: string; _product_id: string }
            Returns: boolean
          }
        | {
            Args: {
              _organization_id: string
              _product_id: string
              _quantity?: number
            }
            Returns: boolean
          }
    }
    Enums: {
      app_role: "admin" | "supervisor" | "atendente" | "super_admin"
      dispatch_type: "marketing" | "utility" | "service"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "supervisor", "atendente", "super_admin"],
      dispatch_type: ["marketing", "utility", "service"],
    },
  },
} as const
