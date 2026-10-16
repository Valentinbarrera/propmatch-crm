import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckIcon } from "@/components/ui/icons";
import { extractVoz, type VozExtraction } from "@/lib/voz/extract";
import { DICTATION_ERROR_TEXT, useAudioMemo, useDictation } from "@/lib/voz/speech";
import { MAX_DICTATION_CHARS, type VozData, type VozKind } from "../../../shared/voz";
import { summarize } from "./fields";
import { InfoIcon, MicIcon, StopIcon } from "./icons";
import { useVozProppi } from "./useVozProppi";

/**
 * Carga por voz: dictar (o escribir/pegar) → procesar → revisar → usar.
 *
 * Nunca guarda nada: "Usar" solo precarga el formulario y el agente revisa y
 * guarda como siempre.
 */

const COPY: Record<VozKind, { title: string; example: string; apply: string; placeholder: string }> = {
  propiedad: {
    title: "Dictá la propiedad",
    example:
      "«Departamento en venta en City Bell, 3 ambientes, 2 dormitorios, 1 baño, 70 metros cubiertos, con balcón y cochera, 95 mil dólares, expensas 40 mil, apto crédito.»",
    apply: "Usar en la ficha",
    placeholder: "Dictá o escribí los datos de la propiedad…",
  },
  busqueda: {
    title: "Dictá la búsqueda",
    example:
      "«Cliente Martín Rodríguez, busca comprar casa o PH en Gonnet o City Bell, mínimo 3 dormitorios, con jardín, entre 120 y 150 mil dólares, para marzo.»",
    apply: "Usar en la búsqueda",
    placeholder: "Dictá o escribí qué busca el cliente…",
  },
};

const GOOGLE_TIP =
  "El reconocimiento de voz lo hace tu navegador. En Chrome el audio pasa por los servicios de Google (en Edge, por los de Microsoft) para convertirlo en texto. A PropMatch solo llega el texto, y el audio no se guarda.";

type Step = "dictar" | "procesando" | "revisar";

