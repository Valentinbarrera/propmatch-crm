import { useEffect, useRef, useState } from "react";
import { useStore } from "@/data/store";
import { runTurn, todayLine } from "@/lib/proppi/agent";
import type { MessageRow } from "@/lib/leadSync";
import type { Conversation } from "@/features/inbox/conversations";
import { ProppiIcon } from "./ProppiIcon";
import { RichText } from "./ProppiPanel";
import { payloadOf, useProppiSettings } from "./settings";
import { useProppiAvailable, useToolData } from "./useProppi";

/**
 * Proppi en el Inbox: "Sugerir respuesta" escribe un BORRADOR en el campo de
 * respuesta (el agente lo edita y lo manda con el botón de siempre; Proppi
 * nunca envía) y "Resumir conversación" muestra un resumen arriba del campo.
 * Cada pedido es una consulta suelta (sin historial) con effort bajo.
 */

const MAX_MESSAGES_IN_PROMPT = 25;

function transcript(conversation: Conversation, messages: MessageRow[]): string {
  const rows = messages.slice(-MAX_MESSAGES_IN_PROMPT).map((m) => {
    const who = m.sender_id === conversation.demandanteId ? "Cliente" : "Inmobiliaria";
    const when = new Date(m.created_at).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    return `[${when}] ${who}: ${(m.content ?? "").trim()}`;
  });
  return rows.join("\n") || "(todavía no hay mensajes)";
}

function contextBlock(conversation: Conversation, messages: MessageRow[]): string {
  const p = conversation.property;
  const prop = p
    ? `Propiedad consultada (id ${p.id}): ${p.title}. ${p.operation}, ${p.type}, ${p.zone ?? p.locality ?? "zona sin cargar"}. ` +
      `Precio: ${p.price != null ? `${p.currency} ${p.price}` : "sin precio cargado"}. ` +
      `${p.rooms ?? "?"} amb., ${p.bedrooms ?? "?"} dorm., ${p.surface_total ?? "?"} m². ` +
      `Expensas: ${p.expenses ?? "sin dato"}. Características: ${p.features.join(", ") || "sin dato"}.`
    : "La propiedad consultada no está en el inventario del CRM.";
  const c = conversation.contact ? `Contacto en el CRM: ${conversation.contact.full_name} (id ${conversation.contact.id}).` : "El interesado todavía no es un contacto del CRM.";
  return `Conversación del Inbox (match_id ${conversation.matchId}) con ${conversation.name}.\n${c}\n${prop}\n\n<conversacion>\n${transcript(conversation, messages)}\n</conversacion>`;
}

const DRAFT_TASK =
  "Redactá la próxima respuesta de la inmobiliaria para este cliente, en el tono configurado y con la firma si hay. Respondé lo que el cliente preguntó usando los datos de la propiedad y el conocimiento de la inmobiliaria; si falta un dato, no lo inventes: ofrecé averiguarlo o coordinar un llamado. Si necesitás más datos, podés usar las herramientas. Devolvé SOLO el texto del mensaje, sin comillas, títulos ni comentarios para el agente.";
const SUMMARY_TASK =
  "Resumí esta conversación para el agente en 3 a 5 viñetas cortas: qué busca el cliente, qué se le respondió, qué quedó pendiente y el próximo paso sugerido.";

