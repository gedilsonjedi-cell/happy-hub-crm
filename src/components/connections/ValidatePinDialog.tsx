import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Loader2, ShieldCheck, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface ValidatePinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: {
    id: string;
    name?: string | null;
    app_name?: string | null; // phone_number_id
    access_token?: string | null;
  } | null;
  onValidated?: () => void;
}

export function ValidatePinDialog({ open, onOpenChange, channel, onValidated }: ValidatePinDialogProps) {
  const [pin, setPin] = useState("");
  const [defineNewPin, setDefineNewPin] = useState(false);
  const [isWorking, setIsWorking] = useState(false);

  const reset = () => {
    setPin("");
    setDefineNewPin(false);
    setIsWorking(false);
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleValidate = async () => {
    if (!channel?.app_name || !channel?.access_token) {
      toast.error("Canal sem Phone Number ID ou Access Token.");
      return;
    }
    if (!/^\d{6}$/.test(pin)) {
      toast.error("O PIN precisa ter exatamente 6 dígitos numéricos.");
      return;
    }

    setIsWorking(true);
    try {
      // 1) Opcionalmente define/atualiza o PIN 2FA no Meta
      if (defineNewPin) {
        toast.info("Definindo novo PIN no Meta...");
        const { data: setData, error: setErr } = await supabase.functions.invoke("meta-set-pin", {
          body: {
            phoneNumberId: channel.app_name,
            accessToken: channel.access_token,
            pin,
          },
        });
        if (setErr) {
          toast.error("Erro ao definir PIN: " + (setErr.message || "desconhecido"));
          return;
        }
        if (setData?.error || setData?.success === false) {
          toast.error(setData?.error || "Falha ao definir PIN no Meta.");
          if (setData?.suggestion) toast.info(setData.suggestion, { duration: 10000 });
          return;
        }
        toast.success("PIN definido no Meta com sucesso.");
      }

      // 2) Registra (ou re-registra) o número usando o PIN informado
      toast.info("Validando PIN e registrando número...");
      const { data, error } = await supabase.functions.invoke("meta-register-phone", {
        body: {
          phoneNumberId: channel.app_name,
          accessToken: channel.access_token,
          pin,
          forceReregister: true,
        },
      });

      if (error) {
        toast.error("Erro: " + (error.message || "desconhecido"));
        return;
      }

      if (data?.success || data?.registered || data?.status?.status === "CONNECTED") {
        toast.success(data?.message || "Número conectado com sucesso!");
        await supabase.from("channels").update({ connected: true }).eq("id", channel.id);
        onValidated?.();
        handleClose(false);
        return;
      }

      if (data?.requiresPin) {
        toast.error(data.error || "PIN inválido.");
        if (data.suggestion) toast.info(data.suggestion, { duration: 12000 });
        return;
      }

      if (data?.blocked || data?.code === 131031) {
        toast.error(data?.error || "Conta bloqueada pela Meta.", { duration: 10000 });
        if (data?.suggestion) toast.info(data.suggestion, { duration: 15000 });
        return;
      }

      if (data?.pending) {
        toast.warning(data?.message || "Número segue pendente após validação.");
        if (data?.suggestion) toast.info(data.suggestion, { duration: 12000 });
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        if (data.suggestion) toast.info(data.suggestion, { duration: 10000 });
        return;
      }

      toast.warning(data?.message || "Resposta inesperada do Meta.");
    } catch (err) {
      console.error("[ValidatePinDialog] error:", err);
      toast.error("Erro inesperado ao validar PIN.");
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Validar PIN do número
          </DialogTitle>
          <DialogDescription>
            {channel?.name ? <span className="font-medium">{channel.name}</span> : "Canal Meta"} —
            informe o PIN de 6 dígitos da verificação de dois fatores (2FA) para conectar este
            número no WhatsApp Cloud API.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-sm flex items-center gap-2">
              <KeyRound className="w-4 h-4" /> PIN de 6 dígitos
            </Label>
            <div className="flex justify-center">
              <InputOTP maxLength={6} value={pin} onChange={setPin} disabled={isWorking}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-md border p-3 bg-muted/30">
            <Checkbox
              id="define-new-pin"
              checked={defineNewPin}
              onCheckedChange={(v) => setDefineNewPin(Boolean(v))}
              disabled={isWorking}
            />
            <div className="space-y-1">
              <Label htmlFor="define-new-pin" className="text-sm cursor-pointer">
                Definir este código como novo PIN 2FA no Meta
              </Label>
              <p className="text-xs text-muted-foreground">
                Marque se o número não tem PIN ou se você esqueceu o anterior. O sistema vai
                atualizar o PIN no Meta antes de registrar.
              </p>
            </div>
          </div>

          <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
            Após validar, o número será re-registrado automaticamente. Caso continue pendente,
            verifique no Meta Business Suite se há restrições ou aprovações pendentes.
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleClose(false)} disabled={isWorking}>
            Cancelar
          </Button>
          <Button onClick={handleValidate} disabled={isWorking || pin.length !== 6}>
            {isWorking ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Validando...
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4 mr-2" />
                Validar PIN
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
