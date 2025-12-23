import { useState, useRef } from "react";
import { 
  Image, 
  FileText, 
  Music, 
  Video, 
  Upload, 
  X, 
  Loader2,
  File
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface MediaUploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (data: {
    mediaType: string;
    mediaUrl: string;
    mediaCaption?: string;
    fileName?: string;
  }) => void;
}

const mediaTypes = [
  { id: "image", label: "Imagem", icon: Image, accept: "image/*" },
  { id: "video", label: "Vídeo", icon: Video, accept: "video/*" },
  { id: "audio", label: "Áudio", icon: Music, accept: "audio/*" },
  { id: "document", label: "Documento", icon: FileText, accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" },
];

export const MediaUploadDialog = ({ isOpen, onClose, onSend }: MediaUploadDialogProps) => {
  const [selectedType, setSelectedType] = useState("image");
  const [mediaUrl, setMediaUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUrlSubmit = () => {
    if (!mediaUrl.trim()) {
      toast.error("Insira uma URL válida");
      return;
    }

    onSend({
      mediaType: selectedType,
      mediaUrl: mediaUrl.trim(),
      mediaCaption: caption.trim() || undefined,
      fileName: fileName.trim() || undefined
    });

    resetForm();
    onClose();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // For now, we'll use a URL approach since we'd need storage setup
    // In a real implementation, you would upload to Supabase storage or another service
    toast.info("Para enviar arquivos locais, faça upload em um serviço de armazenamento e use a URL");
    
    // Create preview for images
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewUrl(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
    
    setFileName(file.name);
  };

  const resetForm = () => {
    setMediaUrl("");
    setCaption("");
    setFileName("");
    setPreviewUrl(null);
    setSelectedType("image");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar Mídia</DialogTitle>
        </DialogHeader>

        <Tabs value={selectedType} onValueChange={setSelectedType}>
          <TabsList className="grid grid-cols-4 w-full">
            {mediaTypes.map(type => (
              <TabsTrigger key={type.id} value={type.id} className="gap-1.5">
                <type.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{type.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {mediaTypes.map(type => (
            <TabsContent key={type.id} value={type.id} className="space-y-4">
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">URL da Mídia</label>
                  <Input
                    placeholder={`Cole a URL ${type.label.toLowerCase()} aqui...`}
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    A mídia precisa estar hospedada em uma URL pública acessível
                  </p>
                </div>

                {type.id === "image" && previewUrl && (
                  <div className="relative w-full h-40 rounded-lg overflow-hidden bg-muted">
                    <img 
                      src={previewUrl} 
                      alt="Preview" 
                      className="w-full h-full object-cover" 
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 h-6 w-6"
                      onClick={() => setPreviewUrl(null)}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                )}

                {(type.id === "image" || type.id === "video") && (
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Legenda (opcional)</label>
                    <Textarea
                      placeholder="Adicione uma legenda..."
                      className="min-h-[80px]"
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                    />
                  </div>
                )}

                {type.id === "document" && (
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Nome do Arquivo</label>
                    <Input
                      placeholder="documento.pdf"
                      value={fileName}
                      onChange={(e) => setFileName(e.target.value)}
                    />
                  </div>
                )}

                <div className="border-t border-border pt-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={type.accept}
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-4 h-4" />
                    Ou selecione um arquivo
                  </Button>
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button onClick={handleUrlSubmit} disabled={!mediaUrl.trim() || uploading}>
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Enviando...
              </>
            ) : (
              "Enviar"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
