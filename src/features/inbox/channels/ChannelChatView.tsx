import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { fetchMediaUrl, type ChannelConversation, type ChannelMessage } from "@/lib/inbox/api";
import { cleanIncoming, closedHint, windowInfo } from "@/lib/inbox/window";
import { Avatar } from "../ConversationList";
import { displayName, SOURCE_META, SourceIcon } from "./channelMeta";
import { TemplatePicker } from "./TemplatePicker";
import { useChannelMessages } from "./useChannelMessages";
import { useStore } from "@/data/store";
import { InboxAssist } from "@/features/proppi/InboxAssist";
import { toAssistConversation, toAssistMessages } from "./proppiAdapter";
import { InboxNoContactNotice } from "@/features/marketing/InboxNoContactNotice";

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Hoy";
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
}

/** Tildes de entrega: SOLO lo que informó el webhook de Meta. */
function DeliveryMark({ m }: { m: ChannelMessage }) {
  if (m.direction !== "out") return null;
  const base = "text-[11px] ml-1";
  if (m.status === "failed")
    return (
      <span className={base} style={{ color: "#FECACA", fontWeight: 700 }} title={m.error_title ?? "No se entregó"}>
        ⚠ No enviado
      </span>
    );
  if (m.status === "read")
    return (
      <span className={base} style={{ color: "#A5F3FC", fontWeight: 700 }} title="Leído" aria-label="Leído">
        ✓✓
      </span>
    );
  if (m.status === "delivered")
    return (
      <span className={base} title="Entregado" aria-label="Entregado">
        ✓✓
      </span>
    );
  if (m.status === "sent")
    return (
      <span className={base} title="Enviado" aria-label="Enviado">
        ✓
      </span>
    );
  if (m.accepted)
    return (
      <span className={base} title="Meta lo recibió; esperando confirmación de envío" aria-label="Esperando confirmación">
        ⏱
      </span>
    );
  return (
    <span className={base} title="Enviando" aria-label="Enviando">
      …
    </span>
  );
}

function Attachment({ m }: { m: ChannelMessage }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => () => {
    if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
  }, [url]);
  if (!m.has_media) return null;
  const label = { image: "Ver foto", audio: "Escuchar audio", video: "Ver video", document: "Abrir documento", sticker: "Ver sticker" }[m.type] ?? "Ver adjunto";
  if (!url) {
    return (
      <button
        onClick={async () => {
          const u = await fetchMediaUrl(m.id);
          if (u) setUrl(u);
          else setFailed(true);
        }}
        className="text-xs underline underline-offset-2 min-h-[28px]"
        style={{ fontWeight: 700 }}
      >
        {failed ? "No se pudo abrir el adjunto" : label}
      </button>
    );
  }
  if (m.type === "image" || m.type === "sticker") return <img src={url} alt="Foto recibida" className="rounded-xl max-h-64 mt-1" />;
  if (m.type === "audio") return <audio controls src={url} className="mt-1 max-w-full" />;
  if (m.type === "video") return <video controls src={url} className="rounded-xl max-h-64 mt-1" />;
  return (
    <a href={url} download className="text-xs underline" style={{ fontWeight: 700 }}>
      Descargar documento
    </a>
  );
}