export function VozModal({
  kind,
  onApply,
  onClose,
  applyLabel,
}: {
  kind: VozKind;
  onApply: (r: VozData) => void;
  onClose: () => void;
  applyLabel?: string;
}) {
  const copy = COPY[kind];
  const proppi = useVozProppi();
  const [step, setStep] = useState<Step>("dictar");
  const [text, setText] = useState("");
  const [extraction, setExtraction] = useState<VozExtraction | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const dictation = useDictation((chunk) =>
    setText((t) => {
      const sep = !t || /\s$/.test(t) ? "" : /[.,;:]$/.test(t) ? " " : ", ";
      return (t + sep + chunk).slice(0, MAX_DICTATION_CHARS);
    }),
  );
  const memo = useAudioMemo();

  // Escape cierra solo este diálogo (no el formulario de abajo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  function close() {
    dictation.stop();
    abortRef.current?.abort();
    onClose();
  }

  async function process() {
    dictation.stop();
    memo.stop();
    const t = text.trim();
    if (!t) return;
    setStep("procesando");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    // Cuenta como una consulta de Proppi solo si va por Proppi.
    const useProppi = proppi.active && proppi.consume();
    try {
      const res = await extractVoz({ kind, text: t, useProppi, signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      setExtraction(res);
      setStep("revisar");
    } catch {
      if (!ctrl.signal.aborted) setStep("dictar");
    }
  }

  const listening = dictation.status === "listening" || dictation.status === "starting";
  const summary = extraction ? summarize(extraction.result) : null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-6"
      style={{ background: "rgba(8, 11, 31,0.35)" }}
      onClick={(e) => {
        e.stopPropagation();
        close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="voz-title"
        className="w-full sm:max-w-xl max-h-[92vh] flex flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white"
        style={{ boxShadow: "var(--shadow-pop)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-4 border-b flex items-center gap-3 flex-shrink-0" style={{ borderColor: "#E9E5DE", background: "#FAF8F5" }}>
          <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "var(--gradient-brand)" }}>
            <MicIcon size={18} color="white" />
          </span>
          <div className="flex-1 min-w-0">
            <h2 id="voz-title" className="text-base tracking-tight" style={{ color: "#1A1A1A", fontWeight: 800 }}>
              {step === "revisar" ? "Revisá lo que entendí" : copy.title}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
              {step === "revisar"
                ? "Todavía no se guardó nada. Después lo podés corregir en el formulario."
                : proppi.active
                  ? "Proppi arma los campos a partir de lo que digas."
                  : (proppi.reason ?? "Se arma con reglas básicas.")}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Cerrar"
            className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-violet-50 flex-shrink-0"
            style={{ color: "#6B7280", fontSize: 20, lineHeight: 1 }}
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === "dictar" && (
            <div className="space-y-3">
              {dictation.supported ? (
                <div className="flex flex-wrap items-center gap-3">
                  {listening ? (
                    <button
                      type="button"
                      onClick={dictation.pause}
                      className="flex items-center gap-2 px-4 min-h-11 rounded-xl text-sm text-white"
                      style={{ background: "#DC2626", fontWeight: 700 }}
                    >
                      <StopIcon size={14} color="white" />
                      Detener
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={dictation.start}
                      autoFocus
                      className="flex items-center gap-2 px-4 min-h-11 rounded-xl text-sm text-white"
                      style={{ background: "var(--gradient-brand)", fontWeight: 700, boxShadow: "var(--shadow-cta)" }}
                    >
                      <MicIcon size={16} color="white" />
                      {dictation.status === "paused" ? "Seguir dictando" : "Empezar a dictar"}
                    </button>
                  )}
                  <span role="status" aria-live="polite" className="flex items-center gap-2 text-sm" style={{ fontWeight: 600 }}>
                    {listening ? (
                      <>
                        <span className="relative flex w-3 h-3" aria-hidden="true">
                          <span className="absolute inline-flex h-full w-full rounded-full animate-ping" style={{ background: "#F87171", opacity: 0.7 }} />
                          <span className="relative inline-flex w-3 h-3 rounded-full" style={{ background: "#DC2626" }} />
                        </span>
                        <span style={{ color: "#B91C1C" }}>{dictation.status === "starting" ? "Abriendo micrófono…" : "Grabando"}</span>
                      </>
                    ) : dictation.status === "paused" ? (
                      <span style={{ color: "#92400E" }}>Pausado</span>
                    ) : (
                      <span style={{ color: "#6B7280", fontWeight: 500 }}>Micrófono apagado</span>
                    )}
                  </span>
                  <span
                    className="ml-auto inline-flex items-center gap-1 text-xs cursor-help"
                    style={{ color: "#6B7280" }}
                    title={GOOGLE_TIP}
                    tabIndex={0}
                    aria-label={GOOGLE_TIP}
                  >
                    <InfoIcon size={14} color="#6B7280" />
                    ¿Adónde va el audio?
                  </span>
                </div>
              ) : (
                <div className="rounded-xl border px-3 py-2.5 text-sm" style={{ background: "#FFFBEB", borderColor: "#FDE68A", color: "#78350F" }}>
                  <strong>Este navegador no tiene dictado por voz.</strong> Escribí o pegá el texto abajo (por ejemplo, desde el dictado del
                  teclado del celular). El dictado funciona en Chrome, Edge y Safari.
                  {memo.supported && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={memo.recording ? memo.stop : memo.start}
                        className="flex items-center gap-1.5 px-3 min-h-10 rounded-lg text-xs border bg-white"
                        style={{ borderColor: "#FDE68A", color: "#92400E", fontWeight: 600 }}
                      >
                        {memo.recording ? <StopIcon size={12} color="#B91C1C" /> : <MicIcon size={13} color="#92400E" />}
                        {memo.recording ? "Detener grabación" : "Grabar audio para escucharlo"}
                      </button>
                      {memo.recording && <span style={{ color: "#B91C1C", fontWeight: 600 }}>● Grabando</span>}
                      {memo.url && !memo.recording && <audio src={memo.url} controls className="h-9 max-w-full" />}
                      <span className="text-[11px]">El audio queda solo en este navegador: no se transcribe ni se sube.</span>
                    </div>
                  )}
                </div>
              )}

              {dictation.status === "idle" && dictation.supported && !text && (
                <p className="text-xs" style={{ color: "#6B7280" }}>
                  La primera vez el navegador te pide permiso para usar el micrófono: tocá «Permitir». Se usa solo mientras dictás.
                </p>
              )}
              {(dictation.error || memo.error) && (
                <p role="alert" className="text-sm rounded-xl px-3 py-2" style={{ background: "#FEF2F2", color: "#991B1B" }}>
                  {DICTATION_ERROR_TEXT[(dictation.error ?? memo.error)!]}
                </p>
              )}

              <label className="block">
                <span className="text-xs" style={{ color: "#374151", fontWeight: 700 }}>
                  Texto {dictation.supported ? "(podés corregirlo antes de procesar)" : ""}
                </span>
                <textarea
                  ref={textRef}
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, MAX_DICTATION_CHARS))}
                  rows={6}
                  autoFocus={!dictation.supported}
                  placeholder={copy.placeholder}
                  className="mt-1 w-full px-3.5 py-2.5 rounded-xl text-sm border outline-none resize-y bg-white text-[#1A1A1A] placeholder:text-[#6B7280] border-[#E9E5DE] focus:border-[#9B21FF]"
                />
              </label>
              {dictation.interim && (
                <p className="text-sm italic -mt-1" style={{ color: "#6B7280" }} aria-live="off">
                  …{dictation.interim}
                </p>
              )}
              <p className="text-xs" style={{ color: "#6B7280" }}>
                <span style={{ fontWeight: 700 }}>Ejemplo:</span> {copy.example}
              </p>
            </div>
          )}

          {step === "procesando" && (
            <div className="py-10 text-center" role="status" aria-live="polite">
              <span
                className="inline-block w-8 h-8 rounded-full border-4 animate-spin"
                style={{ borderColor: "#E9E5DE", borderTopColor: "#9B21FF" }}
                aria-hidden="true"
              />
              <p className="mt-3 text-sm" style={{ color: "#374151", fontWeight: 600 }}>
                {proppi.active ? "Proppi está armando los campos…" : "Armando los campos…"}
              </p>
            </div>
          )}

          {step === "revisar" && extraction && summary && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="text-xs px-2.5 py-1 rounded-full"
                  style={
                    extraction.source === "proppi"
                      ? { background: "#E9E5DE", color: "#7C0BD8", fontWeight: 700 }
                      : { background: "#F3F4F6", color: "#4B5563", fontWeight: 700 }
                  }
                >
                  {extraction.source === "proppi" ? "Armado por Proppi" : "Armado básico (sin IA)"}
                </span>
                <span className="text-xs" style={{ color: "#6B7280" }}>
                  {summary.detected.length} {summary.detected.length === 1 ? "dato detectado" : "datos detectados"}
                </span>
              </div>
              {extraction.warning && (
                <p role="alert" className="text-sm rounded-xl px-3 py-2" style={{ background: "#FFFBEB", color: "#78350F" }}>
                  {extraction.warning}
                </p>
              )}

              {summary.detected.length > 0 ? (
                <dl className="grid gap-2 sm:grid-cols-2">
                  {summary.detected.map((f) => (
                    <div key={f.label} className="rounded-xl px-3 py-2 border" style={{ background: "#F7F0FF", borderColor: "#DDD8CF" }}>
                      <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide" style={{ color: "#6B7280", fontWeight: 700 }}>
                        <CheckIcon size={10} color="#16A34A" />
                        {f.label}
                      </dt>
                      <dd className="text-sm mt-0.5" style={{ color: "#1A1A1A", fontWeight: 600 }}>
                        {f.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm rounded-xl px-3 py-2" style={{ background: "#FEF2F2", color: "#991B1B" }}>
                  No pude detectar ningún dato. Volvé al texto y probá con frases como las del ejemplo.
                </p>
              )}

              {(summary.title || summary.description) && (
                <div className="rounded-xl px-3 py-2 border" style={{ background: "#F7F0FF", borderColor: "#DDD8CF" }}>
                  {summary.title && (
                    <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                      {summary.title}
                    </p>
                  )}
                  {summary.description && (
                    <p className="text-sm mt-1 whitespace-pre-line" style={{ color: "#374151" }}>
                      {summary.description}
                    </p>
                  )}
                  <p className="text-[11px] mt-1.5" style={{ color: "#6B7280" }}>
                    Título y descripción sugeridos{extraction.source === "local" ? " (básicos: conviene mejorarlos)" : ""}.
                  </p>
                </div>
              )}

              {summary.missing.length > 0 && (
                <div>
                  <p className="text-xs" style={{ color: "#374151", fontWeight: 700 }}>
                    No detectado (queda como está en el formulario)
                  </p>
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {summary.missing.map((m) => (
                      <li key={m} className="text-xs px-2.5 py-1 rounded-full border border-dashed" style={{ borderColor: "#D1D5DB", color: "#6B7280" }}>
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {summary.notes.length > 0 && (
                <div className="rounded-xl px-3 py-2" style={{ background: "#FFFBEB" }}>
                  <p className="text-xs" style={{ color: "#78350F", fontWeight: 700 }}>
                    Dijiste esto y no tiene campo {kind === "busqueda" ? "(va a las notas del contacto)" : "(cargalo a mano si hace falta)"}
                  </p>
                  <ul className="mt-1 text-sm list-disc pl-5" style={{ color: "#78350F" }}>
                    {summary.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="px-5 py-3 border-t flex-shrink-0" style={{ borderColor: "#E9E5DE" }}>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {step === "dictar" && (
              <>
                <button type="button" onClick={close} className="px-4 min-h-11 rounded-xl text-sm hover:bg-violet-50" style={{ color: "#6B7280", fontWeight: 600 }}>
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={process}
                  disabled={!text.trim()}
                  className="px-4 min-h-11 rounded-xl text-sm text-white disabled:opacity-50"
                  style={{ background: "var(--gradient-brand)", fontWeight: 700 }}
                >
                  Armar {kind === "propiedad" ? "la ficha" : "la búsqueda"} →
                </button>
              </>
            )}
            {step === "procesando" && (
              <button
                type="button"
                onClick={() => {
                  abortRef.current?.abort();
                  setStep("dictar");
                }}
                className="px-4 min-h-11 rounded-xl text-sm border"
                style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 600 }}
              >
                Cancelar
              </button>
            )}
            {step === "revisar" && extraction && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setStep("dictar");
                    setTimeout(() => textRef.current?.focus(), 0);
                  }}
                  className="px-4 min-h-11 rounded-xl text-sm hover:bg-violet-50"
                  style={{ color: "#7C0BD8", fontWeight: 600 }}
                >
                  ← Corregir el texto
                </button>
                <button
                  type="button"
                  autoFocus
                  disabled={!summary?.detected.length}
                  onClick={() => {
                    onApply(extraction.result);
                    onClose();
                  }}
                  className="px-4 min-h-11 rounded-xl text-sm text-white disabled:opacity-50"
                  style={{ background: "var(--gradient-brand)", fontWeight: 700, boxShadow: "var(--shadow-cta)" }}
                >
                  {applyLabel ?? copy.apply}
                </button>
              </>
            )}
          </div>
          <p className="mt-2 text-[11px]" style={{ color: "#6B7280" }}>
            {proppi.active
              ? "El texto (no el audio) se envía a Anthropic para armar los campos, igual que lo que lee Proppi."
              : "El texto se procesa en este navegador: no se envía a ningún servicio de IA."}{" "}
            Nada se guarda hasta que toques Guardar en el formulario.
          </p>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
