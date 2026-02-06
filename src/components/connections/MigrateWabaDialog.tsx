import { useState } from "react";
import { ArrowRightLeft, Eye, EyeOff, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Channel {
  id: string;
  name: string;
  phone: string;
  waba_id: string | null;
  app_name: string | null;
  access_token: string | null;
}

interface MigrateWabaDialogProps {
  channel: Channel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface MetaPhoneNumber {
  id: string;
  displayPhoneNumber: string;
  verifiedName: string;
}

// Generate a random verify token
const generateVerifyToken = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Normalize phone for comparison (remove non-digits, get last 8-9 digits)
const normalizePhoneForCompare = (phone: string): string => {
  const digits = phone.replace(/\D/g, "");
  // Get the last 9 digits for more accurate matching (covers Brazilian mobile)
  return digits.slice(-9);
};

export function MigrateWabaDialog({ channel, open, onOpenChange, onSuccess }: MigrateWabaDialogProps) {
  const [newWabaId, setNewWabaId] = useState("");
  const [newAccessToken, setNewAccessToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    success: boolean;
    matchingPhone?: MetaPhoneNumber;
    availablePhones?: MetaPhoneNumber[];
    error?: string;
  } | null>(null);

  const resetForm = () => {
    setNewWabaId("");
    setNewAccessToken("");
    setShowToken(false);
    setValidationResult(null);
    setIsValidating(false);
    setIsMigrating(false);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  // Step 1: Validate new WABA credentials and find matching phone
  const handleValidate = async () => {
    if (!channel || !newWabaId.trim() || !newAccessToken.trim()) {
      toast.error("Preencha o WABA ID e Access Token");
      return;
    }

    setIsValidating(true);
    setValidationResult(null);

    try {
      // Fetch phone numbers from the new WABA
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${newWabaId}/phone_numbers?access_token=${newAccessToken}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData?.error?.message || "Erro ao validar credenciais";
        setValidationResult({
          success: false,
          error: errorMessage,
        });
        setIsValidating(false);
        return;
      }

      const data = await response.json();
      const phones: MetaPhoneNumber[] = (data.data || []).map((p: any) => ({
        id: p.id,
        displayPhoneNumber: p.display_phone_number,
        verifiedName: p.verified_name,
      }));

      if (phones.length === 0) {
        setValidationResult({
          success: false,
          error: "Nenhum número encontrado neste WABA",
        });
        setIsValidating(false);
        return;
      }

      // Find matching phone by comparing normalized numbers
      const channelPhoneNormalized = normalizePhoneForCompare(channel.phone);
      const matchingPhone = phones.find((p) => {
        const metaPhoneNormalized = normalizePhoneForCompare(p.displayPhoneNumber);
        return metaPhoneNormalized === channelPhoneNormalized;
      });

      if (!matchingPhone) {
        setValidationResult({
          success: false,
          availablePhones: phones,
          error: `Número ${channel.phone} não encontrado no novo WABA. Números disponíveis: ${phones.map(p => p.displayPhoneNumber).join(", ")}`,
        });
        setIsValidating(false);
        return;
      }

      // Success! Found the matching phone
      setValidationResult({
        success: true,
        matchingPhone,
      });
    } catch (error: any) {
      console.error("Error validating WABA:", error);
      setValidationResult({
        success: false,
        error: error.message || "Erro ao conectar com a Meta API",
      });
    } finally {
      setIsValidating(false);
    }
  };

  // Step 2: Execute the migration
  const handleMigrate = async () => {
    if (!channel || !validationResult?.success || !validationResult.matchingPhone) {
      return;
    }

    setIsMigrating(true);

    try {
      const matchingPhone = validationResult.matchingPhone;
      const newVerifyToken = generateVerifyToken();

      // Step 1: Update channel with new credentials (keeping same channel_id!)
      const { error: updateError } = await supabase
        .from("channels")
        .update({
          waba_id: newWabaId.trim(),
          access_token: newAccessToken.trim(),
          app_name: matchingPhone.id, // New Phone Number ID
          webhook_verify_token: newVerifyToken,
          connected: false, // Will be activated after registration
          updated_at: new Date().toISOString(),
        })
        .eq("id", channel.id);

      if (updateError) {
        throw new Error(`Erro ao atualizar canal: ${updateError.message}`);
      }

      // Step 2: Register phone with Meta Cloud API
      const { error: registerError } = await supabase.functions.invoke("meta-register-phone", {
        body: {
          phoneNumberId: matchingPhone.id,
          accessToken: newAccessToken.trim(),
        },
      });

      if (registerError) {
        console.error("Registration error:", registerError);
        // Don't fail completely - the channel is already updated
        toast.warning("Canal atualizado, mas registro no Meta pode precisar ser feito manualmente");
      }

      // Step 3: Subscribe to webhook
      const { error: webhookError } = await supabase.functions.invoke("meta-subscribe-webhook", {
        body: {
          wabaId: newWabaId.trim(),
          phoneNumberId: matchingPhone.id,
          accessToken: newAccessToken.trim(),
        },
      });

      if (webhookError) {
        console.error("Webhook subscription error:", webhookError);
        toast.warning("Canal atualizado, mas webhook pode precisar ser reconfigurado");
      }

      // Step 4: Mark as connected
      await supabase
        .from("channels")
        .update({ connected: true })
        .eq("id", channel.id);

      toast.success("WABA migrado com sucesso! Histórico de conversas preservado.");
      handleClose();
      onSuccess();
    } catch (error: any) {
      console.error("Migration error:", error);
      toast.error(error.message || "Erro ao migrar WABA");
    } finally {
      setIsMigrating(false);
    }
  };

  if (!channel) return null;

  return (
    <Dialog open={open} onOpenChange={(open) => !isMigrating && !isValidating && (open ? onOpenChange(open) : handleClose())}>
      <DialogContent className="sm:max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <ArrowRightLeft className="w-5 h-5 text-primary" />
            Migrar WABA
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Troque o WABA mantendo todo o histórico de conversas
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Current channel info */}
          <div className="p-3 bg-muted/30 rounded-lg border border-border">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Canal:</span>
                <p className="font-medium text-foreground">{channel.name}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Número:</span>
                <p className="font-medium text-foreground">{channel.phone}</p>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">WABA Atual:</span>
                <p className="font-mono text-xs text-foreground">{channel.waba_id || "-"}</p>
              </div>
            </div>
          </div>

          {/* Alert about how it works */}
          <Alert className="bg-primary/5 border-primary/20">
            <AlertTriangle className="h-4 w-4 text-primary" />
            <AlertDescription className="text-sm">
              O número <strong>{channel.phone}</strong> deve existir no novo WABA para a migração funcionar.
            </AlertDescription>
          </Alert>

          {/* New WABA ID */}
          <div className="space-y-2">
            <Label className="text-foreground">Novo WABA ID *</Label>
            <Input
              placeholder="Ex: 123456789012345"
              className="bg-muted/30 border-border font-mono"
              value={newWabaId}
              onChange={(e) => {
                setNewWabaId(e.target.value);
                setValidationResult(null);
              }}
              disabled={isValidating || isMigrating}
            />
          </div>

          {/* New Access Token */}
          <div className="space-y-2">
            <Label className="text-foreground">Novo Access Token *</Label>
            <div className="relative">
              <Input
                type={showToken ? "text" : "password"}
                placeholder="EAAG..."
                className="bg-muted/30 border-border pr-10"
                value={newAccessToken}
                onChange={(e) => {
                  setNewAccessToken(e.target.value);
                  setValidationResult(null);
                }}
                disabled={isValidating || isMigrating}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowToken(!showToken)}
                disabled={isValidating || isMigrating}
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* Validation result */}
          {validationResult && (
            <div className={`p-3 rounded-lg border ${validationResult.success ? "bg-emerald-500/10 border-emerald-500/30" : "bg-destructive/10 border-destructive/30"}`}>
              {validationResult.success ? (
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-emerald-500">Número encontrado!</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Phone ID: <span className="font-mono">{validationResult.matchingPhone?.id}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Nome: {validationResult.matchingPhone?.verifiedName}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-destructive mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-destructive">Validação falhou</p>
                    <p className="text-xs text-destructive/80 mt-1">{validationResult.error}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={isValidating || isMigrating}>
            Cancelar
          </Button>
          
          {!validationResult?.success ? (
            <Button 
              onClick={handleValidate} 
              disabled={isValidating || !newWabaId.trim() || !newAccessToken.trim()}
              className="gap-2"
            >
              {isValidating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Validando...
                </>
              ) : (
                "Validar Credenciais"
              )}
            </Button>
          ) : (
            <Button 
              onClick={handleMigrate} 
              disabled={isMigrating}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
            >
              {isMigrating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Migrando...
                </>
              ) : (
                <>
                  <ArrowRightLeft className="w-4 h-4" />
                  Confirmar Migração
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
