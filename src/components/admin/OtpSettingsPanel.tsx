import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { isOtpAdminEmail } from "@/lib/otpAdmin";

/**
 * Kill-switch global do OTP de login.
 * Renderizado apenas para a conta break-glass; a escrita é validada no servidor
 * pela edge function `otp-settings-write` (403 para qualquer outro e-mail).
 * O canal/template de envio vem do pool de templates marcados como "Usar para OTP".
 */
export function OtpSettingsPanel() {
  const { user } = useAuth();
  const isAdmin = isOtpAdminEmail(user?.email);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from("otp_settings")
        .select("otp_login_enabled")
        .eq("id", true)
        .maybeSingle();

      if (cancelled) return;
      setEnabled(!!data?.otp_login_enabled);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [isAdmin]);

  const save = useCallback(async (otp_login_enabled: boolean) => {
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("otp-settings-write", {
      body: { otp_login_enabled },
    });
    setSaving(false);

    const payloadError = (data as { error?: string } | null)?.error;
    if (error || payloadError) {
      toast.error(payloadError || "Não foi possível salvar a configuração do OTP.");
      return;
    }
    setEnabled(!!(data as { settings?: { otp_login_enabled?: boolean } } | null)?.settings?.otp_login_enabled);
    toast.success("Configuração do OTP atualizada.");
  }, []);

  if (!isAdmin) return null;

  return (
    <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="w-5 h-5 text-primary" />
        <h2 className="font-semibold text-foreground">Autenticação por código (OTP) — configuração global</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Esta configuração é <strong>global</strong>: vale para todos os usuários de todas as organizações.
        Os códigos são enviados em rodízio entre os templates de autenticação marcados como
        “Usar para OTP” (aquecendo todas as BMs). A conta {user?.email} nunca é barrada pelo OTP (break-glass).
      </p>

      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      ) : (
        <div className="flex items-center justify-between rounded-lg border border-border bg-background p-3">
          <div>
            <Label className="text-foreground">
              OTP no login — {enabled ? "Ligada" : "Desligada"}
            </Label>
            <p className="text-xs text-muted-foreground">
              Ligado, todos os usuários (exceto o break-glass) precisam confirmar um código por dia.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            <Switch
              checked={enabled}
              disabled={saving}
              onCheckedChange={(checked) => void save(checked)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
