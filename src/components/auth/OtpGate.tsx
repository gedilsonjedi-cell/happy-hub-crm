import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { brasiliaToday } from "@/lib/brasiliaDate";
import { OTP_ADMIN_EMAIL, isOtpAdminEmail } from "@/lib/otpAdmin";

const RESEND_COOLDOWN = 60;

/**
 * Gate de OTP no login (fase 2).
 * - kill-switch desligado => libera
 * - conta break-glass (allan.pedro147@gmail.com) => libera SEMPRE
 * - caso contrário exige código do dia (Brasília) enviado por WhatsApp
 */
export function OtpGate({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const [checked, setChecked] = useState(false);
  const [needsOtp, setNeedsOtp] = useState(false);
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [sendError, setSendError] = useState<string | null>(null);
  const requestedRef = useRef(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Quando o WhatsappPhoneGate grava o número, o OtpGate recomeça do zero.
  useEffect(() => {
    const onPhoneSaved = () => {
      requestedRef.current = false;
      setChecked(false);
      setNeedsOtp(false);
      setReloadKey((k) => k + 1);
    };
    window.addEventListener("whatsapp-phone-saved", onPhoneSaved);
    return () => window.removeEventListener("whatsapp-phone-saved", onPhoneSaved);
  }, []);

  const requestCode = useCallback(async (): Promise<boolean> => {
    setSending(true);
    setSendError(null);
    const { data, error } = await supabase.functions.invoke("otp-request", { body: {} });
    setSending(false);

    // Em respostas não-2xx o supabase-js devolve `data: null`; o motivo real vem no corpo da resposta.
    let payloadError = (data as { error?: string } | null)?.error;
    const context = (error as { context?: Response } | null)?.context;
    if (!payloadError && context && typeof context.json === "function") {
      const body = await context.clone().json().catch(() => null);
      payloadError = (body as { error?: string } | null)?.error;
    }

    if (error || payloadError) {
      const message = payloadError || "Não foi possível enviar o código pelo WhatsApp.";
      setSendError(message);
      return false;
    }
    setCooldown(RESEND_COOLDOWN);
    toast.success("Código enviado para o seu WhatsApp.");
    return true;
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) return;

    (async () => {
      if (isOtpAdminEmail(user.email)) {
        if (!cancelled) { setNeedsOtp(false); setChecked(true); }
        return;
      }

      const [{ data: settings }, { data: profile }] = await Promise.all([
        supabase.from("otp_settings").select("otp_login_enabled").eq("id", true).maybeSingle(),
        supabase.from("profiles").select("otp_last_verified_date, whatsapp_phone").eq("user_id", user.id).maybeSingle(),
      ]);
      if (cancelled) return;

      // Sem número cadastrado o WhatsappPhoneGate ainda está bloqueando: não avaliar nem disparar.
      if (!profile?.whatsapp_phone) {
        setNeedsOtp(false);
        setChecked(false);
        return;
      }

      if (!settings?.otp_login_enabled) {
        setNeedsOtp(false);
        setChecked(true);
        return;
      }

      const verifiedToday = profile?.otp_last_verified_date === brasiliaToday();
      setNeedsOtp(!verifiedToday);
      setChecked(true);
    })();

    return () => { cancelled = true; };
  }, [user?.id, user?.email, reloadKey]);

  // Dispara o código automaticamente quando o gate abre
  useEffect(() => {
    if (!needsOtp || !checked || requestedRef.current) return;
    requestedRef.current = true;
    void requestCode().then((ok) => {
      // Falha transitória: permite novo auto-disparo numa próxima avaliação
      if (!ok) requestedRef.current = false;
    });
  }, [needsOtp, checked, requestCode]);


  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleVerify = useCallback(async () => {
    const clean = code.replace(/\D/g, "");
    if (clean.length !== 6) {
      toast.error("Digite os 6 dígitos do código.");
      return;
    }
    setVerifying(true);
    const { data, error } = await supabase.functions.invoke("otp-verify", { body: { code: clean } });
    setVerifying(false);

    const payloadError = (data as { error?: string } | null)?.error;
    if (error || payloadError) {
      toast.error(payloadError || "Código inválido.");
      return;
    }
    toast.success("Autenticação confirmada.");
    setNeedsOtp(false);
  }, [code]);

  if (!user || !checked || !needsOtp) return <>{children}</>;

  return (
    <>
      {children}
      <Dialog open>
        <DialogContent
          className="sm:max-w-md [&>button]:hidden"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Confirme seu acesso
            </DialogTitle>
            <DialogDescription>
              Enviamos um código de 6 dígitos para o seu WhatsApp cadastrado. A confirmação é válida para o dia de hoje.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {sendError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {sendError}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="otp-code">Código</Label>
              <Input
                id="otp-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                className="text-center text-2xl tracking-[0.5em]"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                disabled={verifying}
              />
            </div>

            <Button className="w-full" onClick={handleVerify} disabled={verifying || code.length !== 6}>
              {verifying ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Verificar
            </Button>

            <div className="flex items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void requestCode()}
                disabled={sending || cooldown > 0}
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {cooldown > 0 ? `Reenviar em ${cooldown}s` : "Reenviar código"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void signOut()}>Sair</Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Problemas para receber? Fale com o administrador ({OTP_ADMIN_EMAIL}).
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
