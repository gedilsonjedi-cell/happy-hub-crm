import { memo } from "react";
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
} from "lucide-react";
import { formatErrorDisplay } from "@/lib/metaErrorMessages";
import type { MessageRow } from "@/hooks/useInfiniteMessages";

interface MessageBubbleProps {
  message: MessageRow;
  showDateSeparator: boolean;
  onMediaPreview: (url: string, type: string, fileName?: string) => void;
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
  templates,
}: MessageBubbleProps) {
  const isOutbound = message.direction === "outbound";
  const isFailed = message.status === "failed";

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
              <div
                className="cursor-pointer group relative"
                onClick={() => onMediaPreview(message.media_url!, message.message_type)}
              >
                {/* loading="lazy" — browser defers decode until image enters viewport */}
                <img
                  src={message.media_url}
                  alt="Media"
                  loading="lazy"
                  decoding="async"
                  className="max-w-full rounded-lg max-h-60 object-cover transition-opacity group-hover:opacity-90"
                />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 rounded-lg">
                  <ZoomIn className="w-8 h-8 text-white drop-shadow-lg" />
                </div>
              </div>
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
          return <audio src={message.media_url} controls preload="none" className="max-w-full" />;

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

      if (displayContent) {
        templateParams.forEach((param, index) => {
          displayContent = displayContent.replace(`{{${index + 1}}}`, param);
        });

        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground/80 mb-1">
              <FileText className="w-3 h-3" />
              <span className="font-medium">{templateName}</span>
            </div>
            <p className="text-sm whitespace-pre-wrap break-words">{displayContent}</p>
            {buttons.length > 0 && (
              <div className="flex flex-col gap-1 pt-2 border-t border-border/30">
                {buttons.map((button, idx) => (
                  <div key={idx} className="flex items-center justify-center gap-2 py-1.5 px-3 rounded bg-background/20 text-xs font-medium text-center">
                    {button.type === "URL" && <><span className="text-primary">🔗</span><span>{button.text}</span></>}
                    {button.type === "PHONE_NUMBER" && <><Phone className="w-3 h-3 text-primary" /><span>{button.text}</span></>}
                    {button.type === "QUICK_REPLY" && <span>{button.text}</span>}
                    {!["URL", "PHONE_NUMBER", "QUICK_REPLY"].includes(button.type) && <span>{button.text}</span>}
                  </div>
                ))}
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
          <p className="text-sm text-muted-foreground italic">Conteúdo do template indisponível</p>
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
        <div className={cn("max-w-[80%]", isFailed ? "space-y-2" : "")}>
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

export { MessageBubble };
