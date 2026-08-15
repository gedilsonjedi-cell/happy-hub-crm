import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { isOtpAdminEmail } from "@/lib/otpAdmin";

const OTP_ORG_NAME = "OTP Optimus";

type Settings = {
  otp_login_enabled: boolean;
  otp_channel_id: string | null;
  otp_template_name: string | null;
  otp_template_language: string | null;
};

/**
 * Configuração + kill-switch global do OTP de login.
 * Renderizado apenas para a conta break-glass; a escrita é validada no servidor
 * pela edge function `otp-settings-write` (403 para qualquer outro e-mail).
 */
export function OtpSettingsPanel() {
  const { user } = useAuth();
  const isAdmin = isOtpAdminEmail(user?.email);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    otp_login_enabled: false,
    otp_channel_id: null,
    otp_template_name: null,
    otp_template_language: "pt_BR",
  });
  const [channels, setChannels] = useState<Array<{ id: string; name: string; phone: string | null }>>([]);
  const [templates, setTemplates] = useState<string[]>([]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;

    (async () => {
      const { data: settingsRow } = await supabase
        .from("otp_settings")
        .select("otp_login_enabled, otp_channel_id, otp_template_name, otp_template_language")
        .eq("id", true)
        .maybeSingle();

      const { data: org } = await supabase
        .from("organizations").select("id").eq("name", OTP_ORG_NAME).maybeSingle();

      let orgChannels: Array<{ id: string; name: string; phone: string | null }> = [];
      let orgTemplates: string[] = [];
      if (org?.id) {
        const [{ data: ch }, { data: tpl }] = await Promise.all([
          (supabase as any).from("channels_public").select("id, name, phone").eq("organization_id", org.id),
          supabase.from("message_templates").select("name, status").eq("organization_id", org.id),
        ]);
        orgChannels = (ch as any[]) || [];
        orgTemplates = Array.from(new Set(((tpl as any[]) || []).map((t) => t.name).filter(Boolean)));
      }

      if (cancelled) return;
      if (settingsRow) setSettings({ ...settingsRow, otp_template_language: settingsRow.otp_template_language || "pt_BR" });
      setChannels(orgChannels);
      setTemplates(orgTemplates);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [isAdmin]);

  const save = useCallback(async (patch: Partial<Settings>) => {
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("otp-settings-write", { body: patch });
    setSaving(false);

    const payloadError = (data as { error?: string } | null)?.error;
    if (error || payloadError) {
      toast.error(payloadError || "Não foi possível salvar a configuração do OTP.");
      return false;
    }
    const saved = (data as { settings?: Settings } | null)?.settings;
    if (saved) setSettings({ ...saved, otp_template_language: saved.otp_template_language || "pt_BR" });
    toast.success("Configuração do OTP atualizada.");
    return true;
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
        A conta {user?.email} nunca é barrada pelo OTP (break-glass).
      </p>

      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border bg-background p-3">
            <div>
              <Label className="text-foreground">
                OTP no login — {settings.otp_login_enabled ? "Ligada" : "Desligada"}
              </Label>
              <p className="text-xs text-muted-foreground">
                Ligado, todos os usuários (exceto o break-glass) precisam confirmar um código por dia.
              </p>
            </div>
            <Switch
              checked={settings.otp_login_enabled}
              disabled={saving}
              onCheckedChange={(checked) => void save({ otp_login_enabled: checked })}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Canal (BM) — {OTP_ORG_NAME}</Label>
              <Select
                value={settings.otp_channel_id || undefined}
                onValueChange={(value) => void save({ otp_channel_id: value })}
              >
                <SelectTrigger><SelectValue placeholder="Selecione o canal" /></SelectTrigger>
                <SelectContent>
                  {channels.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}{c.phone ? ` — ${c.phone}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Template de autenticação</Label>
              {templates.length > 0 ? (
                <Select
                  value={settings.otp_template_name || undefined}
                  onValueChange={(value) => void save({ otp_template_name: value })}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione o template" /></SelectTrigger>
                  <SelectContent>
                    {templates.map((name) => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder="nome_do_template"
                  defaultValue={settings.otp_template_name || ""}
                  onBlur={(e) => {
                    const value = e.target.value.trim();
                    if (value && value !== settings.otp_template_name) void save({ otp_template_name: value });
                  }}
                />
              )}
            </div>

            <div className="space-y-2">
              <Label>Idioma do template</Label>
              <Input
                placeholder="pt_BR"
                defaultValue={settings.otp_template_language || "pt_BR"}
                onBlur={(e) => {
                  const value = e.target.value.trim() || "pt_BR";
                  if (value !== settings.otp_template_language) void save({ otp_template_language: value });
                }}
              />
            </div>
          </div>

          {saving && (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Salvando…
            </p>
          )}
        </div>
      )}
    </div>
  );
}
