import { memo, useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Check,
  CheckCheck,
  Clock,
  AlertTriangle,
  FileText,
  ZoomIn,
  Play,
  Phone,
  Info,
  ExternalLink,
  Facebook,
  RotateCcw,
} from "lucide-react";
import { formatErrorDisplay } from "@/lib/metaErrorMessages";
import type { MessageRow } from "@/hooks/useInfiniteMessages";

interface MessageBubbleProps {
  message: MessageRow;
  showDateSeparator: boolean;
  onMediaPreview: (url: string, type: string, fileName?: string) => void;
  onRetry?: (message: MessageRow) => void;
  isRetrying?: boolean;
  templates: Map<string, {
    content: string;
    variables: string[] | null;
    components: { buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }> } | null;
  }>;
}

/**
 * MessageBubble — memoized so React skips re-render when only new messages arrive.
 * Images and videos use loading="lazy" to avoid blocking the main thread.
 */
const MessageBubble = memo(function MessageBubble({
  message,
  showDateSeparator,
  onMediaPreview,
  onRetry,
  isRetrying,
  templates,
}: MessageBubbleProps) {
  const isOutbound = message.direction === "outbound";
  const isFailed = message.status === "failed";
  const isSending = message.status === "sending";

  const renderContent = () => {
    const isMedia = ["image", "video", "audio", "document", "file", "sticker"].includes(
      message.message_type
    );

    if (isMedia && message.media_url) {
      switch (message.message_type) {
        case "image":
        case "sticker":
          return (
            <div className="space-y-1">
              <ProgressiveImage
                src={message.media_url!}
                alt="Media"
                onClick={() => onMediaPreview(message.media_url!, message.message_type)}
              />
              {message.content && message.content !== `[${message.message_type}]` && (
                <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
              )}
            </div>
          );

        case "video":
          return (
            <div className="space-y-1">
              <div
                className="cursor-pointer group relative"
                onClick={() => onMediaPreview(message.media_url!, "video")}
              >
                {/* preload="none" + poster placeholder avoids eager network fetch */}
                <video
                  src={message.media_url}
                  preload="none"
                  className="max-w-full rounded-lg max-h-60"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg group-hover:bg-black/40 transition-colors">
                  <Play className="w-12 h-12 text-white drop-shadow-lg" />
                </div>
              </div>
              {message.content && message.content !== "[video]" && (
                <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
              )}
            </div>
          );

        case "audio":
          return <AudioPlayer src={message.media_url!} />;

        case "document":
        case "file":
          return (
            <div
              className="flex items-center gap-2 text-sm p-2 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors"
              onClick={() => onMediaPreview(message.media_url!, message.message_type, message.content || "Documento")}
            >
              <FileText className="w-5 h-5 text-primary" />
              <span className="flex-1 truncate">{message.content || "Documento"}</span>
              <ZoomIn className="w-4 h-4 text-muted-foreground" />
            </div>
          );

        default:
          return <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>;
      }
    }

    // Template messages
    if (message.message_type === "template" || message.content?.startsWith("Template:")) {
      const metadata = message.metadata as {
        templateName?: string;
        templateParams?: string[];
        templateContent?: string;
        templateButtons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
      } | null;

      let templateName = metadata?.templateName || "";
      const templateParams = metadata?.templateParams || [];

      if (!templateName && message.content?.startsWith("Template:")) {
        templateName = message.content.replace("Template:", "").trim();
      }

      const templateData = templates.get(templateName);
      let displayContent = metadata?.templateContent || templateData?.content || "";
      const buttons = metadata?.templateButtons || templateData?.components?.buttons || [];

      // Header media: prefer media_url already persisted on the message; fall back
      // to the templateMediaUrl in metadata (when present).
      const headerMediaUrl = message.media_url
        || (message.metadata as Record<string, unknown> | null)?.templateMediaUrl as string | undefined
        || null;
      const headerMediaTypeRaw = (message.metadata as { mediaType?: string } | null)?.mediaType
        || (headerMediaUrl ? "image" : null);
      const headerMediaType = headerMediaTypeRaw ? String(headerMediaTypeRaw).toLowerCase() : null;

      const renderHeaderMedia = () => {
        if (!headerMediaUrl || !headerMediaType) return null;
        if (headerMediaType === "image") {
          return (
            <ProgressiveImage
              src={headerMediaUrl}
              alt="Cabeçalho do template"
              onClick={() => onMediaPreview(headerMediaUrl, "image")}
            />
          );
        }
        if (headerMediaType === "video") {
          return (
            <div
              className="cursor-pointer group relative"
              onClick={() => onMediaPreview(headerMediaUrl, "video")}
            >
              <video src={headerMediaUrl} preload="none" className="max-w-full rounded-lg max-h-60" />
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg group-hover:bg-black/40 transition-colors">
                <Play className="w-12 h-12 text-white drop-shadow-lg" />
              </div>
            </div>
          );
        }
        if (headerMediaType === "document" || headerMediaType === "file") {
          return (
            <div
              className="flex items-center gap-2 text-sm p-2 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors"
              onClick={() => onMediaPreview(headerMediaUrl, "document", "Documento")}
            >
              <FileText className="w-5 h-5 text-primary" />
              <span className="flex-1 truncate">Documento</span>
              <ZoomIn className="w-4 h-4 text-muted-foreground" />
            </div>
          );
        }
        return null;
      };

      if (displayContent) {
        // Use replaceAll to ensure ALL occurrences of each placeholder are replaced
        templateParams.forEach((param, index) => {
          const placeholder = `{{${index + 1}}}`;
          while (displayContent.includes(placeholder)) {
            displayContent = displayContent.replace(placeholder, param);
          }
        });

        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground/80 mb-1">
              <FileText className="w-3 h-3" />
              <span className="font-medium">{templateName}</span>
            </div>
            {renderHeaderMedia()}
            <p className="text-sm whitespace-pre-wrap break-words">{displayContent}</p>
            {buttons.length > 0 && (
              <div className="flex flex-col gap-1 pt-2 border-t border-border/30">
                {buttons.map((button, idx) => {
                  const btnType = String(button.type || '').toUpperCase();
                  return (
                    <div key={idx} className="flex items-center justify-center gap-2 py-1.5 px-3 rounded bg-background/20 text-xs font-medium text-center">
                      {btnType === "URL" && <><span className="text-primary">🔗</span><span>{button.text}</span></>}
                      {btnType === "PHONE_NUMBER" && <><Phone className="w-3 h-3 text-primary" /><span>{button.text}</span></>}
                      {btnType === "QUICK_REPLY" && <span>{button.text}</span>}
                      {!["URL", "PHONE_NUMBER", "QUICK_REPLY"].includes(btnType) && <span>{button.text}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      }

      return (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground/80">
            <FileText className="w-3 h-3" />
            <span className="font-medium">{templateName || "Template"}</span>
          </div>
          {renderHeaderMedia()}
          <p className="text-sm text-muted-foreground italic">Conteúdo do template indisponível</p>
        </div>
      );
    }

    // Referral / Ad tracking card
    const referralMeta = (message.metadata as Record<string, unknown>)?.referral as Record<string, unknown> | undefined;
    if (referralMeta) {
      const source = (referralMeta.source_type as string)?.toUpperCase() || 'FACEBOOK';
      const headline = referralMeta.headline as string | null;
      const body = referralMeta.body as string | null;
      const sourceUrl = referralMeta.source_url as string | null;
      const imageUrl = referralMeta.image_url as string | null;
      const videoUrl = referralMeta.video_url as string | null;
      const thumbnailUrl = referralMeta.thumbnail_url as string | null;
      const mediaType = referralMeta.media_type as string | null;

      const originLabel = source === 'AD' ? 'FACEBOOK' : source;
      const mediaPreviewUrl = imageUrl || thumbnailUrl || null;

      return (
        <div className="space-y-2">
          {/* Regular message content */}
          <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>

          {/* Tracking card */}
          <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800/50 p-3 text-foreground shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-2">
              <span>Rastreamento</span>
              <span className="ml-auto text-xs text-muted-foreground font-normal">
                {format(new Date(message.created_at), "dd/MM/yyyy HH:mm")}
              </span>
            </div>

            <div className="flex items-start gap-2 text-xs leading-relaxed">
              <Info className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
              <div className="space-y-1 min-w-0">
                <p><strong>Origem:</strong> {originLabel}</p>
                {headline && (
                  <p><strong>Headline:</strong> {headline}</p>
                )}
                {body && (
                  <p className="whitespace-pre-wrap">{body}</p>
                )}
                <p><strong>Meio:</strong> WHATSAPP BUSINESS APP</p>
                {sourceUrl && (
                  <p className="flex items-center gap-1">
                    <strong>Acesso:</strong>{" "}
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline break-all inline-flex items-center gap-1"
                    >
                      {sourceUrl}
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    </a>
                  </p>
                )}
              </div>
            </div>

            {mediaPreviewUrl && (
              <div className="mt-2 rounded-lg overflow-hidden">
                <img
                  src={mediaPreviewUrl}
                  alt="Criativo do anúncio"
                  loading="lazy"
                  className="max-w-full max-h-40 object-cover rounded-lg"
                />
              </div>
            )}
          </div>
        </div>
      );
    }

    return <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>;
  };

  const dateLabel = isToday(new Date(message.created_at))
    ? "Hoje"
    : isYesterday(new Date(message.created_at))
    ? "Ontem"
    : format(new Date(message.created_at), "dd/MM/yyyy", { locale: ptBR });

  return (
    <div>
      {showDateSeparator && (
        <div className="flex items-center justify-center my-4">
          <div className="px-3 py-1 rounded-full bg-muted text-muted-foreground text-xs">
            {dateLabel}
          </div>
        </div>
      )}

      <div className={cn("flex", isOutbound ? "justify-end" : "justify-start")}>
        <div className={cn(
          "max-w-[80%] transition-opacity duration-300",
          isFailed ? "space-y-2" : "",
          isSending ? "opacity-60" : "opacity-100"
        )}>
          <div
            className={cn(
              "rounded-2xl px-4 py-2 shadow-sm",
              isOutbound
                ? isFailed
                  ? "bg-destructive/80 text-destructive-foreground"
                  : "bg-primary text-primary-foreground"
                : "bg-muted text-foreground"
            )}
          >
            {isFailed && (
              <div className="flex items-center gap-1.5 mb-1 text-xs opacity-80">
                <AlertTriangle className="w-3 h-3" />
                <span>Falha ao enviar</span>
              </div>
            )}
            {renderContent()}
            <div
              className={cn(
                "flex items-center gap-1.5 mt-1 text-[10px]",
                isOutbound ? "justify-end text-primary-foreground/70" : "text-muted-foreground"
              )}
            >
              <span>{format(new Date(message.created_at), "HH:mm")}</span>
              {isOutbound && !isFailed && (
                message.status === "read" ? (
                  <CheckCheck className="w-3.5 h-3.5 text-blue-400" />
                ) : message.status === "delivered" ? (
                  <CheckCheck className="w-3.5 h-3.5" />
                ) : message.status === "sending" ? (
                  <Clock className="w-3.5 h-3.5" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )
              )}
            </div>
          </div>

          {/* Detailed error panel */}
          {isFailed && message.error_message && (() => {
            const errorDetails = formatErrorDisplay(message.error_message!);
            return (
              <div className="rounded-xl bg-card border border-warning/30 p-3 text-sm">
                <div className="flex items-start gap-2 text-warning mb-1.5">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div className="font-medium">
                    Atenção{errorDetails.code ? `: ${errorDetails.code}` : ""} - {errorDetails.title}
                  </div>
                </div>
                <p className="text-muted-foreground text-xs mb-2 pl-6">{errorDetails.description}</p>
                <p className="text-muted-foreground text-xs pl-6">{errorDetails.suggestion}</p>
                {errorDetails.link && (
                  <div className="mt-2 pt-2 border-t border-border pl-6">
                    <p className="text-xs text-muted-foreground">Para saber mais acesse esse link:</p>
                    <a
                      href={errorDetails.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline break-all"
                    >
                      {errorDetails.link}
                    </a>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
});

/**
 * ProgressiveImage — shows a sized placeholder while the image loads,
 * preventing layout shift. Fades in on load. Shows error state on failure.
 */
const ProgressiveImage = memo(function ProgressiveImage({
  src,
  alt,
  onClick,
}: {
  src: string;
  alt: string;
  onClick: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const handleLoad = useCallback(() => setLoaded(true), []);
  const handleError = useCallback(() => { setError(true); setLoaded(true); }, []);

  if (error) {
    return (
      <div
        className="w-full max-w-[280px] rounded-lg bg-muted/60 flex flex-col items-center justify-center gap-2 p-4 cursor-pointer"
        style={{ aspectRatio: "4/3", minHeight: 120 }}
        onClick={() => window.open(src, '_blank')}
      >
        <AlertTriangle className="w-8 h-8 text-muted-foreground" />
        <span className="text-xs text-muted-foreground text-center">Imagem indisponível</span>
        <span className="text-[10px] text-primary underline">Tentar abrir externamente</span>
      </div>
    );
  }

  return (
    <div
      className="cursor-pointer group relative"
      onClick={onClick}
    >
      {!loaded && (
        <div
          className="w-full max-w-[280px] rounded-lg bg-muted animate-pulse"
          style={{ aspectRatio: "4/3", minHeight: 120 }}
        />
      )}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={handleLoad}
        onError={handleError}
        className={cn(
          "max-w-full rounded-lg max-h-60 object-cover transition-opacity duration-300",
          loaded ? "opacity-100" : "opacity-0 absolute inset-0"
        )}
      />
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 rounded-lg">
        <ZoomIn className="w-8 h-8 text-white drop-shadow-lg" />
      </div>
    </div>
  );
});

/**
 * AudioPlayer — wraps <audio> with error state so broken URLs show feedback.
 */
const AudioPlayer = memo(function AudioPlayer({ src }: { src: string }) {
  const [error, setError] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const handleError = useCallback(() => setError(true), []);

  if (error) {
    return (
      <div
        className="flex items-center gap-2 text-sm p-2 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors"
        onClick={() => window.open(src, '_blank')}
      >
        <AlertTriangle className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Áudio indisponível</span>
        <span className="text-[10px] text-primary underline ml-auto">Abrir</span>
      </div>
    );
  }

  return (
    <audio
      ref={audioRef}
      src={src}
      controls
      preload="none"
      className="max-w-full"
      onError={handleError}
    />
  );
});

export { MessageBubble };
