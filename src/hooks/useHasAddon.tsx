import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useHasAddon(productName: string) {
  const { user } = useAuth();

  // Get organization info
  const { data: profile } = useQuery({
    queryKey: ["profile-for-addon", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Check if organization has the addon
  const { data: hasAddon, isLoading } = useQuery({
    queryKey: ["organization-addon", profile?.organization_id, productName],
    queryFn: async () => {
      if (!profile?.organization_id) return false;

      // Find the product by name
      const { data: product, error: productError } = await supabase
        .from("store_products")
        .select("id")
        .ilike("name", `%${productName}%`)
        .eq("product_type", "addon")
        .maybeSingle();

      if (productError || !product) return false;

      // Check if organization has an active addon for this product
      const { data: addon, error: addonError } = await supabase
        .from("organization_addons")
        .select("id, is_active")
        .eq("organization_id", profile.organization_id)
        .eq("product_id", product.id)
        .eq("is_active", true)
        .maybeSingle();

      if (addonError) return false;
      return !!addon;
    },
    enabled: !!profile?.organization_id,
  });

  return {
    hasAddon: hasAddon ?? false,
    isLoading,
    organizationId: profile?.organization_id,
  };
}
