import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

interface SubscriptionStatus {
  isActive: boolean;
  paidUntil: Date | null;
  daysRemaining: number;
  needsPayment: boolean;
}

export function useSubscription() {
  const { user } = useAuth();

  // Get organization info
  const { data: organization, isLoading } = useQuery({
    queryKey: ["organization-subscription", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      // First get user's organization_id
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!profile?.organization_id) return null;

      // Then get organization details
      const { data: org, error } = await supabase
        .from("organizations")
        .select("id, subscription_status, subscription_paid_until, subscription_started_at, subscription_ends_at, max_users, max_channels, has_paid_first_subscription")
        .eq("id", profile.organization_id)
        .maybeSingle();

      if (error) throw error;
      return org;
    },
    enabled: !!user?.id,
    refetchInterval: 60000, // Check every minute
  });

  const getSubscriptionStatus = (): SubscriptionStatus => {
    if (!organization) {
      return {
        isActive: true, // Default to active if we can't determine status
        paidUntil: null,
        daysRemaining: 0,
        needsPayment: false,
      };
    }

    const paidUntil = organization.subscription_paid_until 
      ? new Date(organization.subscription_paid_until) 
      : null;
    
    const now = new Date();
    
    // If no payment date set, check subscription_ends_at
    if (!paidUntil) {
      const endsAt = organization.subscription_ends_at 
        ? new Date(organization.subscription_ends_at) 
        : null;
      
      if (endsAt && endsAt < now) {
        return {
          isActive: false,
          paidUntil: null,
          daysRemaining: 0,
          needsPayment: true,
        };
      }
      
      // Trial or free plan
      return {
        isActive: organization.subscription_status === 'active' || organization.subscription_status === 'trial',
        paidUntil: null,
        daysRemaining: endsAt ? Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : 30,
        needsPayment: false,
      };
    }

    const daysRemaining = Math.ceil((paidUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const isActive = daysRemaining > 0;
    const needsPayment = daysRemaining <= 0;

    return {
      isActive,
      paidUntil,
      daysRemaining: Math.max(0, daysRemaining),
      needsPayment,
    };
  };

  return {
    ...getSubscriptionStatus(),
    isLoading,
    organization,
  };
}
