import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Send, Loader2, WifiOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Msg { id: string; content: string; direction: string; sender_name: string | null; created_at: string; }

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
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const addMsg = (m: Msg) => setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));

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
        setTimeout(() => setTyping(false), 4000);
      })
      .subscribe((s) => {
        if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") setStatus((p) => (p === "ready" ? "offline" : p));
        if (s === "SUBSCRIBED") setStatus((p) => (p === "offline" ? "ready" : p));
      });
    return () => { supabase.removeChannel(ch); };
  }, [sessionId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, typing]);

  const send = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setText("");
    const { data, error } = await supabase.functions.invoke("webchat-send", { body: { linkId, sessionId, content } });
    setSending(false);
    if (error || !data?.message) { setText(content); setStatus("offline"); return; }
    addMsg(data.message);
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
    <div className="flex h-[100dvh] flex-col bg-muted/40">
      <header className="flex items-center gap-3 px-4 py-3 shadow-sm" style={{ backgroundColor: color, color: "#fff" }}>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-background/20 font-semibold">
          {link?.name?.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold leading-tight">{link?.name}</p>
          <p className="text-xs opacity-80">{typing ? "digitando..." : status === "offline" ? "reconectando..." : "online"}</p>
        </div>
      </header>

      {status === "offline" && (
        <div className="flex items-center justify-center gap-2 bg-destructive/10 py-1.5 text-xs text-destructive">
          <WifiOff className="h-3.5 w-3.5" /> Conexão instável — tentando novamente
        </div>
      )}

      <main className="flex-1 overflow-y-auto px-3 py-4 sm:px-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-2">
          {messages.map((m) => {
            const mine = m.direction === "inbound";
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${mine ? "rounded-br-md" : "rounded-bl-md bg-background text-foreground"}`}
                  style={mine ? { backgroundColor: color, color: "#fff" } : undefined}
                >
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  <p className={`mt-1 text-right text-[10px] ${mine ? "opacity-75" : "text-muted-foreground"}`}>{fmtTime(m.created_at)}</p>
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

      <footer className="border-t border-border bg-background p-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <form className="mx-auto flex max-w-2xl items-end gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={1}
            maxLength={4000}
            placeholder="Digite sua mensagem..."
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl border border-input bg-muted/50 px-4 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={!text.trim() || sending}
            aria-label="Enviar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white transition-opacity disabled:opacity-40"
            style={{ backgroundColor: color }}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      </footer>
    </div>
  );
}
