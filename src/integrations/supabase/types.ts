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
    PostgrestVersion: "14.5"
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
          service_guide: string | null
          service_guide_enabled: boolean | null
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
          service_guide?: string | null
          service_guide_enabled?: boolean | null
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
          service_guide?: string | null
          service_guide_enabled?: boolean | null
          sign_conversations?: boolean | null
          simulate_typing?: boolean | null
          updated_at?: string
          use_business_hours?: boolean | null
          user_id?: string
        }
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
      }
      campaign_recipients: {
        Row: {
          button_clicked: string | null
          button_clicked_at: string | null
          campaign_id: string
          created_at: string
          delivered_at: string | null
          error_message: string | null
          id: string
          last_error_code: string | null
          lead_id: string | null
          name: string | null
          next_retry_at: string | null
          phone: string
          read_at: string | null
          retry_count: number | null
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          button_clicked?: string | null
          button_clicked_at?: string | null
          campaign_id: string
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          last_error_code?: string | null
          lead_id?: string | null
          name?: string | null
          next_retry_at?: string | null
          phone: string
          read_at?: string | null
          retry_count?: number | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          button_clicked?: string | null
          button_clicked_at?: string | null
          campaign_id?: string
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          last_error_code?: string | null
          lead_id?: string | null
          name?: string | null
          next_retry_at?: string | null
          phone?: string
          read_at?: string | null
          retry_count?: number | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
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
          manual_variables: Json | null
          max_interval: number | null
          min_interval: number | null
          name: string
          organization_id: string | null
          quality_pause_acknowledged: boolean
          scheduled_at: string | null
          sector_id: string | null
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
          manual_variables?: Json | null
          max_interval?: number | null
          min_interval?: number | null
          name: string
          organization_id?: string | null
          quality_pause_acknowledged?: boolean
          scheduled_at?: string | null
          sector_id?: string | null
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
          manual_variables?: Json | null
          max_interval?: number | null
          min_interval?: number | null
          name?: string
          organization_id?: string | null
          quality_pause_acknowledged?: boolean
          scheduled_at?: string | null
          sector_id?: string | null
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
        Relationships: []
      }
      channel_secrets: {
        Row: {
          access_token: string | null
          api_token: string | null
          channel_id: string
          created_at: string
          id: string
          meta_app_secret: string | null
          updated_at: string
          webhook_verify_token: string | null
        }
        Insert: {
          access_token?: string | null
          api_token?: string | null
          channel_id: string
          created_at?: string
          id?: string
          meta_app_secret?: string | null
          updated_at?: string
          webhook_verify_token?: string | null
        }
        Update: {
          access_token?: string | null
          api_token?: string | null
          channel_id?: string
          created_at?: string
          id?: string
          meta_app_secret?: string | null
          updated_at?: string
          webhook_verify_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_secrets_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: true
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_secrets_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: true
            referencedRelation: "channels_public"
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
        Relationships: []
      }
      channels: {
        Row: {
          access_token: string | null
          app_name: string | null
          connected: boolean
          created_at: string
          id: string
          meta_app_secret: string | null
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
          meta_app_secret?: string | null
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
          meta_app_secret?: string | null
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
        Relationships: []
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
        Relationships: []
      }
      chatbot_config: {
        Row: {
          agent_id: string | null
          auto_qualify_enabled: boolean | null
          auto_reply_when_unavailable: boolean | null
          away_message: string | null
          bot_type: string | null
          channel_id: string | null
          created_at: string
          flow_bot_id: string | null
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
          bot_type?: string | null
          channel_id?: string | null
          created_at?: string
          flow_bot_id?: string | null
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
          bot_type?: string | null
          channel_id?: string | null
          created_at?: string
          flow_bot_id?: string | null
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
        Relationships: []
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
        Relationships: []
      }
      conversation_assignments: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          bot_paused_until: string | null
          campaign_chatbot_id: string | null
          channel_id: string | null
          conversation_phone: string
          created_at: string
          id: string
          is_bot_handling: boolean | null
          lead_id: string | null
          organization_id: string | null
          sector_id: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          bot_paused_until?: string | null
          campaign_chatbot_id?: string | null
          channel_id?: string | null
          conversation_phone: string
          created_at?: string
          id?: string
          is_bot_handling?: boolean | null
          lead_id?: string | null
          organization_id?: string | null
          sector_id?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          bot_paused_until?: string | null
          campaign_chatbot_id?: string | null
          channel_id?: string | null
          conversation_phone?: string
          created_at?: string
          id?: string
          is_bot_handling?: boolean | null
          lead_id?: string | null
          organization_id?: string | null
          sector_id?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      conversation_memory: {
        Row: {
          channel_id: string | null
          collected_info: Json | null
          contact_phone: string
          created_at: string
          expires_at: string
          id: string
          last_interaction_at: string
          memory_summary: string
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          channel_id?: string | null
          collected_info?: Json | null
          contact_phone: string
          created_at?: string
          expires_at?: string
          id?: string
          last_interaction_at?: string
          memory_summary: string
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          channel_id?: string | null
          collected_info?: Json | null
          contact_phone?: string
          created_at?: string
          expires_at?: string
          id?: string
          last_interaction_at?: string
          memory_summary?: string
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      conversation_metrics: {
        Row: {
          agent_message_count: number | null
          assigned_to: string | null
          channel_id: string | null
          conversation_assignment_id: string | null
          created_at: string
          customer_message_count: number | null
          first_message_at: string | null
          first_response_at: string | null
          first_response_time_seconds: number | null
          id: string
          lead_id: string | null
          message_count: number | null
          organization_id: string | null
          resolved_at: string | null
          sector_id: string | null
          total_handling_time_seconds: number | null
          updated_at: string
          wait_time_seconds: number | null
        }
        Insert: {
          agent_message_count?: number | null
          assigned_to?: string | null
          channel_id?: string | null
          conversation_assignment_id?: string | null
          created_at?: string
          customer_message_count?: number | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_time_seconds?: number | null
          id?: string
          lead_id?: string | null
          message_count?: number | null
          organization_id?: string | null
          resolved_at?: string | null
          sector_id?: string | null
          total_handling_time_seconds?: number | null
          updated_at?: string
          wait_time_seconds?: number | null
        }
        Update: {
          agent_message_count?: number | null
          assigned_to?: string | null
          channel_id?: string | null
          conversation_assignment_id?: string | null
          created_at?: string
          customer_message_count?: number | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_time_seconds?: number | null
          id?: string
          lead_id?: string | null
          message_count?: number | null
          organization_id?: string | null
          resolved_at?: string | null
          sector_id?: string | null
          total_handling_time_seconds?: number | null
          updated_at?: string
          wait_time_seconds?: number | null
        }
        Relationships: []
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
        Relationships: []
      }
      conversation_stats: {
        Row: {
          assignment_id: string | null
          channel_id: string | null
          conversation_phone: string | null
          id: string
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_content: string | null
          organization_id: string | null
          sender_name: string | null
          unread_count: number
          updated_at: string
        }
        Insert: {
          assignment_id?: string | null
          channel_id?: string | null
          conversation_phone?: string | null
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          organization_id?: string | null
          sender_name?: string | null
          unread_count?: number
          updated_at?: string
        }
        Update: {
          assignment_id?: string | null
          channel_id?: string | null
          conversation_phone?: string | null
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          organization_id?: string | null
          sender_name?: string | null
          unread_count?: number
          updated_at?: string
        }
        Relationships: []
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
        Relationships: []
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
      flow_bots: {
        Row: {
          ai_fallback_enabled: boolean | null
          ai_fallback_message: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          organization_id: string | null
          transfer_message: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_fallback_enabled?: boolean | null
          ai_fallback_message?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          organization_id?: string | null
          transfer_message?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_fallback_enabled?: boolean | null
          ai_fallback_message?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string | null
          transfer_message?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      flow_edges: {
        Row: {
          created_at: string
          flow_bot_id: string
          id: string
          label: string | null
          source_handle: string | null
          source_node_id: string
          target_node_id: string
        }
        Insert: {
          created_at?: string
          flow_bot_id: string
          id?: string
          label?: string | null
          source_handle?: string | null
          source_node_id: string
          target_node_id: string
        }
        Update: {
          created_at?: string
          flow_bot_id?: string
          id?: string
          label?: string | null
          source_handle?: string | null
          source_node_id?: string
          target_node_id?: string
        }
        Relationships: []
      }
      flow_nodes: {
        Row: {
          created_at: string
          data: Json
          flow_bot_id: string
          id: string
          node_type: string
          position_x: number
          position_y: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: Json
          flow_bot_id: string
          id?: string
          node_type: string
          position_x?: number
          position_y?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          flow_bot_id?: string
          id?: string
          node_type?: string
          position_x?: number
          position_y?: number
          updated_at?: string
        }
        Relationships: []
      }
      flow_sessions: {
        Row: {
          channel_id: string | null
          collected_data: Json | null
          contact_phone: string
          created_at: string
          current_node_id: string | null
          flow_bot_id: string
          follow_up_count: number | null
          id: string
          last_activity_at: string | null
          last_follow_up_at: string | null
          next_follow_up_at: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          channel_id?: string | null
          collected_data?: Json | null
          contact_phone: string
          created_at?: string
          current_node_id?: string | null
          flow_bot_id: string
          follow_up_count?: number | null
          id?: string
          last_activity_at?: string | null
          last_follow_up_at?: string | null
          next_follow_up_at?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          channel_id?: string | null
          collected_data?: Json | null
          contact_phone?: string
          created_at?: string
          current_node_id?: string | null
          flow_bot_id?: string
          follow_up_count?: number | null
          id?: string
          last_activity_at?: string | null
          last_follow_up_at?: string | null
          next_follow_up_at?: string | null
          status?: string | null
          updated_at?: string
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
      }
      lead_activity_log: {
        Row: {
          activity_type: string
          campaign_id: string | null
          channel_id: string | null
          created_at: string
          description: string | null
          id: string
          lead_id: string
          metadata: Json | null
          organization_id: string | null
          performed_by: string | null
          title: string
        }
        Insert: {
          activity_type: string
          campaign_id?: string | null
          channel_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          lead_id: string
          metadata?: Json | null
          organization_id?: string | null
          performed_by?: string | null
          title: string
        }
        Update: {
          activity_type?: string
          campaign_id?: string | null
          channel_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          lead_id?: string
          metadata?: Json | null
          organization_id?: string | null
          performed_by?: string | null
          title?: string
        }
        Relationships: []
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
        Relationships: []
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
        Relationships: []
      }
      leads: {
        Row: {
          bsuid: string | null
          city: string | null
          created_at: string
          custom_fields: Json | null
          document: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string | null
          phone: string | null
          stage_id: string | null
          state: string | null
          status: string
          tags: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bsuid?: string | null
          city?: string | null
          created_at?: string
          custom_fields?: Json | null
          document?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id?: string | null
          phone?: string | null
          stage_id?: string | null
          state?: string | null
          status?: string
          tags?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bsuid?: string | null
          city?: string | null
          created_at?: string
          custom_fields?: Json | null
          document?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string | null
          phone?: string | null
          stage_id?: string | null
          state?: string | null
          status?: string
          tags?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      message_templates: {
        Row: {
          components: Json | null
          content: string
          created_at: string
          dispatch_type: Database["public"]["Enums"]["dispatch_type"]
          header_media_url: string | null
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
          header_media_url?: string | null
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
          header_media_url?: string | null
          id?: string
          name?: string
          organization_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          variable_mappings?: Json | null
          variables?: string[] | null
        }
        Relationships: []
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
        Relationships: []
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
        Relationships: []
      }
      organizations: {
        Row: {
          auto_blacklist_enabled: boolean
          auto_distribute_enabled: boolean
          created_at: string
          custom_subscription_price: number | null
          decline_message_enabled: boolean
          default_sector_id: string | null
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
          auto_blacklist_enabled?: boolean
          auto_distribute_enabled?: boolean
          created_at?: string
          custom_subscription_price?: number | null
          decline_message_enabled?: boolean
          default_sector_id?: string | null
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
          auto_blacklist_enabled?: boolean
          auto_distribute_enabled?: boolean
          created_at?: string
          custom_subscription_price?: number | null
          decline_message_enabled?: boolean
          default_sector_id?: string | null
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
      pending_referrals: {
        Row: {
          created_at: string
          id: string
          referrer_organization_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          referrer_organization_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          referrer_organization_id?: string
          user_id?: string
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
          pipeline_id: string | null
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          order_index?: number
          organization_id?: string | null
          pipeline_id?: string | null
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          order_index?: number
          organization_id?: string | null
          pipeline_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      pipelines: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_default: boolean | null
          name: string
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
      }
      redirect_links: {
        Row: {
          click_count: number | null
          created_at: string | null
          created_by: string
          destinations: Json
          id: string
          is_active: boolean | null
          link_type: string
          name: string
          organization_id: string
          original_url: string | null
          slug: string
          updated_at: string | null
          webchat_link_id: string | null
        }
        Insert: {
          click_count?: number | null
          created_at?: string | null
          created_by: string
          destinations?: Json
          id?: string
          is_active?: boolean | null
          link_type?: string
          name: string
          organization_id: string
          original_url?: string | null
          slug: string
          updated_at?: string | null
          webchat_link_id?: string | null
        }
        Update: {
          click_count?: number | null
          created_at?: string | null
          created_by?: string
          destinations?: Json
          id?: string
          is_active?: boolean | null
          link_type?: string
          name?: string
          organization_id?: string
          original_url?: string | null
          slug?: string
          updated_at?: string | null
          webchat_link_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "redirect_links_webchat_link_id_fkey"
            columns: ["webchat_link_id"]
            isOneToOne: false
            referencedRelation: "webchat_links"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          id: string
          organization_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          organization_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          organization_id?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          commission_amount: number | null
          commission_percentage: number
          created_at: string
          credited_at: string | null
          id: string
          referred_organization_id: string
          referred_user_id: string
          referrer_organization_id: string
          status: string
          subscription_value: number | null
          updated_at: string
        }
        Insert: {
          commission_amount?: number | null
          commission_percentage?: number
          created_at?: string
          credited_at?: string | null
          id?: string
          referred_organization_id: string
          referred_user_id: string
          referrer_organization_id: string
          status?: string
          subscription_value?: number | null
          updated_at?: string
        }
        Update: {
          commission_amount?: number | null
          commission_percentage?: number
          created_at?: string
          credited_at?: string | null
          id?: string
          referred_organization_id?: string
          referred_user_id?: string
          referrer_organization_id?: string
          status?: string
          subscription_value?: number | null
          updated_at?: string
        }
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
      ura_config: {
        Row: {
          channel_id: string
          create_lead_if_not_exists: boolean | null
          created_at: string | null
          id: string
          is_enabled: boolean | null
          organization_id: string
          template_id: string | null
          updated_at: string | null
        }
        Insert: {
          channel_id: string
          create_lead_if_not_exists?: boolean | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          organization_id: string
          template_id?: string | null
          updated_at?: string | null
        }
        Update: {
          channel_id?: string
          create_lead_if_not_exists?: boolean | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          organization_id?: string
          template_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ura_webhook_logs: {
        Row: {
          caller_phone: string
          channel_id: string | null
          created_at: string | null
          error_message: string | null
          id: string
          lead_created: boolean | null
          metadata: Json | null
          template_sent: boolean | null
        }
        Insert: {
          caller_phone: string
          channel_id?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          lead_created?: boolean | null
          metadata?: Json | null
          template_sent?: boolean | null
        }
        Update: {
          caller_phone?: string
          channel_id?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          lead_created?: boolean | null
          metadata?: Json | null
          template_sent?: boolean | null
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
        Relationships: []
      }
      user_sessions: {
        Row: {
          device_info: string | null
          id: string
          ip_address: string | null
          last_active_at: string
          logged_in_at: string
          session_token: string
          user_id: string
        }
        Insert: {
          device_info?: string | null
          id?: string
          ip_address?: string | null
          last_active_at?: string
          logged_in_at?: string
          session_token: string
          user_id: string
        }
        Update: {
          device_info?: string | null
          id?: string
          ip_address?: string | null
          last_active_at?: string
          logged_in_at?: string
          session_token?: string
          user_id?: string
        }
        Relationships: []
      }
      webchat_links: {
        Row: {
          channel_id: string | null
          created_at: string
          greeting_message: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          theme_color: string
          updated_at: string
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          greeting_message?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          theme_color?: string
          updated_at?: string
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          greeting_message?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          theme_color?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "webchat_links_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_links_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          created_at: string
          created_by: string
          events: string[]
          headers: Json | null
          id: string
          is_active: boolean | null
          name: string
          organization_id: string | null
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by: string
          events?: string[]
          headers?: Json | null
          id?: string
          is_active?: boolean | null
          name: string
          organization_id?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string
          events?: string[]
          headers?: Json | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      welcome_message_config: {
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
        Relationships: []
      }
      welcome_message_sent: {
        Row: {
          channel_id: string | null
          contact_phone: string
          id: string
          organization_id: string | null
          sent_at: string
        }
        Insert: {
          channel_id?: string | null
          contact_phone: string
          id?: string
          organization_id?: string | null
          sent_at?: string
        }
        Update: {
          channel_id?: string | null
          contact_phone?: string
          id?: string
          organization_id?: string | null
          sent_at?: string
        }
        Relationships: []
      }
      whatsapp_contacts: {
        Row: {
          channel_id: string
          created_at: string | null
          id: string
          last_message_at: string | null
          organization_id: string | null
          sender_name: string | null
          sender_phone: string | null
        }
        Insert: {
          channel_id: string
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          organization_id?: string | null
          sender_name?: string | null
          sender_phone?: string | null
        }
        Update: {
          channel_id?: string
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          organization_id?: string | null
          sender_name?: string | null
          sender_phone?: string | null
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          channel_id: string | null
          content: string | null
          created_at: string
          direction: string
          error_message: string | null
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
          error_message?: string | null
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
          error_message?: string | null
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
        Relationships: []
      }
    }
    Views: {
      channels_public: {
        Row: {
          app_name: string | null
          connected: boolean | null
          created_at: string | null
          id: string | null
          name: string | null
          organization_id: string | null
          phone: string | null
          provider: string | null
          updated_at: string | null
          user_id: string | null
          waba_id: string | null
        }
        Insert: {
          app_name?: string | null
          connected?: boolean | null
          created_at?: string | null
          id?: string | null
          name?: string | null
          organization_id?: string | null
          phone?: string | null
          provider?: string | null
          updated_at?: string | null
          user_id?: string | null
          waba_id?: string | null
        }
        Update: {
          app_name?: string | null
          connected?: boolean | null
          created_at?: string | null
          id?: string | null
          name?: string | null
          organization_id?: string | null
          phone?: string | null
          provider?: string | null
          updated_at?: string | null
          user_id?: string | null
          waba_id?: string | null
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
      archive_conversation_ext: {
        Args: { p_channel_id: string; p_phone: string }
        Returns: undefined
      }
      assert_org_access: { Args: { p_org: string }; Returns: undefined }
      cancel_addon: { Args: { _addon_id: string }; Returns: boolean }
      check_organization_balance: {
        Args: { _amount: number; _organization_id: string }
        Returns: boolean
      }
      claim_campaign_recipients: {
        Args: {
          p_batch_size: number
          p_campaign_id: string
          p_include_retries?: boolean
        }
        Returns: {
          id: string
          is_retry: boolean
          last_error_code: string
          lead_id: string
          name: string
          phone: string
          retry_count: number
          status: string
        }[]
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
      delete_channel_cascade: {
        Args: { _channel_id: string }
        Returns: boolean
      }
      delete_organization_cascade: {
        Args: { _organization_id: string }
        Returns: boolean
      }
      effective_org_id: { Args: never; Returns: string }
      force_sync_all_campaign_counts: { Args: never; Returns: undefined }
      generate_referral_code: { Args: never; Returns: string }
      get_attendant_conversations_ext: {
        Args: {
          p_channel_ids: string[]
          p_limit?: number
          p_organization_id: string
          p_sector_ids?: string[]
          p_user_id: string
        }
        Returns: {
          assigned_to: string
          assignment_id: string
          assignment_updated_at: string
          bot_paused_until: string
          campaign_chatbot_id: string
          channel_id: string
          conversation_phone: string
          is_bot_handling: boolean
          last_inbound_at: string
          last_message_at: string
          last_message_content: string
          lead_id: string
          sector_id: string
          sender_name: string
          status: string
          unread_count: number
        }[]
      }
      get_campaign_counts: {
        Args: { p_campaign_id: string }
        Returns: {
          total_delivered: number
          total_failed: number
          total_pending: number
          total_processing: number
          total_sent: number
          total_waiting_retry: number
        }[]
      }
      get_campaign_real_counts: {
        Args: { p_campaign_ids: string[] }
        Returns: {
          campaign_id: string
          delivered_count: number
          failed_count: number
          interacted_count: number
          read_count: number
          recipients_count: number
          sent_count: number
        }[]
      }
      get_campaign_sector_for_phone: {
        Args: { _organization_id: string; _phone: string }
        Returns: string
      }
      get_channel_by_api_token: {
        Args: { _token: string }
        Returns: {
          access_token: string
          app_name: string
          id: string
          name: string
          organization_id: string
          phone: string
          provider: string
          user_id: string
          waba_id: string
        }[]
      }
      get_conversations_summary_ext:
        | {
            Args: {
              p_channel_ids: string[]
              p_limit?: number
              p_offset?: number
            }
            Returns: {
              assigned_to: string
              assignment_id: string
              assignment_updated_at: string
              bot_paused_until: string
              campaign_chatbot_id: string
              channel_id: string
              conversation_phone: string
              is_bot_handling: boolean
              last_inbound_at: string
              last_message_at: string
              last_message_content: string
              lead_id: string
              sector_id: string
              sender_name: string
              status: string
              unread_count: number
            }[]
          }
        | {
            Args: { p_channel_ids: string[]; p_organization_id: string }
            Returns: {
              assigned_to: string
              assignment_id: string
              assignment_updated_at: string
              channel_id: string
              conversation_phone: string
              last_inbound_at: string
              last_message_at: string
              last_message_content: string
              lead_id: string
              sector_id: string
              sender_name: string
              status: string
              unread_count: number
            }[]
          }
      get_conversations_summary_paginated_ext: {
        Args: {
          p_channel_ids: string[]
          p_limit?: number
          p_offset?: number
          p_organization_id: string
        }
        Returns: {
          assigned_to: string
          assignment_id: string
          assignment_updated_at: string
          bot_paused_until: string
          campaign_chatbot_id: string
          channel_id: string
          conversation_phone: string
          is_bot_handling: boolean
          last_inbound_at: string
          last_message_at: string
          last_message_content: string
          lead_id: string
          sector_id: string
          sender_name: string
          status: string
          unread_count: number
        }[]
      }
      get_jwt_organization_id: { Args: never; Returns: string }
      get_or_create_referral_code: { Args: { org_id: string }; Returns: string }
      get_unread_conversations_full_ext: {
        Args: { p_channel_ids: string[]; p_organization_id: string }
        Returns: {
          assigned_to: string
          assignment_id: string
          assignment_updated_at: string
          bot_paused_until: string
          campaign_chatbot_id: string
          channel_id: string
          conversation_phone: string
          is_bot_handling: boolean
          last_inbound_at: string
          last_message_at: string
          last_message_content: string
          lead_id: string
          sector_id: string
          sender_name: string
          status: string
          unread_count: number
        }[]
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
      log_redirect_click: { Args: { link_id: string }; Returns: undefined }
      purchase_product: {
        Args: {
          _organization_id: string
          _product_id: string
          _quantity?: number
        }
        Returns: boolean
      }
      register_user_session: {
        Args: {
          _device_info?: string
          _ip_address?: string
          _session_token: string
        }
        Returns: boolean
      }
      reset_conversation_unread_ext:
        | { Args: { p_channel_id: string }; Returns: undefined }
        | {
            Args: { p_channel_id: string; p_phone: string }
            Returns: undefined
          }
      resolve_redirect_link_v2: {
        Args: { _slug: string }
        Returns: {
          destinations: Json
          id: string
          link_type: string
          original_url: string
          webchat_link_id: string
        }[]
      }
      restore_conversation_ext: {
        Args: { p_channel_id: string; p_phone: string }
        Returns: undefined
      }
      search_conversations_global_ext: {
        Args: {
          p_channel_ids: string[]
          p_limit?: number
          p_organization_id: string
          p_search_term: string
        }
        Returns: {
          assigned_to: string
          assignment_id: string
          assignment_updated_at: string
          bot_paused_until: string
          campaign_chatbot_id: string
          channel_id: string
          conversation_phone: string
          is_bot_handling: boolean
          last_inbound_at: string
          last_message_at: string
          last_message_content: string
          lead_id: string
          sector_id: string
          sender_name: string
          status: string
          unread_count: number
        }[]
      }
      set_org_auto_reply_flags: {
        Args: {
          p_auto_blacklist_enabled: boolean
          p_decline_message_enabled: boolean
          p_organization_id: string
        }
        Returns: undefined
      }
      set_org_default_sector: {
        Args: {
          _enabled: boolean
          _organization_id: string
          _sector_id: string
        }
        Returns: undefined
      }
      update_session_activity: { Args: never; Returns: boolean }
      upsert_conversation_stats_external: {
        Args: {
          _channel_id: string
          _content: string
          _conversation_phone: string
          _created_at?: string
          _direction: string
          _is_read: boolean
          _organization_id: string
          _sender_name: string
        }
        Returns: string
      }
      validate_user_session: {
        Args: { _session_token: string }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
