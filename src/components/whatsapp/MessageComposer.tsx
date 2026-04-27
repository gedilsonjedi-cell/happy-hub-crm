import {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { Send, Loader2, Mic, FileText } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { QuickResponsesAutocomplete } from "./QuickResponsesAutocomplete";

export interface MessageComposerHandle {
  /** Read the current draft (used by parent before sending). */
  getValue: () => string;
  /** Replace the draft (used to restore text after a failed send). */
  setValue: (v: string) => void;
  /** Clear the draft. */
  clear: () => void;
  /** Focus the textarea. */
  focus: () => void;
}

interface MessageComposerProps {
  /** Reset key — change this when the conversation changes to clear the draft. */
  conversationKey: string | null;
  isWindowExpired: boolean;
  isMyConversation: boolean;
  isSendingMessage: boolean;
  uploadingMedia: boolean;
  /** Called when the user presses Enter or clicks Send. Receives the trimmed text. */
  onSend: (text: string) => void;
  /** Called when the user clicks the voice/mic button. */
  onStartVoiceRecording: () => void;
  /** Called when the user clicks the template button (window expired flow). */
  onOpenTemplateSelector: () => void;
  /** Called when the user pastes content (forwarded for image-paste handling). */
  onPaste?: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
}

/**
 * MessageComposer — fully isolated textarea + action buttons.
 *
 * Owns its own draft state so typing does NOT re-render the parent
 * (AtendimentoV2 is ~4800 lines; per-keystroke re-renders were the main
 * cause of "lentidão" reported by Henrimath).
 *
 * The parent reads the draft via the imperative ref handle on send,
 * and clears/restores it the same way.
 */
const MessageComposerInner = forwardRef<MessageComposerHandle, MessageComposerProps>(
  function MessageComposerInner(
    {
      conversationKey,
      isWindowExpired,
      isMyConversation,
      isSendingMessage,
      uploadingMedia,
      onSend,
      onStartVoiceRecording,
      onOpenTemplateSelector,
      onPaste,
    },
    ref
  ) {
    const [draft, setDraft] = useState("");
    const [showAutocomplete, setShowAutocomplete] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const lastConversationKeyRef = useRef<string | null>(conversationKey);

    // Reset draft when switching conversations (without going through parent state).
    if (lastConversationKeyRef.current !== conversationKey) {
      lastConversationKeyRef.current = conversationKey;
      // Defer state update out of render to satisfy React strict mode.
      queueMicrotask(() => {
        setDraft("");
        setShowAutocomplete(false);
      });
    }

    useImperativeHandle(
      ref,
      () => ({
        getValue: () => draft,
        setValue: (v: string) => setDraft(v),
        clear: () => setDraft(""),
        focus: () => textareaRef.current?.focus(),
      }),
      [draft]
    );

    const disabled = isWindowExpired || !isMyConversation;

    const handleSend = useCallback(() => {
      if (isSendingMessage || disabled) return;
      const text = draft.trim();
      if (!text) return;
      // Optimistic UX: clear immediately. Parent can call setValue() on failure to restore.
      setDraft("");
      setShowAutocomplete(false);
      onSend(text);
    }, [draft, isSendingMessage, disabled, onSend]);

    const handleKeyDown = useCallback(
      (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (showAutocomplete) {
          if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(e.key)) return;
        }
        if (e.key === "Enter" && !e.shiftKey && !disabled && !showAutocomplete) {
          e.preventDefault();
          handleSend();
        }
        if (e.key === "Escape" && showAutocomplete) {
          setShowAutocomplete(false);
        }
      },
      [showAutocomplete, disabled, handleSend]
    );

    return (
      <div className="relative flex-1 flex items-end gap-2">
        <QuickResponsesAutocomplete
          isOpen={showAutocomplete}
          onClose={() => setShowAutocomplete(false)}
          onSelectResponse={(content) => {
            setDraft(content);
            setShowAutocomplete(false);
            textareaRef.current?.focus();
          }}
          searchTerm={draft}
        />

        <Textarea
          ref={textareaRef}
          placeholder={
            !isMyConversation
              ? "Esta conversa pertence a outro atendente"
              : isWindowExpired
                ? "Use um template..."
                : "Digite / para respostas rápidas..."
          }
          className={cn(
            "min-h-[44px] max-h-32 resize-none bg-muted/30 text-sm flex-1",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          value={draft}
          onChange={(e) => {
            if (disabled) return;
            const value = e.target.value;
            setDraft(value);
            if (value.startsWith("/") || value.includes(" /")) {
              setShowAutocomplete(true);
            } else if (showAutocomplete) {
              setShowAutocomplete(false);
            }
          }}
          disabled={disabled}
          onPaste={onPaste}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            // Delay so click on autocomplete items still registers
            setTimeout(() => setShowAutocomplete(false), 200);
          }}
        />

        {isWindowExpired ? (
          <Button onClick={onOpenTemplateSelector} className="h-11 px-4 shrink-0">
            <FileText className="w-5 h-5" />
          </Button>
        ) : draft.trim() ? (
          <Button
            onClick={handleSend}
            disabled={isSendingMessage}
            className="h-11 px-4 shrink-0"
          >
            {isSendingMessage ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </Button>
        ) : (
          <Button
            onClick={onStartVoiceRecording}
            disabled={uploadingMedia}
            variant="default"
            className="h-11 px-4 bg-green-600 hover:bg-green-700 shrink-0"
          >
            {uploadingMedia ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Mic className="w-5 h-5" />
            )}
          </Button>
        )}
      </div>
    );
  }
);

export const MessageComposer = memo(MessageComposerInner);
