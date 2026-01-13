import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, Download, ExternalLink, ZoomIn, ZoomOut, RotateCw } from "lucide-react";
import { useState } from "react";

interface MediaPreviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  mediaUrl: string;
  mediaType: "image" | "video" | "document" | "file" | "sticker";
  fileName?: string;
}

export function MediaPreviewDialog({
  isOpen,
  onClose,
  mediaUrl,
  mediaType,
  fileName,
}: MediaPreviewDialogProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = mediaUrl;
    link.download = fileName || 'download';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenExternal = () => {
    window.open(mediaUrl, '_blank');
  };

  const resetView = () => {
    setZoom(1);
    setRotation(0);
  };

  const isPdf = mediaUrl?.toLowerCase().includes('.pdf') || 
                fileName?.toLowerCase().endsWith('.pdf') ||
                mediaUrl?.includes('application/pdf');

  const isImage = mediaType === "image" || mediaType === "sticker";
  const isVideo = mediaType === "video";
  const isDocument = mediaType === "document" || mediaType === "file";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] w-auto h-auto p-0 bg-black/95 border-none overflow-hidden">
        {/* Header with controls */}
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-3 bg-gradient-to-b from-black/80 to-transparent">
          <div className="flex items-center gap-2">
            {isImage && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleZoomOut}
                  className="text-white hover:bg-white/20 h-8 w-8"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-white text-sm min-w-[50px] text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleZoomIn}
                  className="text-white hover:bg-white/20 h-8 w-8"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleRotate}
                  className="text-white hover:bg-white/20 h-8 w-8"
                >
                  <RotateCw className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDownload}
              className="text-white hover:bg-white/20 h-8 w-8"
              title="Download"
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleOpenExternal}
              className="text-white hover:bg-white/20 h-8 w-8"
              title="Abrir em nova aba"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-white hover:bg-white/20 h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div 
          className="flex items-center justify-center min-h-[50vh] max-h-[95vh] overflow-auto p-8"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              onClose();
            }
          }}
        >
          {isImage && (
            <img
              src={mediaUrl}
              alt="Preview"
              className="max-w-full max-h-[85vh] object-contain transition-transform duration-200 cursor-zoom-in"
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
              }}
              onDoubleClick={resetView}
            />
          )}

          {isVideo && (
            <video
              src={mediaUrl}
              controls
              autoPlay
              className="max-w-full max-h-[85vh]"
            />
          )}

          {isDocument && isPdf && (
            <iframe
              src={`${mediaUrl}#toolbar=1&navpanes=0`}
              className="w-[90vw] h-[85vh] bg-white rounded"
              title="PDF Preview"
            />
          )}

          {isDocument && !isPdf && (
            <div className="flex flex-col items-center gap-4 text-white">
              <div className="w-20 h-20 bg-white/10 rounded-lg flex items-center justify-center">
                <Download className="h-10 w-10" />
              </div>
              <p className="text-lg font-medium">{fileName || "Documento"}</p>
              <p className="text-sm text-white/60">
                Este tipo de arquivo não pode ser visualizado diretamente
              </p>
              <div className="flex gap-2">
                <Button onClick={handleDownload} variant="secondary">
                  <Download className="h-4 w-4 mr-2" />
                  Baixar
                </Button>
                <Button onClick={handleOpenExternal} variant="outline" className="text-white border-white/30 hover:bg-white/10">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Abrir
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
