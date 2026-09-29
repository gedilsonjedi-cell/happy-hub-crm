import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Check,
  CheckCheck,
  CircleAlert,
  Loader2,
  Mic,
  MoreVertical,
  Search,
  Send,
  Smile,
  Trash2,
  WifiOff,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAudioRecording } from "@/hooks/useAudioRecording";

interface Msg {
  id: string;
  content: string;
  direction: string;
  sender_name: string | null;
  created_at: string;
  message_type?: string;
  media_url?: string | null;
  status?: string | null;
  delivery?: "sending" | "failed";
}

const SESSION_KEY = "webchat_session_id";
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const EMOJIS = ["😀", "😂", "🥰", "😍", "😊", "🙏", "👍", "👏", "🎉", "❤️", "🔥", "✅", "😉", "🤝", "📌", "👀", "💬", "🚀"];

function getSessionId() {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const fmtDuration = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export default function WebChatPublic() {
  const { linkId } = useParams<{ linkId: string }>();
  const [sessionId] = useState(getSessionId);
  const [link, setLink] = useState<{ name: string; theme_color: string; prefill_text?: string | null; avatar_url?: string | null } | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "offline">("loading");
  const [text, setText] = useState(() => new URLSearchParams(window.location.search).get("text")?.slice(0, 4000) || "");
  const [typing, setTyping] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [vh, setVh] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typedRef = useRef(false);
  const { isRecording, recordingDuration, startRecording, stopRecording, cancelRecording } = useAudioRecording();

  const addMsg = (message: Msg) => setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
  const confirmMsg = (optimisticId: string, confirmed: Msg) => setMessages((current) => {
    const remaining = current.filter((message) => message.id !== optimisticId);
    return remaining.some((message) => message.id === confirmed.id) ? remaining : [...remaining, confirmed];
  });
  const failMsg = (id: string) => setMessages((current) => current.map((message) => message.id === id ? { ...message, delivery: "failed" } : message));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const leadId = new URLSearchParams(window.location.search).get("lead_id") || undefined;
      const { data, error } = await supabase.functions.invoke("webchat-init", { body: { linkId, sessionId, leadId } });
      if (cancelled) return;
      if (error || !data?.link) {
        setStatus("error");
        return;
      }
      setLink(data.link);
      setMessages(data.messages || []);
      setStatus("ready");
      document.title = `${data.link.name} — Chat`;
      const prefill = typeof data.link.prefill_text === "string" ? data.link.prefill_text.trim().slice(0, 4000) : "";
      if (prefill && !typedRef.current) setText((current) => current || prefill);
    })();
    return () => { cancelled = true; };
  }, [linkId, sessionId]);

  useEffect(() => {
    const channel = supabase.channel(`webchat:${sessionId}`)
      .on("broadcast", { event: "message" }, ({ payload }) => {
        const message = payload as Msg;
        if (message.direction === "outbound") setTyping(false);
        addMsg(message);
      })
      .on("broadcast", { event: "typing" }, () => {
        setTyping(true);
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => setTyping(false), 4000);
      })
      .subscribe((nextStatus) => {
        if (nextStatus === "CHANNEL_ERROR" || nextStatus === "TIMED_OUT") setStatus((current) => current === "ready" ? "offline" : current);
        if (nextStatus === "SUBSCRIBED") setStatus((current) => current === "offline" ? "ready" : current);
      });
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [sessionId]);

  useEffect(() => {
    if (!linkId) return;
    const channel = supabase.channel(`webchat-presence:${linkId}`, { config: { presence: { key: sessionId } } });
    channel.subscribe((nextStatus) => { if (nextStatus === "SUBSCRIBED") void channel.track({ at: Date.now() }); });
    return () => { void supabase.removeChannel(channel); };
  }, [linkId, sessionId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, typing]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      setVh(viewport ? viewport.height : window.innerHeight);
      window.scrollTo(0, 0);
      bottomRef.current?.scrollIntoView({ block: "end" });
    };
    update();
    viewport?.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    const html = document.documentElement;
    const body = document.body;
    const previous = [html.style.overscrollBehavior, body.style.overscrollBehavior, body.style.overflow];
    html.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";
    body.style.overflow = "hidden";
    return () => {
      viewport?.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      [html.style.overscrollBehavior, body.style.overscrollBehavior, body.style.overflow] = previous;
    };
  }, []);

  useEffect(() => {
    if (isRecording && recordingDuration >= 300) cancelRecording();
  }, [cancelRecording, isRecording, recordingDuration]);

  const sendText = () => {
    const content = text.trim();
    if (!content) return;
    setComposerError(null);
    const optimisticId = `pending:${crypto.randomUUID()}`;
    addMsg({ id: optimisticId, content, direction: "inbound", sender_name: "Visitante", created_at: new Date().toISOString(), message_type: "text", delivery: "sending" });
    setText("");
    void supabase.functions.invoke("webchat-send", { body: { linkId, sessionId, content } })
      .then(({ data, error }) => error || !data?.message ? failMsg(optimisticId) : confirmMsg(optimisticId, data.message as Msg))
      .catch(() => failMsg(optimisticId));
  };

  const beginRecording = async () => {
    setComposerError(null);
    try {
      await startRecording();
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : "Não foi possível acessar o microfone.");
    }
  };

  const sendAudio = async () => {
    const duration = recordingDuration;
    setAudioBusy(true);
    setComposerError(null);
    const blob = await stopRecording();
    if (!blob || duration < 1) {
      setComposerError("Grave pelo menos 1 segundo de áudio.");
      setAudioBusy(false);
      return;
    }
    if (blob.size > MAX_AUDIO_BYTES) {
      setComposerError("O áudio deve ter no máximo 10 MB.");
      setAudioBusy(false);
      return;
    }
    const optimisticId = `pending:${crypto.randomUUID()}`;
    const localUrl = URL.createObjectURL(blob);
    addMsg({ id: optimisticId, content: "[Áudio]", direction: "inbound", sender_name: "Visitante", created_at: new Date().toISOString(), message_type: "audio", media_url: localUrl, delivery: "sending" });
    const form = new FormData();
    form.append("linkId", linkId || "");
    form.append("sessionId", sessionId);
    form.append("duration", String(duration));
    form.append("audio", blob, `audio-${Date.now()}.${blob.type.includes("ogg") ? "ogg" : "webm"}`);
    try {
      const { data, error } = await supabase.functions.invoke("webchat-send", { body: form });
      if (error || !data?.message) failMsg(optimisticId);
      else confirmMsg(optimisticId, data.message as Msg);
    } catch {
      failMsg(optimisticId);
    } finally {
      setAudioBusy(false);
      window.setTimeout(() => URL.revokeObjectURL(localUrl), 60_000);
    }
  };

  const addEmoji = (emoji: string) => {
    const input = textareaRef.current;
    const start = input?.selectionStart ?? text.length;
    const end = input?.selectionEnd ?? start;
    setText(`${text.slice(0, start)}${emoji}${text.slice(end)}`.slice(0, 4000));
    setEmojiOpen(false);
    window.setTimeout(() => input?.focus(), 0);
  };

  const pushKey = `webchat_push_on:${linkId}`;
  const pushSupported = typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
  const [pushState, setPushState] = useState<"idle" | "working" | "done" | "error" | "blocked">(() => {
    if (typeof localStorage !== "undefined" && localStorage.getItem(`webchat_push_on:${linkId}`)) return "done";
    if (typeof Notification !== "undefined" && Notification.permission === "denied") return "blocked";
    return "idle";
  });
  const hasSentOne = messages.some((message) => message.direction === "inbound" && !message.delivery);
  const showPushCard = pushSupported && hasSentOne;
  const pushBlocked = pushState === "blocked" || (typeof Notification !== "undefined" && Notification.permission === "denied");

  const b64ToBytes = (value: string) => {
    const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
    return Uint8Array.from(atob(padded.replace(/-/g, "+").replace(/_/g, "/")), (character) => character.charCodeAt(0));
  };

  const enablePush = async () => {
    if (typeof Notification !== "undefined" && Notification.permission === "denied") {
      setPushState("blocked");
      return;
    }
    setPushState("working");
    try {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setPushState(permission === "denied" ? "blocked" : "idle");
          return;
        }
      }
      const registration = await navigator.serviceWorker.register("/webchat-sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const { data: keyData, error: keyError } = await supabase.functions.invoke("webchat-push-subscribe", { body: { action: "key", linkId, sessionId } });
      if (keyError || !keyData?.publicKey) throw keyError || new Error("sem chave");
      const subscription = await registration.pushManager.getSubscription()
        || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(keyData.publicKey) });
      const { error } = await supabase.functions.invoke("webchat-push-subscribe", { body: { linkId, sessionId, subscription: subscription.toJSON() } });
      if (error) throw error;
      localStorage.setItem(pushKey, "1");
      setPushState("done");
    } catch (error) {
      console.error("[webchat] push", error);
      setPushState("error");
    }
  };

  if (status === "loading") return <div className="webchat-shell fixed inset-0 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-webchat-muted" /></div>;
  if (status === "error") return (
    <div className="webchat-shell fixed inset-0 flex items-center justify-center p-6 text-center">
      <div><p className="text-lg font-semibold text-webchat-text">Chat indisponível</p><p className="mt-1 text-sm text-webchat-muted">Este link não existe ou foi desativado.</p></div>
    </div>
  );

  return (
    <div className="webchat-viewport fixed inset-0 flex w-full justify-center overflow-hidden" style={vh ? { height: `${vh}px` } : undefined}>
      <section className="webchat-shell flex h-full w-full max-w-[100rem] flex-col overflow-hidden" aria-label="Web Chat público">
        <header className="webchat-header z-30 flex w-full flex-none items-center gap-3 px-4 text-webchat-text shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-webchat-avatar font-semibold text-webchat-text" aria-hidden="true">
            {link?.avatar_url
              ? <img src={link.avatar_url} alt="" data-testid="webchat-profile-photo" className="h-full w-full object-cover" />
              : link?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold leading-tight">{link?.name}</p>
            <p className="text-xs text-webchat-muted">{typing ? "digitando..." : status === "offline" ? "reconectando..." : "online"}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Buscar na conversa" className="text-webchat-muted hover:bg-webchat-hover hover:text-webchat-text"><Search /></Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Mais opções" className="text-webchat-muted hover:bg-webchat-hover hover:text-webchat-text"><MoreVertical /></Button>
        </header>

        {status === "offline" && <div className="flex flex-none items-center justify-center gap-2 bg-webchat-error-surface py-1.5 text-xs text-webchat-error"><WifiOff className="h-3.5 w-3.5" /> Conexão instável — tentando novamente</div>}

        <main className="webchat-doodles min-h-0 w-full flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 py-4 sm:px-8 lg:px-[8%]" style={{ WebkitOverflowScrolling: "touch" }} data-testid="webchat-history">
          {messages.map((message) => {
            if (message.direction === "system") return <div key={message.id} className="flex justify-center"><p className="rounded-md bg-webchat-system px-3 py-1.5 text-center text-xs text-webchat-muted shadow-sm">{message.content}</p></div>;
            const mine = message.direction === "inbound";
            return (
              <div key={message.id} className={`flex items-end gap-1.5 ${mine ? "justify-end" : "justify-start"}`}>
                {mine && message.delivery === "failed" && <CircleAlert className="mb-1 h-4 w-4 shrink-0 text-webchat-error" aria-label="Falha ao enviar" />}
                <div className={`webchat-bubble relative min-w-0 max-w-[85%] px-3 pb-1.5 pt-2 shadow-sm sm:max-w-[70%] lg:max-w-[55%] ${mine ? "webchat-bubble-sent" : "webchat-bubble-received"} ${message.delivery === "failed" ? "ring-1 ring-webchat-error" : ""}`} data-direction={mine ? "sent" : "received"}>
                  {message.message_type === "audio" && message.media_url
                    ? <audio src={message.media_url} controls preload="metadata" className="h-10 max-w-full" aria-label="Mensagem de áudio" />
                    : <p className="whitespace-pre-wrap break-words pr-14 text-[15px] leading-snug [overflow-wrap:anywhere]">{message.content}</p>}
                  <p className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-webchat-muted">
                    {message.delivery === "sending" && <span>enviando</span>}
                    {message.delivery === "failed" && <span>não enviada</span>}
                    <span>{fmtTime(message.created_at)}</span>
                    {mine && (message.delivery === "sending" ? <Check className="h-3.5 w-3.5" aria-label="Enviando" /> : <CheckCheck className="h-3.5 w-3.5 text-webchat-check" aria-label="Entregue" />)}
                  </p>
                </div>
              </div>
            );
          })}

          {showPushCard && <div className="flex justify-center"><div className="w-full max-w-sm rounded-md bg-webchat-panel p-4 text-center text-webchat-text shadow-sm">
            {pushState === "done" ? <p className="text-sm font-medium">Avisos configurados! Pode ficar tranquilo. ✅</p>
              : pushBlocked ? <p className="text-sm leading-relaxed text-webchat-muted">⚠️ Seus alertas estão bloqueados pelo navegador. Para receber nossos avisos, clique no ícone de cadeado 🔒 (ou configurações) lá em cima na barra de endereços e altere as Notificações para Permitir.</p>
                : <><p className="text-sm font-medium">Vamos iniciar o seu atendimento.</p><p className="mt-1 text-xs leading-relaxed text-webchat-muted">{pushState === "error" ? "Não foi possível ativar agora. Tente novamente." : "Caso acabe fechando a página sem querer, ative os alertas. Assim, garantimos que você receba nossa mensagem e um melhor atendimento."}</p><Button type="button" onClick={enablePush} disabled={pushState === "working"} className="mt-3 w-full rounded-full bg-webchat-green text-webchat-text hover:bg-webchat-green-strong">{pushState === "working" ? "Ativando..." : "🔔 Ativar Avisos"}</Button></>}
          </div></div>}

          {typing && <div className="flex justify-start"><div className="webchat-bubble-received flex gap-1 rounded-md px-4 py-3 shadow-sm">{[0, 150, 300].map((delay) => <span key={delay} className="h-2 w-2 animate-bounce rounded-full bg-webchat-muted" style={{ animationDelay: `${delay}ms` }} />)}</div></div>}
          <div ref={bottomRef} />
        </main>

        <footer className="webchat-footer z-30 w-full flex-none px-2 pt-2 pb-safe">
          {composerError && <p role="alert" className="mb-2 px-2 text-xs text-webchat-error">{composerError}</p>}
          {isRecording ? (
            <div className="flex min-h-12 w-full items-center gap-2" data-testid="audio-recorder">
              <Button type="button" variant="ghost" size="icon" aria-label="Cancelar gravação" onClick={() => { cancelRecording(); setComposerError(null); }} className="shrink-0 text-webchat-error hover:bg-webchat-hover"><Trash2 /></Button>
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-webchat-error" />
              <span className="flex-1 tabular-nums text-sm text-webchat-text">Gravando {fmtDuration(recordingDuration)}</span>
              <Button type="button" size="icon" aria-label="Enviar áudio" onClick={() => void sendAudio()} disabled={audioBusy} className="shrink-0 rounded-full bg-webchat-green text-webchat-text hover:bg-webchat-green-strong">{audioBusy ? <Loader2 className="animate-spin" /> : <Send />}</Button>
            </div>
          ) : (
            <form className="flex w-full items-end gap-1" onSubmit={(event) => { event.preventDefault(); sendText(); }}>
              <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                <PopoverTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label="Escolher emoji" className="shrink-0 text-webchat-muted hover:bg-webchat-hover hover:text-webchat-text"><Smile /></Button></PopoverTrigger>
                <PopoverContent align="start" side="top" className="mb-1 grid w-64 grid-cols-6 gap-1 border-webchat-border bg-webchat-panel p-2 text-webchat-text">
                  {EMOJIS.map((emoji) => <Button key={emoji} type="button" variant="ghost" size="icon" aria-label={`Inserir ${emoji}`} onClick={() => addEmoji(emoji)} className="text-lg hover:bg-webchat-hover">{emoji}</Button>)}
                </PopoverContent>
              </Popover>
              <textarea ref={textareaRef} value={text} onChange={(event) => { typedRef.current = true; setText(event.target.value); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendText(); } }} rows={1} enterKeyHint="send" maxLength={4000} placeholder="Digite uma mensagem" className="max-h-32 min-h-10 w-full flex-1 resize-none appearance-none rounded-md border-0 bg-webchat-input px-3 py-2 text-[16px] text-webchat-text placeholder:text-webchat-muted focus:outline-none focus:ring-0 md:text-sm" />
              {text.trim() ? <Button type="submit" size="icon" aria-label="Enviar mensagem" className="shrink-0 rounded-full bg-webchat-green text-webchat-text hover:bg-webchat-green-strong"><Send /></Button>
                : <Button type="button" size="icon" aria-label="Gravar áudio" title="Gravar áudio" onClick={() => void beginRecording()} className="shrink-0 rounded-full bg-webchat-green text-webchat-text hover:bg-webchat-green-strong"><Mic /></Button>}
            </form>
          )}
        </footer>
      </section>
    </div>
  );
}