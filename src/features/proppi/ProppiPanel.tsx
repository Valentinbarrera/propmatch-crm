import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "@/data/store";
import { MicIcon } from "@/features/voz/icons";
import { vozNavState } from "@/features/voz/prefill";
import { VozModal } from "@/features/voz/VozModal";
import type { VozKind } from "../../../shared/voz";
import { runTurn, todayLine } from "@/lib/proppi/agent";
import type { ApiMessage } from "@/lib/proppi/client";
import { CloseIcon, CopyIcon, ProppiIcon } from "./ProppiIcon";
import { payloadOf, useProppiSettings } from "./settings";
import { useFocusTrap, useProppiAvailable, useToolData } from "./useProppi";

/**
 * Proppi: botón flotante + panel lateral de chat, montado en `AppLayout`.
 * La conversación (historial para la API + lo que se muestra) vive en
 * sessionStorage: sobrevive a navegar y a recargar, no a cerrar la pestaña.
 */

interface Item {
  id: string;
  role: "user" | "assistant" | "notice";
  text: string;
}

interface Chat {
  history: ApiMessage[];
  items: Item[];
}

const EMPTY: Chat = { history: [], items: [] };
const SUGGESTIONS = ["¿Qué leads no contesté?", "Resumime la semana", "¿Qué propiedades tienen el precio alto?"];
const chatKey = (agencyId: string) => `pm.proppi.chat.${agencyId}`;
/** "dictá una propiedad" / "dictar una búsqueda" abre la carga por voz en vez de preguntarle a Proppi. */
const DICTATE_RE = /^\s*dict(?:a|á|ar)\s+(?:una?\s+)?(?:(propiedad|ficha)|(b[uú]squeda|requerimiento))/i;
const newId = () => Math.random().toString(36).slice(2, 10);

function loadChat(key: string): Chat {
  try {
    const raw = sessionStorage.getItem(key);
    const v = raw ? (JSON.parse(raw) as Chat) : null;
    return v && Array.isArray(v.history) && Array.isArray(v.items) ? v : EMPTY;
  } catch {
    return EMPTY;
  }
}

function saveChat(key: string, chat: Chat) {
  try {
    sessionStorage.setItem(key, JSON.stringify(chat));
  } catch {
    /* sin storage: la conversación dura hasta recargar */
  }
}

export function ProppiPanel() {
  const { agency } = useStore();
  const available = useProppiAvailable();
  const { settings, consume, limitReached } = useProppiSettings(agency.id);
  const [open, setOpen] = useState(false);
  const [voz, setVoz] = useState<VozKind | null>(null);
  const navigate = useNavigate();

  if (!settings.enabled || !settings.panelEnabled) return null;

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir Proppi, el asistente"
          aria-haspopup="dialog"
          className="fixed z-40 right-4 lg:right-6 bottom-[calc(80px+env(safe-area-inset-bottom))] lg:bottom-6 flex items-center gap-2 h-14 pl-4 pr-5 rounded-full text-white transition-transform hover:scale-105 active:scale-95"
          style={{ background: "var(--gradient-brand)", boxShadow: "var(--shadow-cta)", fontWeight: 700 }}
        >
          <ProppiIcon size={24} color="white" />
          <span className="text-sm">Proppi</span>
        </button>
      )}
      {open && (
        <ProppiDrawer
          agencyId={agency.id}
          available={available}
          limitReached={limitReached}
          consume={consume}
          settingsPayload={payloadOf(settings)}
          onClose={() => setOpen(false)}
          onDictate={(k) => {
            setOpen(false);
            setVoz(k);
          }}
        />
      )}
      {voz && (
        <VozModal
          kind={voz}
          applyLabel={voz === "propiedad" ? "Abrir la ficha precargada" : "Abrir el contacto precargado"}
          onApply={(r) => navigate(r.kind === "propiedad" ? "/propiedades/nueva" : "/contactos", { state: vozNavState(r) })}
          onClose={() => setVoz(null)}
        />
      )}
    </>
  );
}