export function InboxAssist({
  conversation,
  messages,
  text,
  setText,
  focusInput,
}: {
  conversation: Conversation;
  messages: MessageRow[];
  text: string;
  setText: (t: string) => void;
  focusInput: () => void;
}) {
  const { agency } = useStore();
  const available = useProppiAvailable();
  const { settings, consume, limitReached } = useProppiSettings(agency.id);
  const getData = useToolData();
  const [busy, setBusy] = useState<"draft" | "summary" | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Al cambiar de conversación se cancela y se limpia.
  useEffect(() => {
    abortRef.current?.abort();
    setSummary(null);
    setNotice(null);
    setBusy(null);
  }, [conversation.matchId]);
  useEffect(() => () => abortRef.current?.abort(), []);

  if (!settings.enabled || !settings.inboxEnabled) return null;

  async function run(kind: "draft" | "summary") {
    if (busy) return;
    if (!available) return setNotice("Proppi está disponible con tu cuenta de inmobiliaria.");
    if (!consume()) return setNotice("Llegaste al tope de consultas de Proppi de este mes.");
    setNotice(null);
    setBusy(kind);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const before = text;
    const prefix = before.trim() ? `${before.trimEnd()}\n\n` : "";
    let acc = "";
    if (kind === "summary") setSummary("");

    const res = await runTurn({
      mode: "inbox",
      history: [],
      prompt: `${todayLine()}\n\n${contextBlock(conversation, messages)}\n\n${kind === "draft" ? DRAFT_TASK : SUMMARY_TASK}`,
      settings: payloadOf(settings),
      getData,
      signal: ctrl.signal,
      onText: (t) => {
        acc += t;
        if (kind === "draft") setText(prefix + acc.trimStart());
        else setSummary(acc);
      },
      onStatus: setStatus,
    });
    if (ctrl.signal.aborted) return;
    abortRef.current = null;
    setBusy(null);
    if (res.status === "refusal" || res.status === "error") {
      if (kind === "draft") setText(before);
      else setSummary(null);
      setNotice(res.errorText ?? "No pude generar la respuesta.");
      return;
    }
    if (kind === "draft") {
      setText(prefix + res.text.trim());
      setNotice("Borrador de Proppi: revisalo y editalo antes de enviar.");
      focusInput();
    }
  }

  const chip =
    "min-h-[44px] md:min-h-[32px] px-3 rounded-full text-xs whitespace-nowrap border disabled:opacity-50 hover:border-violet-300 inline-flex items-center gap-1.5";

  return (
    <div className="mb-2">
      {summary !== null && (
        <div className="mb-2 rounded-xl px-3.5 py-2.5 border relative" style={{ borderColor: "#E9E5DE", background: "#FAF8F5" }}>
          <p className="text-[11px] mb-1" style={{ color: "#6B7280", fontWeight: 700 }}>
            Resumen de Proppi
          </p>
          <div aria-live="polite" aria-busy={busy === "summary"} style={{ color: "#1A1A1A" }}>
            <RichText text={summary || "…"} />
          </div>
          <button
            onClick={() => setSummary(null)}
            className="absolute top-1.5 right-2 text-xs min-h-[28px] px-2"
            style={{ color: "#7C0BD8", fontWeight: 600 }}
            aria-label="Cerrar resumen"
          >
            Cerrar
          </button>
        </div>
      )}
      <div className="flex gap-2 flex-wrap items-center" role="group" aria-label="Proppi">
        <button
          onClick={() => run("draft")}
          disabled={!!busy || limitReached}
          className={chip}
          style={{ borderColor: "#D4AAFF", color: "#7C0BD8", background: "white", fontWeight: 700 }}
        >
          <ProppiIcon size={15} color="#9B21FF" />
          {busy === "draft" ? "Escribiendo borrador…" : "Sugerir respuesta con Proppi"}
        </button>
        <button
          onClick={() => run("summary")}
          disabled={!!busy || limitReached || messages.length === 0}
          className={chip}
          style={{ borderColor: "#DDD8CF", color: "#7C0BD8", background: "#FAF8F5", fontWeight: 600 }}
        >
          {busy === "summary" ? "Resumiendo…" : "Resumir conversación"}
        </button>
        {busy && (
          <button
            onClick={() => {
              abortRef.current?.abort();
              setBusy(null);
            }}
            className="text-xs min-h-[32px] px-2 underline underline-offset-2"
            style={{ color: "#6B7280", fontWeight: 600 }}
          >
            Cancelar
          </button>
        )}
        <span role="status" className="text-xs" style={{ color: "#6B7280", fontWeight: 600 }}>
          {busy && status ? `Proppi está ${status}…` : notice ?? ""}
        </span>
      </div>
    </div>
  );
}
