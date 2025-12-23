import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { User, Mail, Shield, Save, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function Perfil() {
  const { user } = useAuth();
  const { role, loading: roleLoading } = useUserRole();
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) {
          console.error("Error fetching profile:", error);
        } else if (data) {
          setDisplayName(data.display_name || "");
        }
      } catch (err) {
        console.error("Error fetching profile:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: displayName })
        .eq("user_id", user.id);

      if (error) {
        console.error("Error updating profile:", error);
        toast.error("Erro ao salvar perfil");
      } else {
        toast.success("Perfil atualizado com sucesso!");
      }
    } catch (err) {
      console.error("Error updating profile:", err);
      toast.error("Erro ao salvar perfil");
    } finally {
      setSaving(false);
    }
  };

  const handleClearRoleCache = () => {
    try {
      localStorage.removeItem("user_role_cache");
      toast.success("Cache limpo! Recarregando a página...");
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err) {
      console.error("Error clearing cache:", err);
      toast.error("Erro ao limpar cache");
    }
  };

  const getRoleLabel = (role: string | null) => {
    switch (role) {
      case "super_admin":
        return "Super Admin";
      case "admin":
        return "Administrador";
      case "supervisor":
        return "Supervisor";
      case "atendente":
        return "Atendente";
      default:
        return "Sem função";
    }
  };

  const getRoleVariant = (role: string | null) => {
    switch (role) {
      case "super_admin":
        return "destructive";
      case "admin":
        return "default";
      case "supervisor":
        return "secondary";
      case "atendente":
        return "outline";
      default:
        return "outline";
    }
  };

  if (loading || roleLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6 max-w-2xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold">Meu Perfil</h1>
          <p className="text-muted-foreground">
            Visualize e edite suas informações pessoais
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Informações Pessoais
            </CardTitle>
            <CardDescription>
              Atualize suas informações de perfil
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="displayName">Nome de Exibição</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Seu nome"
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Email
              </Label>
              <Input
                value={user?.email || ""}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                O email não pode ser alterado
              </p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Função
              </Label>
              <div className="flex items-center gap-3">
                <Badge variant={getRoleVariant(role) as any}>
                  {getRoleLabel(role)}
                </Badge>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleClearRoleCache}
                  className="gap-2"
                >
                  <RefreshCw className="w-3 h-3" />
                  Atualizar Permissões
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Sua função é definida por um administrador. Use "Atualizar Permissões" se suas permissões foram alteradas recentemente.
              </p>
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Salvar Alterações
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}