function ProppiDrawer({
  agencyId,
  available,
  limitReached,
  consume,
  settingsPayload,
  onClose,
  onDictate,
}: {
  agencyId: string;
  available: boolean;
  limitReached: boolean;
  consume: () => boolean;
  settingsPayload: ReturnType<typeof payloadOf>;
  onClose: () => void;
  onDictate: (kind: VozKind) => void;
}) {
  const key = chatKey(agencyId);
  const [chat, setChat] = useState<Chat>(() => loadChat(key));
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  /** Sube con "Nueva conversación": una respuesta en vuelo de la anterior se ignora. */
  const genRef = useRef(0);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const getData = useToolData();

  useFocusTrap(true, panel, onClose);
  useEffect(() => input.current?.focus(), []);
  useEffect(() => saveChat(key, chat), [key, chat]);
  useEffect(() => () => abortRef.current?.abort(), []);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.items.length, streaming]);

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      const dictate = DICTATE_RE.exec(q);
      if (dictate && !busy) {
        setDraft("");
        onDictate(dictate[1] ? "propiedad" : "busqueda");
        return;
      }
      if (!q || busy || !available) return;
      if (!consume()) {
        setChat((c) => ({
          ...c,
          items: [...c.items, { id: newId(), role: "notice", text: "Llegaste al tope de consultas de este mes. Podés cambiarlo en Configuración → Proppi." }],
        }));
        return;
      }
      setDraft("");
      setBusy(true);
      setStreaming("");
      const userItem: Item = { id: newId(), role: "user", text: q };
      setChat((c) => ({ ...c, items: [...c.items, userItem] }));
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const gen = genRef.current;

      const res = await runTurn({
        mode: "panel",
        history: chat.history,
        prompt: `${todayLine()}\n\n${q}`,
        settings: settingsPayload,
        getData,
        signal: ctrl.signal,
        onText: (t) => setStreaming((s) => (s ?? "") + t),
        onStatus: setStatus,
      });
      if (gen !== genRef.current) return;

      const extra: Item[] = [];
      if (res.status === "ok" || res.status === "truncated" || res.status === "limit") {
        if (res.text) extra.push({ id: newId(), role: "assistant", text: res.text });
        if (res.status === "truncated") extra.push({ id: newId(), role: "notice", text: "La respuesta quedó cortada." });
        if (res.errorText) extra.push({ id: newId(), role: "notice", text: res.errorText });
      } else {
        // El turno se descartó: el historial vuelve a como estaba.
        extra.push({ id: newId(), role: "notice", text: res.errorText ?? "No pude responder." });
      }
      setChat((c) => ({ history: res.history, items: [...c.items, ...extra] }));
      setStreaming(null);
      setBusy(false);
      abortRef.current = null;
      input.current?.focus();
    },
    [busy, available, consume, chat.history, settingsPayload, getData, onDictate],
  );

  function reset() {
    genRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setStreaming(null);
    setStatus(null);
    setChat(EMPTY);
    setDraft("");
    input.current?.focus();
  }

  const empty = chat.items.length === 0 && streaming === null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 hidden sm:block" style={{ background: "rgba(8, 11, 31,0.25)" }} onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="proppi-title"
        className="relative flex flex-col w-full sm:w-[420px] h-full bg-white"
        style={{ boxShadow: "var(--shadow-pop)", borderLeft: "1px solid #E9E5DE" }}
      >
        <header className="flex items-center gap-3 px-4 py-3 border-b flex-shrink-0" style={{ borderColor: "#E9E5DE", background: "#FAF8F5" }}>
          <span className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "var(--gradient-brand)" }}>
            <ProppiIcon size={20} color="white" />
          </span>
          <div className="flex-1 min-w-0">
            <h2 id="proppi-title" className="text-sm" style={{ color: "#1A1A1A", fontWeight: 800 }}>
              Proppi
            </h2>
            <p className="text-xs" style={{ color: "#6B7280" }}>
              Tu asistente del CRM · solo lectura
            </p>
          </div>
          {!empty && (
            <button
              onClick={reset}
              className="min-h-[36px] px-3 rounded-xl text-xs border hover:border-violet-300"
              style={{ borderColor: "#E9E5DE", color: "#7C0BD8", fontWeight: 600 }}
            >
              Nueva conversación
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Cerrar Proppi"
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-violet-50"
            style={{ color: "#7C0BD8" }}
          >
            <CloseIcon />
          </button>
        </header>

        <div
          ref={scroller}
          role="log"
          aria-live="polite"
          aria-busy={busy}
          aria-label="Conversación con Proppi"
          className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3"
        >
          {!available ? (
            <Unavailable />
          ) : empty ? (
            <div className="pt-6">
              <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                ¡Hola! Soy Proppi.
              </p>
              <p className="text-sm mt-1" style={{ color: "#374151" }}>
                Te ayudo a encontrar datos de tus contactos, propiedades, agenda y conversaciones, y a preparar borradores de mensajes.
              </p>
              <div className="mt-4 flex flex-col gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => ask(s)}
                    disabled={limitReached}
                    className="text-left min-h-[44px] px-3.5 py-2 rounded-xl text-sm border hover:border-violet-300 disabled:opacity-50"
                    style={{ borderColor: "#E9E5DE", color: "#7C0BD8", background: "#FAF8F5", fontWeight: 600 }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {chat.items.map((it) => (
                <Bubble key={it.id} item={it} />
              ))}
              {streaming !== null && streaming !== "" && <Bubble item={{ id: "live", role: "assistant", text: streaming }} live />}
            </>
          )}
        </div>

        <p role="status" className="px-4 text-xs min-h-[20px] flex-shrink-0" style={{ color: "#6B7280", fontWeight: 600 }}>
          {busy && (status ? `Proppi está ${status}…` : streaming ? "" : "Proppi está pensando…")}
        </p>

        <div className="px-3 pb-2 flex flex-wrap gap-2 flex-shrink-0" role="group" aria-label="Carga por voz">
          {(["propiedad", "busqueda"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onDictate(k)}
              className="flex items-center gap-1.5 min-h-[36px] px-3 rounded-xl text-xs border hover:border-violet-300"
              style={{ borderColor: "#E9E5DE", color: "#7C0BD8", background: "#FAF8F5", fontWeight: 600 }}
            >
              <MicIcon size={13} color="#7C0BD8" />
              {k === "propiedad" ? "Dictá una propiedad" : "Dictá una búsqueda"}
            </button>
          ))}
        </div>

        <form
          className="border-t px-3 pt-2 pb-3 flex-shrink-0"
          style={{ borderColor: "#E9E5DE" }}
          onSubmit={(e) => {
            e.preventDefault();
            ask(draft);
          }}
        >
          <div className="flex items-end gap-2">
            <textarea
              ref={input}
              value={draft}
              rows={2}
              disabled={!available || limitReached}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  ask(draft);
                }
              }}
              aria-label="Preguntale a Proppi"
              placeholder={limitReached ? "Llegaste al tope de consultas del mes" : "Preguntale algo a Proppi…"}
              className="flex-1 px-3.5 py-2.5 rounded-xl text-sm border outline-none resize-none bg-white text-[#1A1A1A] placeholder:text-[#6B7280] border-[#E9E5DE] focus:border-[#9B21FF] disabled:bg-[#FAF8F5]"
            />
            {busy ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="min-h-[44px] px-4 rounded-xl text-sm border"
                style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 600 }}
              >
                Detener
              </button>
            ) : (
              <button
                type="submit"
                disabled={!draft.trim() || !available || limitReached}
                className="min-h-[44px] px-4 rounded-xl text-sm text-white disabled:opacity-50"
                style={{ background: "var(--gradient-brand)", fontWeight: 600 }}
              >
                Enviar
              </button>
            )}
          </div>
          <p className="mt-2 text-[11px]" style={{ color: "#6B7280" }}>
            Lo que Proppi lee se envía a Anthropic para generar la respuesta. Revisá siempre los borradores antes de mandarlos.
          </p>
        </form>
      </div>
    </div>
  );
}

