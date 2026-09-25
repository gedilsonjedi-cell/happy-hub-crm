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
  const [link, setLink] = useState<{ name: string; theme_color: string } | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "offline">("loading");
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const { data, error } = await supabase.functions.invoke("webchat-init", { body: { linkId, sessionId } });
      if (cancelled) return;
      if (error || !data?.link) { setStatus("error"); return; }
      setLink(data.link);
      setMessages(data.messages || []);
      setStatus("ready");
      document.title = `${data.link.name} — Chat`;
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
            onChange={(e) => setText(e.target.value)}
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
