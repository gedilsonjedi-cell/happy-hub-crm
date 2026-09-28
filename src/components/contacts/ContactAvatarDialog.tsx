import { useEffect, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  AVATAR_ACCEPTED_TYPES,
  removeLeadAvatar,
  resizeToWebp,
  setLocalAvatar,
  uploadLeadAvatar,
  validateAvatarFile,
} from "@/lib/contactAvatars";
import { ContactAvatar } from "./ContactAvatar";

interface ContactAvatarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  organizationId: string;
  phone: string | null;
  name: string | null;
  currentPath: string | null;
  onChanged?: (path: string | null) => void;
}

export function ContactAvatarDialog({
  open,
  onOpenChange,
  leadId,
  organizationId,
  phone,
  name,
  currentPath,
  onChanged,
}: ContactAvatarDialogProps) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"idle" | "processing" | "saving" | "removing">("idle");
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!open) {
      setBlob(null);
      setError(null);
      setBusy("idle");
      setPreview((p) => { if (p) URL.revokeObjectURL(p); return null; });
    }
  }, [open]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const msg = validateAvatarFile(file);
    if (msg) { setError(msg); setBlob(null); return; }
    setError(null);
    setBusy("processing");
    try {
      const out = await resizeToWebp(file);
      setBlob(out);
      setPreview((p) => { if (p) URL.revokeObjectURL(p); return URL.createObjectURL(out); });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível ler a imagem.");
    } finally {
      setBusy("idle");
    }
  };

  const handleSave = async () => {
    if (!blob) return;
    setBusy("saving");
    try {
      const { path, signedUrl } = await uploadLeadAvatar({
        organizationId, leadId, blob, previousPath: currentPath, userId: user?.id ?? null,
      });
      setLocalAvatar(organizationId, phone, path, signedUrl);
      onChanged?.(path);
      toast.success("Foto do contato atualizada");
      onOpenChange(false);
    } catch (e) {
      console.error("[ContactAvatarDialog] upload", e);
      toast.error("Não foi possível salvar a foto. Tente novamente.");
      setBusy("idle");
    }
  };

  const handleRemove = async () => {
    setBusy("removing");
    try {
      await removeLeadAvatar({ leadId, previousPath: currentPath, userId: user?.id ?? null });
      setLocalAvatar(organizationId, phone, null);
      onChanged?.(null);
      toast.success("Foto removida");
      onOpenChange(false);
    } catch (e) {
      console.error("[ContactAvatarDialog] remove", e);
      toast.error("Não foi possível remover a foto.");
      setBusy("idle");
    }
  };

  const working = busy !== "idle";

  return (
    <Dialog open={open} onOpenChange={(v) => !working && onOpenChange(v)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Foto do contato</DialogTitle>
          <DialogDescription>JPG, PNG ou WebP de até 5 MB. A imagem é recortada em quadrado.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          <div className="h-32 w-32 overflow-hidden rounded-full border border-border bg-muted">
            {preview ? (
              <img src={preview} alt="Prévia da foto" className="h-full w-full object-cover" />
            ) : (
              <ContactAvatar
                name={name}
                avatarPath={currentPath}
                className="h-full w-full"
                fallbackClassName="bg-primary/10 text-primary text-2xl"
                iconClassName="w-10 h-10"
              />
            )}
          </div>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); void handleFile(e.dataTransfer.files?.[0]); }}
            disabled={working}
            className={cn(
              "flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground transition-colors hover:bg-muted/50",
              dragOver && "border-primary bg-primary/5"
            )}
          >
            {busy === "processing" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
            <span>Escolher arquivo ou arrastar aqui</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={AVATAR_ACCEPTED_TYPES.join(",")}
            className="hidden"
            data-testid="avatar-file-input"
            onChange={(e) => { void handleFile(e.target.files?.[0]); e.target.value = ""; }}
          />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {currentPath ? (
            <Button variant="ghost" className="text-destructive" onClick={handleRemove} disabled={working}>
              {busy === "removing" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Remover foto
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={working}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!blob || working}>
              {busy === "saving" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