function Unavailable() {
  return (
    <div className="pt-8 text-center px-4">
      <span className="inline-flex w-12 h-12 rounded-full items-center justify-center" style={{ background: "#F7F0FF" }}>
        <ProppiIcon size={26} color="#9B21FF" />
      </span>
      <p className="mt-3 text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
        Disponible con tu cuenta
      </p>
      <p className="mt-1 text-sm" style={{ color: "#374151" }}>
        Proppi funciona con una cuenta de inmobiliaria conectada. En la demo no está activo.
      </p>
    </div>
  );
}

function Bubble({ item, live = false }: { item: Item; live?: boolean }) {
  const [copied, setCopied] = useState(false);
  if (item.role === "notice") {
    return (
      <p className="text-xs text-center px-3 py-2 rounded-xl" style={{ background: "#FFFBEB", color: "#B45309", fontWeight: 600 }}>
        {item.text}
      </p>
    );
  }
  const mine = item.role === "user";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[90%] rounded-2xl px-3.5 py-2.5"
        style={{
          background: mine ? "#9B21FF" : "#F7F0FF",
          color: mine ? "white" : "#1A1A1A",
          borderBottomRightRadius: mine ? 6 : undefined,
          borderBottomLeftRadius: mine ? undefined : 6,
        }}
      >
        <RichText text={item.text} />
        {!mine && !live && (
          <button
            onClick={() => {
              navigator.clipboard?.writeText(item.text).then(
                () => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                },
                () => undefined,
              );
            }}
            className="mt-1.5 inline-flex items-center gap-1 text-[11px] min-h-[28px] rounded-lg px-1.5 -ml-1.5 hover:bg-white"
            style={{ color: "#7C0BD8", fontWeight: 600 }}
          >
            <CopyIcon size={13} />
            {copied ? "Copiado" : "Copiar"}
          </button>
        )}
      </div>
    </div>
  );
}

/** Texto con saltos de línea y **negrita**. Nada de HTML crudo. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className="text-sm whitespace-pre-wrap break-words">
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") && p.length > 4 ? (
          <strong key={i} style={{ fontWeight: 700 }}>
            {p.slice(2, -2)}
          </strong>
        ) : (
          p
        ),
      )}
    </p>
  );
}
