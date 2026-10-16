import { useCallback, useEffect, useRef, useState } from "react";
import { Card, SectionHeader } from "@/components/ui/Card";
import { fetchMatchMessages, sendMatchMessage, type MessageRow } from "@/lib/leadSync";
import { relativeTime } from "@/lib/format";

/**
 * El mismo chat que ve el usuario en la app — mismo `match_id`, misma tabla
 * `messages`. No hay copia local: se lee y se escribe directo contra
 * Supabase, con polling simple en vez de Realtime (alcanza para esto).
 */
export function ChatPanel({
  matchId,
  propertyTitle,
  currentUserId,
}: {
  matchId: string;
  propertyTitle: string;
  currentUserId: string;
}) {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const rows = await fetchMatchMessages(matchId);
      setMessages(rows);
    } catch (err) {
      console.error("No se pudo cargar el chat", err);
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  async function handleSend() {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);
    const { error: sendError } = await sendMatchMessage(matchId, currentUserId, content);
    if (sendError) {
      setError(sendError);
    } else {
      setText("");
      await load();
    }
    setSending(false);
  }

  return (
    <Card>
      <SectionHeader inCard title="Chat" subtitle={propertyTitle} />
      <div className="p-4 flex flex-col gap-3" style={{ maxHeight: 340 }}>
        <div className="flex-1 overflow-y-auto space-y-2 pr-1" style={{ minHeight: 120, maxHeight: 220 }}>
          {loading ? (
            <p className="text-xs" style={{ color: "#6B7280" }}>
              Cargando...
            </p>
          ) : messages.length === 0 ? (
            <p className="text-xs" style={{ color: "#6B7280" }}>
              Todavía no hay mensajes en este match.
            </p>
          ) : (
            messages.map((m) => {
              const mine = m.sender_id === currentUserId;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className="max-w-[80%] rounded-xl px-3 py-2"
                    style={{
                      background: mine ? "var(--gradient-brand)" : "#F7F0FF",
                      color: mine ? "white" : "#1A1A1A",
                    }}
                  >
                    <p className="text-sm">{m.content}</p>
                    <p
                      className="text-xs mt-0.5"
                      style={{ color: mine ? "rgba(255,255,255,0.7)" : "#6B7280" }}
                    >
                      {relativeTime(m.created_at)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {error && (
          <p className="text-xs" style={{ color: "#E11D48" }}>
            {error}
          </p>
        )}

        <div className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
            placeholder="Escribir un mensaje..."
            className="flex-1 px-3.5 py-2.5 rounded-xl text-sm border outline-none bg-white text-[#1A1A1A] placeholder:text-[#6B7280] border-[#E9E5DE] focus:border-[#9B21FF] focus-visible:ring-2 focus-visible:ring-[#9B21FF]"
          />
          <button
            disabled={sending || !text.trim()}
            onClick={handleSend}
            className="px-4 py-2.5 rounded-xl text-sm text-white disabled:opacity-50"
            style={{ background: "var(--gradient-brand)", fontWeight: 600 }}
          >
            {sending ? "..." : "Enviar"}
          </button>
        </div>
      </div>
    </Card>
  );
}
