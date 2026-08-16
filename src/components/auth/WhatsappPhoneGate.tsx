import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { validateWhatsappPhone, formatWhatsappPhone } from "@/lib/validateWhatsappPhone";

/**
 * Gate bloqueante: qualquer usuário autenticado sem `profiles.whatsapp_phone`
 * precisa cadastrar o número antes de usar o sistema.
 * Não exige OTP — apenas o vínculo do número (fase 1).
 */
export function WhatsappPhoneGate({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const [checked, setChecked] = useState(false);
  const [needsPhone, setNeedsPhone] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) return;

    (async () => {
      const { data, error: fetchError } = await supabase
        .from("profiles")
        .select("whatsapp_phone")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;
      if (fetchError) {
        console.error("[WhatsappPhoneGate] erro ao verificar perfil:", fetchError.message);
        setChecked(true);
        return;
      }
      setNeedsPhone(!data?.whatsapp_phone);
      setChecked(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleSave = useCallback(async () => {
    if (!user?.id) return;
    const result = validateWhatsappPhone(value);
    if (!result.isValid) {
      setError(result.error);
      return;
    }
    setError(null);
    setSaving(true);
    const { data: savedProfile, error: updateError } = await supabase
      .from("profiles")
      .update({ whatsapp_phone: result.e164 })
      .eq("user_id", user.id)
      .select("whatsapp_phone")
      .maybeSingle();
    setSaving(false);

    if (updateError || savedProfile?.whatsapp_phone !== result.e164) {
      toast.error("Não foi possível salvar o número. Tente novamente.");
      console.error(
        "[WhatsappPhoneGate] número não confirmado após salvar:",
        updateError?.message || "nenhuma linha atualizada",
      );
      return;
    }
    toast.success("WhatsApp cadastrado com sucesso!");
    setNeedsPhone(false);
    // Avisa o OtpGate para reavaliar e disparar o código automaticamente.
    window.dispatchEvent(new CustomEvent("whatsapp-phone-saved", {
      detail: { whatsappPhone: savedProfile.whatsapp_phone },
    }));
  }, [value, user]);

  if (!user || !checked || !needsPhone) return <>{children}</>;

  return (
    <>
      {children}
      <Dialog open>
        <DialogContent
          className="max-w-md [&>button]:hidden"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-primary" />
              Atualização cadastral obrigatória
            </DialogTitle>
            <DialogDescription>
              Para continuar usando o sistema, cadastre o seu número de WhatsApp. Ele será usado para
              validar o seu acesso.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="gate-whatsapp">Seu WhatsApp</Label>
            <Input
              id="gate-whatsapp"
              inputMode="tel"
              autoFocus
              placeholder="+55 (14) 98156-4414"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError(null);
              }}
              onBlur={() => {
                const v = validateWhatsappPhone(value);
                if (v.isValid) setValue(v.formatted);
                else if (value.trim()) setValue(formatWhatsappPhone(value));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !saving) handleSave();
              }}
              disabled={saving}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <p className="text-xs text-muted-foreground">
              Informe o celular com DDD. Ex.: 14 98156-4414
            </p>
          </div>

          <div className="flex justify-between gap-2 pt-2">
            <Button variant="ghost" onClick={signOut} disabled={saving}>
              Sair
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar e continuar"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
