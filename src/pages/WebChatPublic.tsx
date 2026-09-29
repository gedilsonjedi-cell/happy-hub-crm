import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { CircleAlert, Loader2, Send, WifiOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

interface Msg {
  id: string;
  content: string;
  direction: string;
  sender_name: string | null;
  created_at: string;
  delivery?: "sending" | "failed";
}

const SESSION_KEY = "webchat_session_id";
const WA_HEADER = "#005c4b";

function getSessionId() {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(SESSION_KEY, id); }
  return id;
}

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export default function WebChatPublic() {
  const { linkId } = useParams<{ linkId: string }>();
  const [sessionId] = useState(getSessionId);
  const [link, setLink] = useState<{ name: string; theme_color: string; prefill_text?: string | null } | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "offline">("loading");
  const [text, setText] = useState(() => {
    const t = new URLSearchParams(window.location.search).get("text");
    return t ? t.slice(0, 4000) : "";
  });
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typedRef = useRef(false);

  const addMsg = (m: Msg) => setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));

  const confirmMsg = (optimisticId: string, confirmed: Msg) => {
    setMessages((prev) => {
      const withoutOptimistic = prev.filter((message) => message.id !== optimisticId);
      return withoutOptimistic.some((message) => message.id === confirmed.id)
        ? withoutOptimistic
        : [...withoutOptimistic, confirmed];
    });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Link Mágico: ?lead_id= vincula a sessão ao contato existente e dispara o Radar de Abandono
      const leadId = new URLSearchParams(window.location.search).get("lead_id") || undefined;
      const { data, error } = await supabase.functions.invoke("webchat-init", { body: { linkId, sessionId, leadId } });
      if (cancelled) return;
      if (error || !data?.link) { setStatus("error"); return; }
      setLink(data.link);
      setMessages(data.messages || []);
      setStatus("ready");
      document.title = `${data.link.name} — Chat`;
      // Texto pré-definido vem do link (URL limpa); só quando o cliente ainda não digitou
      // e quando a URL já não trouxe um ?text= de link antigo.
      const prefill = typeof data.link.prefill_text === "string" ? data.link.prefill_text.trim().slice(0, 4000) : "";
      if (prefill && !typedRef.current) setText((prev) => (prev ? prev : prefill));
    })();
    return () => { cancelled = true; };
  }, [linkId, sessionId]);

  useEffect(() => {
    const ch = supabase
      .channel(`webchat:${sessionId}`)
      .on("broadcast", { event: "message" }, ({ payload }) => {
        const m = payload as Msg;
        if (m.direction === "outbound") setTyping(false);
        addMsg(m);
      })
      .on("broadcast", { event: "typing" }, () => {
        setTyping(true);
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => setTyping(false), 4000);
      })
      .subscribe((s) => {
        if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") setStatus((p) => (p === "ready" ? "offline" : p));
        if (s === "SUBSCRIBED") setStatus((p) => (p === "offline" ? "ready" : p));
      });
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      supabase.removeChannel(ch);
    };
  }, [sessionId]);

  // Presence: alimenta o contador "Online Agora" do painel (só o id da sessão, sem dados pessoais)
  useEffect(() => {
    if (!linkId) return;
    const ch = supabase.channel(`webchat-presence:${linkId}`, { config: { presence: { key: sessionId } } });
    ch.subscribe((s) => { if (s === "SUBSCRIBED") ch.track({ at: Date.now() }); });
    return () => { supabase.removeChannel(ch); };
  }, [linkId, sessionId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, typing]);

  // Altura real visível: mantém o botão de enviar acima do teclado sem dar zoom
  const [vh, setVh] = useState<number | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    const update = () => {
      setVh(vv ? vv.height : window.innerHeight);
      window.scrollTo(0, 0);
      bottomRef.current?.scrollIntoView({ block: "end" });
    };
    update();
    vv?.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    const html = document.documentElement, body = document.body;
    const prev = [html.style.overscrollBehavior, body.style.overscrollBehavior, body.style.overflow];
    html.style.overscrollBehavior = "none"; body.style.overscrollBehavior = "none"; body.style.overflow = "hidden";
    return () => {
      vv?.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      [html.style.overscrollBehavior, body.style.overscrollBehavior, body.style.overflow] = prev;
    };
  }, []);
  const shellStyle = vh ? { height: `${vh}px` } : undefined;

  const send = () => {
    const content = text.trim();
    if (!content) return;

    const optimisticId = `pending:${crypto.randomUUID()}`;
    const optimisticMessage: Msg = {
      id: optimisticId,
      content,
      direction: "inbound",
      sender_name: "Visitante",
      created_at: new Date().toISOString(),
      delivery: "sending",
    };

    addMsg(optimisticMessage);
    setText("");

    void supabase.functions
      .invoke("webchat-send", { body: { linkId, sessionId, content } })
      .then(({ data, error }) => {
        if (error || !data?.message) {
          setMessages((prev) => prev.map((message) =>
            message.id === optimisticId ? { ...message, delivery: "failed" } : message
          ));
          return;
        }
        confirmMsg(optimisticId, data.message as Msg);
      })
      .catch(() => {
        setMessages((prev) => prev.map((message) =>
          message.id === optimisticId ? { ...message, delivery: "failed" } : message
        ));
      });
  };

  // ---- Avisos (Web Push) — Card de Sistema após a 1ª mensagem do visitante ----
  const pushKey = `webchat_push_on:${linkId}`;
  const pushSupported = typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
  const [pushState, setPushState] = useState<"idle" | "working" | "done" | "error" | "blocked">(() => {
    if (typeof localStorage !== "undefined" && localStorage.getItem(`webchat_push_on:${linkId}`)) return "done";
    if (typeof Notification !== "undefined" && Notification.permission === "denied") return "blocked";
    return "idle";
  });
  const hasSentOne = messages.some((m) => m.direction === "inbound" && !m.delivery);
  const showPushCard = pushSupported && hasSentOne;
  const pushBlocked = pushState === "blocked"
    || (typeof Notification !== "undefined" && Notification.permission === "denied");

  const b64ToBytes = (b64: string) => {
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  };

  const enablePush = async () => {
    // Antes de pedir: verifica o status atual. Com 'denied' o navegador não exibe o prompt nativo,
    // então mostramos a instrução de recuperação em vez de tentar pedir permissão.
    if (typeof Notification !== "undefined" && Notification.permission === "denied") {
      setPushState("blocked");
      return;
    }
    setPushState("working");
    try {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          setPushState(perm === "denied" ? "blocked" : "idle");
          return;
        }
      }
      const reg = await navigator.serviceWorker.register("/webchat-sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const { data: k, error: kErr } = await supabase.functions.invoke("webchat-push-subscribe", { body: { action: "key", linkId, sessionId } });
      if (kErr || !k?.publicKey) throw kErr || new Error("sem chave");
      const sub = (await reg.pushManager.getSubscription())
        || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(k.publicKey) }));
      const { error } = await supabase.functions.invoke("webchat-push-subscribe", { body: { linkId, sessionId, subscription: sub.toJSON() } });
      if (error) throw error;
      localStorage.setItem(pushKey, "1");
      setPushState("done");
    } catch (e) {
      console.error("[webchat] push", e);
      setPushState("error");
    }
  };

  const color = link?.theme_color?.trim() || WA_HEADER;

  if (status === "loading") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#EFEAE2]">
        <Loader2 className="h-6 w-6 animate-spin text-[#667781]" />
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#EFEAE2] p-6 text-center">
        <div>
          <p className="text-lg font-semibold text-[#111b21]">Chat indisponível</p>
          <p className="mt-1 text-sm text-[#667781]">Este link não existe ou foi desativado.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 flex h-[100dvh] w-full flex-col overflow-hidden bg-[#EFEAE2]"
      style={shellStyle}
    >
      <header
        className="z-50 flex h-16 w-full flex-none items-center gap-3 bg-[#005c4b] px-4 text-white shadow-md"
        style={{ backgroundColor: color, paddingTop: "env(safe-area-inset-top)", minHeight: "calc(4rem + env(safe-area-inset-top))", paddingLeft: "max(1rem, env(safe-area-inset-left))", paddingRight: "max(1rem, env(safe-area-inset-right))" }}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 font-semibold">
          {link?.name?.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-tight">{link?.name}</p>
          <p className="text-xs text-white/80">{typing ? "digitando..." : status === "offline" ? "reconectando..." : "online"}</p>
        </div>
      </header>

      {status === "offline" && (
        <div className="flex flex-none items-center justify-center gap-2 bg-[#ffe5e5] py-1.5 text-xs text-[#b30000]">
          <WifiOff className="h-3.5 w-3.5" /> Conexão instável — tentando novamente
        </div>
      )}

      <main
        className="min-h-0 flex-1 w-full space-y-3 overflow-y-auto overscroll-contain p-4"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {messages.map((m) => {
          if (m.direction === "system") {
            return (
              <div key={m.id} className="flex justify-center">
                <p className="rounded-lg bg-[#FFF3C4] px-3 py-1.5 text-center text-xs text-[#54656f] shadow-sm">{m.content}</p>
              </div>
            );
          }
          const mine = m.direction === "inbound";
          return (
            <div key={m.id} className={`flex items-end gap-1.5 ${mine ? "justify-end" : "justify-start"}`}>
              {mine && m.delivery === "failed" && (
                <CircleAlert className="mb-1 h-4 w-4 shrink-0 text-[#ea0038]" aria-label="Falha ao enviar" />
              )}
              <div
                className={`min-w-0 max-w-[80%] rounded-lg px-3 py-2 shadow-sm ${mine ? "rounded-tr-none" : "rounded-tl-none bg-white text-[#111b21]"} ${m.delivery === "failed" ? "ring-1 ring-[#ea0038]/50" : ""}`}
                style={mine ? { backgroundColor: color, color: "#fff" } : undefined}
              >
                <p className="whitespace-pre-wrap break-words text-[15px] leading-snug [overflow-wrap:anywhere]">{m.content}</p>
                <p className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${mine ? "text-white/75" : "text-[#667781]"}`}>
                  {m.delivery === "sending" && <span>enviando</span>}
                  {m.delivery === "failed" && <span>não enviada</span>}
                  <span>{fmtTime(m.created_at)}</span>
                </p>
              </div>
            </div>
          );
        })}
        {showPushCard && (
          <div className="flex justify-center">
            <div className="w-full max-w-sm rounded-lg bg-white p-4 text-center text-[#111b21] shadow-sm">
              {pushState === "done" ? (
                <p className="text-sm font-medium">Avisos configurados! Pode ficar tranquilo. ✅</p>
              ) : pushBlocked ? (
                <p className="text-sm leading-relaxed text-[#667781]">
                  ⚠️ Seus alertas estão bloqueados pelo navegador. Para receber nossos avisos, clique no ícone de cadeado 🔒 (ou configurações) lá em cima na barra de endereços e altere as Notificações para Permitir.
                </p>
              ) : (
                <>
                  <p className="text-sm font-medium">Vamos iniciar o seu atendimento.</p>
                  <p className="mt-1 text-xs leading-relaxed text-[#667781]">
                    {pushState === "error"
                      ? "Não foi possível ativar agora. Tente novamente."
                      : "Caso acabe fechando a página sem querer, ative os alertas. Assim, garantimos que você receba nossa mensagem e um melhor atendimento."}
                  </p>
                  <button
                    type="button"
                    onClick={enablePush}
                    disabled={pushState === "working"}
                    className="mt-3 w-full rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    style={{ backgroundColor: color }}
                  >
                    {pushState === "working" ? "Ativando..." : "🔔 Ativar Avisos"}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
        {typing && (
          <div className="flex justify-start">
            <div className="flex gap-1 rounded-lg rounded-tl-none bg-white px-4 py-3 shadow-sm">
              {[0, 150, 300].map((d) => (
                <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-[#667781]/60" style={{ animationDelay: `${d}ms` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      <footer className="z-50 flex w-full flex-none items-center gap-2 bg-white p-2 pb-safe">
        <form className="flex w-full items-end gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <textarea
            value={text}
            onChange={(e) => { typedRef.current = true; setText(e.target.value); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={1}
            enterKeyHint="send"
            maxLength={4000}
            placeholder="Digite sua mensagem..."
            className="max-h-32 min-h-[40px] w-full flex-1 resize-none appearance-none rounded-full border border-gray-300 bg-white px-4 py-2 text-[16px] text-[#111b21] placeholder:text-[#667781] focus:outline-none focus:ring-0 md:text-sm"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!text.trim()}
            aria-label="Enviar"
            className="h-11 min-h-11 w-11 min-w-11 shrink-0 rounded-full text-white transition-opacity disabled:opacity-40"
            style={{ backgroundColor: color }}
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </footer>
    </div>
  );
}
