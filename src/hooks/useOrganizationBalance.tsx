import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "@/hooks/use-toast";

interface OrganizationBalance {
  id: string;
  organization_id: string;
  balance: number;
  total_credits_added: number;
  total_spent: number;
  created_at: string;
  updated_at: string;
}

interface BalanceTransaction {
  id: string;
  organization_id: string;
  type: "credit" | "debit";
  amount: number;
  balance_before: number;
  balance_after: number;
  description: string | null;
  reference_type: string | null;
  reference_id: string | null;
  created_by: string | null;
  created_at: string;
}

export function useOrganizationBalance(organizationId?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Get the user's organization if not provided
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && !organizationId,
  });

  const effectiveOrgId = organizationId || profile?.organization_id;

  // Fetch balance
  const {
    data: balance,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["organization-balance", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return null;
      
      const { data, error } = await supabase
        .from("organization_balance")
        .select("*")
        .eq("organization_id", effectiveOrgId)
        .maybeSingle();
      
      if (error) throw error;
      return data as OrganizationBalance | null;
    },
    enabled: !!effectiveOrgId,
    staleTime: 30 * 1000, // Data stays fresh for 30 seconds
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    refetchOnWindowFocus: false,
  });

  // Subscribe to realtime balance updates
  useEffect(() => {
    if (!effectiveOrgId) return;

    console.log("Setting up realtime balance subscription for:", effectiveOrgId);

    const channel = supabase
      .channel("organization-balance-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "organization_balance",
          filter: `organization_id=eq.${effectiveOrgId}`,
        },
        (payload) => {
          console.log("Balance update received:", payload);
          queryClient.invalidateQueries({ queryKey: ["organization-balance", effectiveOrgId] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "balance_transactions",
          filter: `organization_id=eq.${effectiveOrgId}`,
        },
        (payload) => {
          console.log("New transaction received:", payload);
          queryClient.invalidateQueries({ queryKey: ["balance-transactions", effectiveOrgId] });
          queryClient.invalidateQueries({ queryKey: ["organization-balance", effectiveOrgId] });
        }
      )
      .subscribe((status) => {
        console.log("Balance subscription status:", status);
      });

    return () => {
      console.log("Cleaning up balance subscription");
      supabase.removeChannel(channel);
    };
  }, [effectiveOrgId, queryClient]);

  // Fetch transactions
  const { data: transactions } = useQuery({
    queryKey: ["balance-transactions", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      
      const { data, error } = await supabase
        .from("balance_transactions")
        .select("*")
        .eq("organization_id", effectiveOrgId)
        .order("created_at", { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as BalanceTransaction[];
    },
    enabled: !!effectiveOrgId,
    staleTime: 60 * 1000, // Data stays fresh for 1 minute
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    refetchOnWindowFocus: false,
  });

  // Check if has sufficient balance
  const checkBalance = async (amount: number): Promise<boolean> => {
    if (!effectiveOrgId) return false;
    
    const { data, error } = await supabase.rpc("check_organization_balance", {
      _organization_id: effectiveOrgId,
      _amount: amount,
    });
    
    if (error) {
      console.error("Error checking balance:", error);
      return false;
    }
    
    return data === true;
  };

  // Debit balance (for sending messages)
  const debitBalance = async (
    amount: number,
    description?: string,
    referenceType?: string,
    referenceId?: string
  ): Promise<boolean> => {
    if (!effectiveOrgId) return false;
    
    const { data, error } = await supabase.rpc("debit_organization_balance", {
      _organization_id: effectiveOrgId,
      _amount: amount,
      _description: description || null,
      _reference_type: referenceType || null,
      _reference_id: referenceId || null,
    });
    
    if (error) {
      console.error("Error debiting balance:", error);
      return false;
    }
    
    // Invalidate balance query
    queryClient.invalidateQueries({ queryKey: ["organization-balance", effectiveOrgId] });
    queryClient.invalidateQueries({ queryKey: ["balance-transactions", effectiveOrgId] });
    
    return data === true;
  };

  // Credit balance (for adding credits - admin only)
  const addCreditsMutation = useMutation({
    mutationFn: async ({
      amount,
      description,
      referenceType,
      referenceId,
    }: {
      amount: number;
      description?: string;
      referenceType?: string;
      referenceId?: string;
    }) => {
      if (!effectiveOrgId) throw new Error("No organization ID");
      
      const { data, error } = await supabase.rpc("credit_organization_balance", {
        _organization_id: effectiveOrgId,
        _amount: amount,
        _description: description || null,
        _reference_type: referenceType || "manual",
        _reference_id: referenceId || null,
        _created_by: user?.id || null,
      });
      
      if (error) throw error;
      if (!data) throw new Error("Failed to add credits");
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization-balance", effectiveOrgId] });
      queryClient.invalidateQueries({ queryKey: ["balance-transactions", effectiveOrgId] });
      toast({
        title: "Créditos adicionados",
        description: "O saldo foi atualizado com sucesso.",
      });
    },
    onError: (error) => {
      console.error("Error adding credits:", error);
      toast({
        title: "Erro ao adicionar créditos",
        description: "Não foi possível adicionar os créditos.",
        variant: "destructive",
      });
    },
  });

  return {
    balance,
    transactions,
    isLoading,
    error,
    checkBalance,
    debitBalance,
    addCredits: addCreditsMutation.mutate,
    isAddingCredits: addCreditsMutation.isPending,
    currentBalance: balance?.balance ?? 0,
    organizationId: effectiveOrgId,
  };
}