export function ChannelChatView({
  conversation,
  onBack,
  onProfile,
}: {
  conversation: ChannelConversation;
  onBack: () => void;
  onProfile: () => void;
}) {
  const { messages, loading, sending, error, send, markRead } = useChannelMessages(conversation.id);
  const [text, setText] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const scroller = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const { contacts } = useStore();
  const linked = conversation.crm_contact_id ? contacts.find((c) => c.id === conversation.crm_contact_id) : undefined;
  const assistConv = useMemo(() => toAssistConversation(conversation, linked), [conversation, linked]);
  const assistMsgs = useMemo(() => toAssistMessages(conversation, messages), [conversation, messages]);
  const name = displayName(conversation);
  const meta = SOURCE_META[conversation.channel];

  useEffect(() => setText(""), [conversation.id]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const lastId = messages[messages.length - 1]?.id;
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId, conversation.id]);

  useEffect(() => {
    if (conversation.unread_count > 0) void markRead();
  }, [conversation.unread_count, lastId, markRead]);

  const win = windowInfo(conversation.last_inbound_at, now);
  const isWa = conversation.channel === "whatsapp";

  async function submit() {
    const t = text.trim();
    if (!t || sending) return;
    if (await send({ text: t })) setText("");
  }

  let prevDay = "";
  const btn = "min-h-[44px] md:min-h-[36px] px-3.5 rounded-xl text-sm border transition-all hover:border-violet-300 flex items-center";

  return (
    <section className="flex flex-col min-h-0 h-full bg-white" aria-label={`Conversación con ${name} por ${meta.label}`}>
      <header className="flex items-center gap-3 px-3 md:px-4 py-3 border-b flex-shrink-0" style={{ borderColor: "#E9E5DE" }}>
        <button onClick={onBack} aria-label="Volver a la bandeja" className="md:hidden w-11 h-11 -ml-1 flex items-center justify-center rounded-xl" style={{ color: "#9B21FF" }}>
          <ChevronLeftIcon size={20} />
        </button>
        <Avatar name={name} size={40} />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm truncate" style={{ color: "#1A1A1A", fontWeight: 700 }}>
            {name}
          </h2>
          <p className="text-xs truncate flex items-center gap-1" style={{ color: "#6B7280" }}>
            <SourceIcon source={conversation.channel} size={12} />
            {meta.label}
            {conversation.contact_phone ? ` · ${conversation.contact_phone}` : ""}
            {conversation.contact_username ? ` · @${conversation.contact_username}` : ""}
          </p>
        </div>
        <button onClick={onProfile} className={`${btn} xl:hidden`} style={{ borderColor: "#E9E5DE", color: "#9B21FF", fontWeight: 600 }}>
          {conversation.crm_contact_id ? "Contacto" : "Vincular"}
        </button>
      </header>

      {conversation.channel !== "messenger" || !win.open ? (
        <div
          className="flex items-center gap-2 px-4 py-2 text-xs border-b flex-shrink-0"
          role="status"
          style={{
            borderColor: "#F0EDE6",
            background: win.open ? (win.closingSoon ? "#FFFBEB" : "#F0FDF4") : "#FEF2F2",
            color: win.open ? (win.closingSoon ? "#92400E" : "#166534") : "#991B1B",
            fontWeight: 600,
          }}
        >
          <span aria-hidden="true">{win.open ? "⏳" : "🔒"}</span>
          {win.label}
        </div>
      ) : null}

      <div ref={scroller} role="log" aria-live="polite" aria-label="Mensajes" className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-2" style={{ background: "#FAF8F5" }}>
        {loading ? (
          <p className="text-xs text-center" style={{ color: "#6B7280" }}>
            Cargando mensajes…
          </p>
        ) : messages.length === 0 ? (
          <p className="text-xs text-center py-8" style={{ color: "#6B7280" }}>
            Todavía no hay mensajes.
          </p>
        ) : (
          messages.map((m) => {
            const day = new Date(m.created_at).toDateString();
            const showDay = day !== prevDay;
            prevDay = day;
            const inbound = m.direction === "in";
            return (
              <div key={m.id}>
                {showDay && (
                  <div className="flex justify-center py-2">
                    <span className="text-[11px] px-3 py-1 rounded-full" style={{ background: "#F7F0FF", color: "#6B7280", fontWeight: 600 }}>
                      {dayLabel(m.created_at)}
                    </span>
                  </div>
                )}
                <div className={`flex ${inbound ? "justify-start" : "justify-end"}`}>
                  <div
                    className="max-w-[85%] md:max-w-[75%] rounded-2xl px-3.5 py-2"
                    style={{
                      background: inbound ? "#F0EDE6" : m.status === "failed" ? "#9F1239" : "#9B21FF",
                      color: inbound ? "#1A1A1A" : "white",
                      borderBottomLeftRadius: inbound ? 6 : undefined,
                      borderBottomRightRadius: inbound ? undefined : 6,
                    }}
                  >
                    {m.echo && (
                      <p className="text-[11px] mb-0.5" style={{ color: "rgba(255,255,255,0.9)", fontWeight: 700 }}>
                        {isWa ? "Desde WhatsApp Business (celular)" : "Desde la app de Meta"}
                      </p>
                    )}
                    {m.type === "template" && (
                      <p className="text-[11px] mb-0.5" style={{ color: "rgba(255,255,255,0.9)", fontWeight: 700 }}>
                        Plantilla {m.template_name}
                      </p>
                    )}
                    {m.body && <p className="text-sm whitespace-pre-wrap break-words">{cleanIncoming(m.body)}</p>}
                    {!m.body && !m.has_media && (
                      <p className="text-sm italic opacity-80">{m.type === "unsupported" ? "Mensaje no soportado por la API" : `(${m.type})`}</p>
                    )}
                    <Attachment m={m} />
                    <p className="text-[11px] mt-0.5 text-right" style={{ color: inbound ? "#6B7280" : "rgba(255,255,255,0.8)" }}>
                      {new Date(m.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                      <DeliveryMark m={m} />
                    </p>
                    {m.status === "failed" && m.error_title && (
                      <p className="text-[11px] mt-0.5" style={{ color: "#FECACA" }}>
                        {m.error_title}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t px-3 md:px-4 pt-2 pb-3 flex-shrink-0" style={{ borderColor: "#E9E5DE" }}>
        {error && (
          <p role="alert" className="text-xs mb-2" style={{ color: "#BE123C", fontWeight: 600 }}>
            {error}
          </p>
        )}
        <InboxNoContactNotice contactId={conversation.crm_contact_id} phone={conversation.contact_phone} />
        {win.open && (
          <InboxAssist
            conversation={assistConv}
            messages={assistMsgs}
            text={text}
            setText={setText}
            focusInput={() => area.current?.focus()}
          />
        )}
        {win.open ? (
          <div className="flex items-end gap-2">
            <textarea
              ref={area}
              value={text}
              rows={1}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void submit();
                }
              }}
              aria-label="Escribir un mensaje"
              placeholder={`Responder por ${meta.label}… (Shift+Enter para salto de línea)`}
              maxLength={isWa ? 4096 : conversation.channel === "messenger" ? 2000 : 1000}
              className="flex-1 px-3.5 py-2.5 rounded-xl text-sm border outline-none resize-none bg-white text-[#1A1A1A] placeholder:text-[#6B7280] border-[#E9E5DE] focus:border-[#9B21FF] min-h-[44px] max-h-32"
            />
            <button
              onClick={() => void submit()}
              disabled={sending || !text.trim()}
              className="min-h-[44px] px-5 rounded-xl text-sm text-white disabled:opacity-50"
              style={{ background: "var(--gradient-brand)", fontWeight: 600 }}
            >
              {sending ? "Enviando…" : "Enviar"}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs" style={{ color: "#6B7280" }}>
              {closedHint(conversation.channel)}
            </p>
            {isWa && (
              <TemplatePicker
                accountId={conversation.channel_account_id}
                sending={sending}
                onSend={(template) => void send({ template })}
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
}
