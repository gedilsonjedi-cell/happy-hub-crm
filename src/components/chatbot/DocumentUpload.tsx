import { useState, useRef } from "react";
import { Upload, FileText, X, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface KnowledgeDocument {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  created_at: string;
}

interface DocumentUploadProps {
  userId: string;
  agentId?: string;
  documents: KnowledgeDocument[];
  onDocumentsChange: () => void;
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const DocumentUpload = ({ userId, agentId, documents, onDocumentsChange }: DocumentUploadProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sanitize filename to remove special characters that cause storage errors
  const sanitizeFileName = (fileName: string): string => {
    // Normalize and remove diacritics/accents
    const normalized = fileName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    // Replace special chars with underscore, keep alphanumeric, dots, hyphens
    return normalized.replace(/[^a-zA-Z0-9.\-_]/g, '_').replace(/_+/g, '_');
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name} excede o limite de 10MB`);
          continue;
        }

        // Sanitize filename for storage path
        const sanitizedName = sanitizeFileName(file.name);
        const filePath = `${userId}/${Date.now()}_${sanitizedName}`;
        
        const { error: uploadError } = await supabase.storage
          .from('knowledge-docs')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { error: dbError } = await supabase
          .from('knowledge_documents')
          .insert({
            user_id: userId,
            agent_id: agentId || null,
            file_name: file.name,
            file_path: filePath,
            file_size: file.size,
            file_type: file.type,
          });

        if (dbError) throw dbError;
      }

      toast.success("Documento(s) enviado(s) com sucesso!");
      onDocumentsChange();
    } catch (error: any) {
      console.error("Erro ao enviar:", error);
      toast.error("Erro ao enviar documento");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (doc: KnowledgeDocument) => {
    try {
      await supabase.storage
        .from('knowledge-docs')
        .remove([doc.file_path]);

      await supabase
        .from('knowledge_documents')
        .delete()
        .eq('id', doc.id);

      toast.success("Documento removido");
      onDocumentsChange();
    } catch (error) {
      console.error("Erro ao remover:", error);
      toast.error("Erro ao remover documento");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const filteredDocuments = documents.filter(doc =>
    doc.file_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-primary" />
          <div>
            <CardTitle className="text-base">Documentos de Conhecimento</CardTitle>
            <CardDescription className="text-xs">PDFs, documentos e arquivos com informações do negócio</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload Area */}
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer",
            dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
            isUploading && "pointer-events-none opacity-50"
          )}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept=".pdf,.doc,.docx,.txt,.md"
            onChange={(e) => handleFileSelect(e.target.files)}
          />
          {isUploading ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Enviando...</span>
            </div>
          ) : (
            <>
              <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Arraste arquivos ou clique para selecionar
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                PDF, DOC, DOCX, TXT, MD (máx. 10MB)
              </p>
            </>
          )}
        </div>

        {/* Document List with Search */}
        {documents.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {filteredDocuments.length} de {documents.length} documento(s)
              </p>
            </div>
            
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar documentos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>

            {/* Filtered Documents */}
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {filteredDocuments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum documento encontrado
                </p>
              ) : (
                filteredDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm truncate">{doc.file_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(doc.file_size)}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => handleDelete(doc)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
