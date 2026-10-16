import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeftIcon } from "@/components/ui/icons";
import type { Match, Profile } from "@/types/db";
import { CHANNEL_META, type Conversation } from "./conversations";
import { Avatar } from "./ConversationList";
import { useStore } from "@/data/store";
import { InboxNoContactNotice } from "@/features/marketing/InboxNoContactNotice";
import { isAutomaticMessage, summarizeHours } from "./automationEngine";
import { useAutomationState } from "./automationState";
import { buildTemplateContext, missingPropertyVars, renderTemplate } from "./templates";
import { useMatchChat } from "./useMatchChat";
import type { MessageRow } from "@/lib/leadSync";
import { InboxAssist } from "@/features/proppi/InboxAssist";

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Hoy";
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
}

export function ChatView({
  conversation,
  preview,
  currentUserId,
  responsible,
  crmMatch,
  onBack,
  onProfile,
  onSeen,
}: {
  conversation: Conversation;
  preview: MessageRow[];
  currentUserId: string | null;
  responsible: Profile | undefined;
  crmMatch: Match | undefined;
  onBack: () => void;
  onProfile: () => void;
  onSeen: (iso: string) => void;
}) {
  const navigate = useNavigate();
  const { agency, profileById } = useStore();
  const { config, log } = useAutomationState(agency.id);
  const tplEnv = {
    agencyName: agency.name,
    agentName: profileById(currentUserId)?.full_name ?? "",
    horario: config.hoursText.trim() || summarizeHours(config.hours),
  };
  const tplCtx = buildTemplateContext(conversation, tplEnv);
  const { messages, loading, sending, error, send } = useMatchChat(conversation.matchId, currentUserId, preview);
  const [text, setText] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  // Borrador por conversación: al cambiar de chat el input arranca vacío.
  useEffect(() => setText(""), [conversation.matchId]);

  const lastId = messages[messages.length - 1]?.id;
  const lastAt = messages[messages.length - 1]?.created_at;
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId, conversation.matchId]);

  useEffect(() => {
    if (lastAt) onSeen(lastAt);
  }, [lastAt, onSeen]);

  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [text]);

  async function submit() {
    if (!text.trim() || sending) return;
    const ok = await send(text);
    if (ok) setText("");
  }

  function insertSnippet(template: string) {
    const t = renderTemplate(template, tplCtx);
    if (!t) return;
    setText((prev) => (prev.trim() ? `${prev.trimEnd()}
${t}` : t));
    area.current?.focus();
  }

  const items: Array<{ kind: "day"; key: string; label: string } | { kind: "msg"; m: MessageRow }> = [];
  let prevDay = "";
  for (const m of messages) {
    const day = new Date(m.created_at).toDateString();
    if (day !== prevDay) {
      items.push({ kind: "day", key: `d-${m.id}`, label: dayLabel(m.created_at) });
      prevDay = day;
    }
    items.push({ kind: "msg", m });
  }

  const property = conversation.property;
  const btn =
    "min-h-[44px] md:min-h-[36px] px-3.5 rounded-xl text-sm border transition-all hover:border-violet-300 flex items-center";

  return (
    <section className="flex flex-col min-h-0 h-full bg-white" aria-label={`Conversación con ${conversation.name}`}>
      <header className="flex items-center gap-3 px-3 md:px-4 py-3 border-b flex-shrink-0" style={{ borderColor: "#E9E5DE" }}>
        <button
          onClick={onBack}
          aria-label="Volver a la bandeja"
          className="md:hidden w-11 h-11 -ml-1 flex items-center justify-center rounded-xl"
          style={{ color: "#9B21FF" }}
        >
          <ChevronLeftIcon size={20} />
        </button>
        <Avatar name={conversation.name} size={40} />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm truncate" style={{ color: "#1A1A1A", fontWeight: 700 }}>
            {conversation.name}
          </h2>
          <p className="text-xs truncate" style={{ color: "#6B7280" }}>
            {CHANNEL_META[conversation.channel].label}
            {responsible ? ` · Resp. por ${responsible.full_name}` : ""}
          </p>
        </div>
        <button onClick={onProfile} className={`${btn} xl:hidden`} style={{ borderColor: "#E9E5DE", color: "#9B21FF", fontWeight: 600 }}>
          Perfil
        </button>
        {conversation.contact && (
          <button
            onClick={() => navigate(`/contactos/${conversation.contact!.id}`)}
            className={`${btn} hidden sm:flex`}
            style={{ borderColor: "#E9E5DE", color: "#9B21FF", fontWeight: 600, background: "#FAF8F5" }}
          >
            Ver ficha
          </button>
        )}
      </header>

      {property && (
        <div
          className="flex items-center gap-2 px-4 py-2 text-xs border-b flex-shrink-0 flex-wrap"
          style={{ background: "#FAF8F5", borderColor: "#F0EDE6", color: "#56148F" }}
        >
          <span>
            Consulta sobre: <strong style={{ fontWeight: 700 }}>{property.title}</strong>
          </span>
          {crmMatch && (
            <button
              onClick={() => navigate(`/matches/${crmMatch.id}`)}
              className="underline underline-offset-2 min-h-[28px]"
              style={{ color: "#7C0BD8", fontWeight: 700 }}
            >
              Ver match ({Math.round(crmMatch.score)}%)
            </button>
          )}
        </div>
      )}

      <div
        ref={scroller}
        role="log"
        aria-live="polite"
        aria-label="Mensajes"
        className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-2"
        style={{ background: "#FAF8F5" }}
      >
        {loading ? (
          <p className="text-xs text-center" style={{ color: "#6B7280" }}>
            Cargando mensajes…
          </p>
        ) : items.length === 0 ? (
          <p className="text-xs text-center py-8" style={{ color: "#6B7280" }}>
            Todavía no hay mensajes. Escribí el primero o usá una respuesta rápida.
          </p>
        ) : (
          items.map((it) => {
            if (it.kind === "day") {
              return (
                <div key={it.key} className="flex justify-center py-2">
                  <span className="text-[11px] px-3 py-1 rounded-full" style={{ background: "#F7F0FF", color: "#6B7280", fontWeight: 600 }}>
                    {it.label}
                  </span>
                </div>
              );
            }
            const fromClient = it.m.sender_id === conversation.demandanteId;
            const auto = isAutomaticMessage(it.m, conversation.demandanteId, log);
            return (
              <div key={it.m.id} className={`flex ${fromClient ? "justify-start" : "justify-end"}`}>
                <div
                  className="max-w-[85%] md:max-w-[75%] rounded-2xl px-3.5 py-2"
                  style={{
                    background: fromClient ? "#F0EDE6" : "#9B21FF",
                    color: fromClient ? "#1A1A1A" : "white",
                    borderBottomLeftRadius: fromClient ? 6 : undefined,
                    borderBottomRightRadius: fromClient ? undefined : 6,
                  }}
                >
                  {auto && (
                    <p className="text-[11px] mb-0.5" style={{ color: "rgba(255,255,255,0.9)", fontWeight: 700 }}>
                      Automático
                    </p>
                  )}
                  <p className="text-sm whitespace-pre-wrap break-words">{it.m.content}</p>
                  <p className="text-[11px] mt-0.5 text-right" style={{ color: fromClient ? "#6B7280" : "rgba(255,255,255,0.8)" }}>
                    {new Date(it.m.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t px-3 md:px-4 pt-2 pb-3 flex-shrink-0" style={{ borderColor: "#E9E5DE" }}>
        <InboxAssist
          conversation={conversation}
          messages={messages}
          text={text}
          setText={setText}
          focusInput={() => area.current?.focus()}
        />
        <div className="flex gap-2 overflow-x-auto pb-2" role="group" aria-label="Respuestas rápidas">
          {config.snippets.map((s) => {
            const missing = missingPropertyVars(s.text, tplCtx);
            const unavailable = missing.length > 0;
            return (
              <button
                key={s.id}
                disabled={unavailable}
                title={unavailable ? "Falta un dato de la propiedad (dirección, título o precio)" : undefined}
                onClick={() => insertSnippet(s.text)}
                className="min-h-[44px] md:min-h-[32px] px-3 rounded-full text-xs whitespace-nowrap border disabled:opacity-50 hover:border-violet-300"
                style={{ borderColor: "#DDD8CF", color: "#7C0BD8", background: "#FAF8F5", fontWeight: 600 }}
              >
                {s.title}
              </button>
            );
          })}
        </div>
        <InboxNoContactNotice contactId={conversation.contact?.id} />
        {error && (
          <p role="alert" className="text-xs mb-2" style={{ color: "#BE123C", fontWeight: 600 }}>
            {error}
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={area}
            value={text}
            rows={1}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            aria-label="Escribir un mensaje"
            placeholder="Escribí un mensaje… (Shift+Enter para salto de línea)"
            className="flex-1 px-3.5 py-2.5 rounded-xl text-sm border outline-none resize-none bg-white text-[#1A1A1A] placeholder:text-[#6B7280] border-[#E9E5DE] focus:border-[#9B21FF] min-h-[44px]"
          />
          <button
            onClick={submit}
            disabled={sending || !text.trim()}
            className="min-h-[44px] px-5 rounded-xl text-sm text-white disabled:opacity-50"
            style={{ background: "var(--gradient-brand)", fontWeight: 600 }}
          >
            {sending ? "Enviando…" : "Enviar"}
          </button>
        </div>
      </div>
    </section>
  );
}
