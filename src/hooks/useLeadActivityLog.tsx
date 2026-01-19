import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface LeadActivity {
  id: string;
  activity_type: string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
  performed_by: string | null;
  performer_name?: string;
  channel_id: string | null;
  campaign_id: string | null;
  campaign_name?: string;
  created_at: string;
}

export function useLeadActivityLog(leadId: string | null) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [activities, setActivities] = useState<LeadActivity[]>([]);

  const fetchActivities = useCallback(async () => {
    if (!leadId) {
      setActivities([]);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("lead_activity_log")
        .select(`
          *,
          campaigns:campaign_id (name)
        `)
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;

      // Fetch performer names
      const performerIds = [...new Set(data?.map(a => a.performed_by).filter(Boolean) as string[])];
      let performerMap: Record<string, string> = {};
      
      if (performerIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, display_name, email")
          .in("user_id", performerIds);

        if (profiles) {
          performerMap = profiles.reduce((acc, p) => {
            acc[p.user_id] = p.display_name || p.email || "Usuário";
            return acc;
          }, {} as Record<string, string>);
        }
      }

      const enrichedActivities: LeadActivity[] = (data || []).map(activity => ({
        ...activity,
        metadata: (activity.metadata as Record<string, unknown>) || {},
        performer_name: activity.performed_by ? performerMap[activity.performed_by] : undefined,
        campaign_name: (activity.campaigns as { name: string } | null)?.name,
      }));

      setActivities(enrichedActivities);
    } catch (error) {
      console.error("Error fetching lead activities:", error);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  const logActivity = useCallback(async (
    leadId: string,
    activityType: string,
    title: string,
    description?: string,
    metadata?: Record<string, unknown>,
    channelId?: string,
    campaignId?: string
  ) => {
    if (!user) return;

    try {
      // Get organization_id from lead
      const { data: lead } = await supabase
        .from("leads")
        .select("organization_id")
        .eq("id", leadId)
        .single();

      if (!lead) return;

      const { error } = await supabase
        .from("lead_activity_log")
        .insert([{
          lead_id: leadId,
          organization_id: lead.organization_id,
          activity_type: activityType,
          title,
          description: description || null,
          metadata: (metadata || {}) as unknown as Record<string, never>,
          performed_by: user.id,
          channel_id: channelId || null,
          campaign_id: campaignId || null,
        }]);

      if (error) throw error;

      // Refresh activities
      fetchActivities();
    } catch (error) {
      console.error("Error logging activity:", error);
    }
  }, [user, fetchActivities]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!leadId) return;

    const channel = supabase
      .channel(`lead_activity_${leadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "lead_activity_log",
          filter: `lead_id=eq.${leadId}`,
        },
        () => {
          fetchActivities();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leadId, fetchActivities]);

  return {
    loading,
    activities,
    logActivity,
    refetch: fetchActivities,
  };
}

// Activity type icons and colors mapping
export const activityTypeConfig: Record<string, { icon: string; color: string; label: string }> = {
  message_sent: { icon: "Send", color: "text-blue-500", label: "Mensagem enviada" },
  message_received: { icon: "MessageSquare", color: "text-green-500", label: "Mensagem recebida" },
  stage_changed: { icon: "ArrowRight", color: "text-purple-500", label: "Etapa alterada" },
  tag_added: { icon: "Tag", color: "text-orange-500", label: "Tag adicionada" },
  tag_removed: { icon: "X", color: "text-red-500", label: "Tag removida" },
  note_added: { icon: "StickyNote", color: "text-yellow-500", label: "Nota adicionada" },
  campaign_sent: { icon: "Megaphone", color: "text-indigo-500", label: "Campanha enviada" },
  follow_up_sent: { icon: "Clock", color: "text-cyan-500", label: "Follow-up enviado" },
  assigned_to: { icon: "UserCheck", color: "text-emerald-500", label: "Atribuído a" },
  conversation_started: { icon: "MessageCircle", color: "text-blue-400", label: "Conversa iniciada" },
  conversation_resolved: { icon: "CheckCircle", color: "text-green-600", label: "Conversa finalizada" },
  custom_field_updated: { icon: "Edit", color: "text-gray-500", label: "Campo atualizado" },
};
