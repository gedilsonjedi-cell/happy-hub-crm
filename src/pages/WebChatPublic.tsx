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

  // Altura real visível (fallback para iOS sem dvh / teclado aberto)
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

  const color = link?.theme_color || "hsl(var(--primary))";

  if (status === "loading") {
    return <div className="flex h-[100dvh] items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (status === "error") {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-background p-6 text-center">
        <div><p className="text-lg font-semibold text-foreground">Chat indisponível</p><p className="text-sm text-muted-foreground mt-1">Este link não existe ou foi desativado.</p></div>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 top-0 mx-auto flex h-[100dvh] w-full max-w-md flex-col overflow-hidden bg-muted" style={shellStyle}>
      <header className="sticky top-0 z-10 flex flex-none items-center gap-3 px-4 py-3 shadow-sm" style={{ backgroundColor: color, color: "#fff", paddingTop: "max(0.75rem, env(safe-area-inset-top))", paddingLeft: "max(1rem, env(safe-area-inset-left))", paddingRight: "max(1rem, env(safe-area-inset-right))" }}>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background/20 font-semibold">
          {link?.name?.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-tight">{link?.name}</p>
          <p className="text-xs opacity-80">{typing ? "digitando..." : status === "offline" ? "reconectando..." : "online"}</p>
        </div>
      </header>

      {status === "offline" && (
        <div className="flex items-center justify-center gap-2 bg-destructive/10 py-1.5 text-xs text-destructive">
          <WifiOff className="h-3.5 w-3.5" /> Conexão instável — tentando novamente
        </div>
      )}

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4" style={{ WebkitOverflowScrolling: "touch" }}>
        <div className="flex flex-col gap-2">
          {messages.map((m) => {
            const mine = m.direction === "inbound";
            return (
              <div key={m.id} className={`flex items-end gap-1.5 ${mine ? "justify-end" : "justify-start"}`}>
                {mine && m.delivery === "failed" && (
                  <CircleAlert className="mb-1 h-4 w-4 shrink-0 text-destructive" aria-label="Falha ao enviar" />
                )}
                <div
                  className={`min-w-0 max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${mine ? "rounded-br-md" : "rounded-bl-md bg-background text-foreground"} ${m.delivery === "failed" ? "ring-1 ring-destructive/40" : ""}`}
                  style={mine ? { backgroundColor: color, color: "#fff" } : undefined}
                >
                  <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{m.content}</p>
                  <p className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${mine ? "opacity-75" : "text-muted-foreground"}`}>
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
              <div className="flex gap-1 rounded-2xl rounded-bl-md bg-background px-4 py-3 shadow-sm">
                {[0, 150, 300].map((d) => (
                  <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </main>

      <footer className="sticky bottom-0 z-10 flex-none border-t border-border bg-background p-2" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={1}
            enterKeyHint="send"
            maxLength={4000}
            placeholder="Digite sua mensagem..."
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl border border-input bg-muted/50 px-4 py-2.5 text-base text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!text.trim()}
            aria-label="Enviar"
            className="h-11 min-h-11 w-11 min-w-11 shrink-0 rounded-full transition-opacity disabled:opacity-40"
            style={{ backgroundColor: color }}
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </footer>
    </div>
  );
}
