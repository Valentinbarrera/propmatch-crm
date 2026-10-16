import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Card } from "@/components/ui/Card";
import { clamp01, type IgFormat } from "./imageSpecs";
import {
  adjustmentsOf,
  contrastRatio,
  DEFAULT_EDITS,
  DEFAULT_TEXT,
  drawEdited,
  editCrop,
  FILTERS,
  isEdited,
  loadImage,
  plateColorFor,
  supportsCanvasFilter,
  TEXT_COLORS,
  TEXT_PRESETS,
  type PhotoEdits,
  type TextOverlay,
} from "./photoEdits";
import type { PostMedia } from "./postStore";

interface Props {
  media: PostMedia;
  src: string | undefined;
  format: IgFormat;
  stampName: string;
  safeMargin: number;
  onEdits: (e: PhotoEdits, group?: string) => void;
  onCopyAll: (mode: "adjust" | "all") => void;
  canCopy: boolean;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const PREVIEW_W = 560;

const btn = "px-3 min-h-11 md:min-h-9 rounded-lg border text-xs hover:bg-violet-50 disabled:opacity-40 disabled:cursor-not-allowed";
const btnStyle = { borderColor: "#E9E5DE", color: "#6B7280", fontWeight: 700, background: "white" } as const;

function Slider({ id, label, value, min, max, step = 1, onChange, unit = "" }: { id: string; label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; unit?: string }) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between text-xs">
        <label htmlFor={id} style={{ color: "#1A1A1A", fontWeight: 600 }}>{label}</label>
        <output htmlFor={id} style={{ color: "#4B5563" }}>{Number.isInteger(step) ? value : value.toFixed(1).replace(".", ",")}{unit}</output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full min-h-11 md:min-h-8 cursor-pointer"
        style={{ accentColor: "#9B21FF" }}
      />
    </div>
  );
}

export function PhotoEditorPanel({ media, src, format, stampName, safeMargin, onEdits, onCopyAll, canCopy, undo, redo, canUndo, canRedo }: Props) {
  const e = media.edits;
  const canvas = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<{ src: string; img: HTMLImageElement } | null>(null);
  const [error, setError] = useState("");
  const drag = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null);
  const filterOk = supportsCanvasFilter();

  const h = Math.round(PREVIEW_W / format.ratio);
  const key = JSON.stringify(e) + stampName + safeMargin + format.id;

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!src) return;
      try {
        if (imgRef.current?.src !== src) imgRef.current = { src, img: await loadImage(src) };
        if (!alive || !canvas.current) return;
        const { img } = imgRef.current;
        drawEdited(canvas.current.getContext("2d")!, img, img.naturalWidth, img.naturalHeight, e, PREVIEW_W, h, { stampText: stampName, safeMargin });
        setError("");
      } catch {
        if (alive) setError("No se pudo abrir la foto para editarla.");
      }
    })();
    return () => {
      alive = false;
    };
    // `key` resume todo lo que cambia el dibujo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, key, h]);

  const set = (part: Partial<PhotoEdits>, group = "") => onEdits({ ...e, ...part }, group);
  const setText = (part: Partial<TextOverlay>, group = "text") => onEdits({ ...e, text: { ...(e.text ?? DEFAULT_TEXT), ...part } }, group);

  const natW = media.width;
  const natH = media.height;
  const overflow = () => {
    const c = editCrop(natW, natH, e, PREVIEW_W / h);
    const swap = e.rotate === 90 || e.rotate === 270;
    const rw = swap ? natH : natW;
    const rh = swap ? natW : natH;
    return { c, rw, rh };
  };
  const onDown = (ev: PointerEvent) => {
    ev.currentTarget.setPointerCapture(ev.pointerId);
    drag.current = { x: ev.clientX, y: ev.clientY, fx: e.focal.x, fy: e.focal.y };
  };
  const onMove = (ev: PointerEvent) => {
    const d = drag.current;
    if (!d || !canvas.current) return;
    const { c, rw, rh } = overflow();
    const box = canvas.current.getBoundingClientRect();
    const dxSrc = ((ev.clientX - d.x) / box.width) * c.sw;
    const dySrc = ((ev.clientY - d.y) / box.height) * c.sh;
    set({ focal: { x: rw - c.sw > 0 ? clamp01(d.fx - dxSrc / (rw - c.sw)) : d.fx, y: rh - c.sh > 0 ? clamp01(d.fy - dySrc / (rh - c.sh)) : d.fy } }, "focal");
  };
  const onKey = (ev: KeyboardEvent) => {
    const step = 0.05;
    const f = e.focal;
    const n: Record<string, { x: number; y: number } | undefined> = {
      ArrowLeft: { x: clamp01(f.x - step), y: f.y },
      ArrowRight: { x: clamp01(f.x + step), y: f.y },
      ArrowUp: { x: f.x, y: clamp01(f.y - step) },
      ArrowDown: { x: f.x, y: clamp01(f.y + step) },
    };
    const v = n[ev.key];
    if (v) {
      ev.preventDefault();
      set({ focal: v }, "focal");
    }
  };
  const onPanelKey = (ev: KeyboardEvent) => {
    if (!(ev.ctrlKey || ev.metaKey) || (ev.target as HTMLElement).tagName === "TEXTAREA") return;
    if (ev.target instanceof HTMLInputElement && ev.target.type === "text") return;
    const k = ev.key.toLowerCase();
    if (k === "z" && !ev.shiftKey) { ev.preventDefault(); undo(); }
    else if (k === "y" || (k === "z" && ev.shiftKey)) { ev.preventDefault(); redo(); }
  };

  const t = e.text;
  const plate = t ? plateColorFor(t.color) : "#111111";
  const ratio = t ? contrastRatio(t.color, plate) : 0;

  return (
    <Card>
      <div onKeyDown={onPanelKey}>
        <div className="px-5 py-4 border-b flex flex-wrap items-center gap-2" style={{ borderColor: "#F0EDE6" }}>
          <div className="flex-1 min-w-0">
            <h3 className="text-base" style={{ color: "#1A1A1A", fontWeight: 700 }}>Editar foto</h3>
            <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>El original no se toca: las ediciones se aplican al descargar.</p>
          </div>
          <button type="button" className={btn} style={btnStyle} onClick={undo} disabled={!canUndo} aria-keyshortcuts="Control+Z">Deshacer</button>
          <button type="button" className={btn} style={btnStyle} onClick={redo} disabled={!canRedo} aria-keyshortcuts="Control+Y">Rehacer</button>
          <button type="button" className={btn} style={btnStyle} onClick={() => onEdits({ ...DEFAULT_EDITS })} disabled={!isEdited(e)}>Restablecer foto</button>
        </div>

        <div className="p-5 grid gap-5 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)] items-start">
          <div>
            <div
              tabIndex={0}
              role="group"
              aria-label="Vista previa en vivo. Arrastrá la imagen o usá las flechas del teclado para mover el encuadre."
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
              onKeyDown={onKey}
              className="rounded-xl overflow-hidden border touch-none cursor-grab active:cursor-grabbing mx-auto"
              style={{ borderColor: "#DDD8CF", background: "#F3F4F6", maxWidth: 260 }}
            >
              <canvas ref={canvas} width={PREVIEW_W} height={h} style={{ width: "100%", height: "auto", display: "block" }} aria-label="Foto con las ediciones aplicadas" />
            </div>
            {error && <p role="alert" className="text-xs mt-2" style={{ color: "#BE123C" }}>{error}</p>}
            <p className="text-[11px] mt-2 text-center" style={{ color: "#6B7280" }}>Formato {format.ratioLabel} · {format.width}×{format.height} px al exportar</p>
            {!filterOk && (
              <p role="status" className="text-xs mt-2 px-3 py-2 rounded-lg" style={{ background: "#FEF3C7", color: "#92400E" }}>
                Este navegador no aplica filtros ni ajustes de color en el lienzo (por ejemplo, Safari antiguo): se ven y se descargan sin ellos. Probá con Chrome, Edge o Firefox.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-5 min-w-0">
            <fieldset>
              <legend className="text-xs mb-1" style={{ color: "#6B7280", fontWeight: 700 }}>Encuadre</legend>
              <Slider id="ed-zoom" label="Zoom" value={e.zoom} min={1} max={3} step={0.1} unit="×" onChange={(v) => set({ zoom: v }, "zoom")} />
              <div className="flex flex-wrap gap-2 mt-1">
                <button type="button" className={btn} style={btnStyle} onClick={() => set({ rotate: ((e.rotate + 270) % 360) as PhotoEdits["rotate"] })}>Girar a la izquierda</button>
                <button type="button" className={btn} style={btnStyle} onClick={() => set({ rotate: ((e.rotate + 90) % 360) as PhotoEdits["rotate"] })}>Girar a la derecha</button>
                <button type="button" className={btn} style={btnStyle} aria-pressed={e.flipH} onClick={() => set({ flipH: !e.flipH })}>Espejar</button>
                <button type="button" className={btn} style={btnStyle} onClick={() => set({ focal: { x: 0.5, y: 0.5 } })}>Centrar</button>
              </div>
              <p className="text-[11px] mt-1" style={{ color: "#6B7280" }}>Arrastrá la foto (o usá las flechas) para elegir qué parte queda.</p>
            </fieldset>

            <fieldset>
              <legend className="text-xs mb-1" style={{ color: "#6B7280", fontWeight: 700 }}>Filtros</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Filtro">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    role="radio"
                    aria-checked={e.filter === f.id}
                    title={f.hint}
                    onClick={() => set({ filter: f.id })}
                    className="px-3 min-h-11 md:min-h-9 rounded-xl border text-xs"
                    style={{ borderColor: e.filter === f.id ? "#9B21FF" : "#E9E5DE", background: e.filter === f.id ? "#F7F0FF" : "white", color: "#1A1A1A", fontWeight: 600 }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-xs mb-1" style={{ color: "#6B7280", fontWeight: 700 }}>Ajustes</legend>
              <Slider id="ed-bri" label="Brillo" value={e.brightness} min={-100} max={100} onChange={(v) => set({ brightness: v }, "brightness")} />
              <Slider id="ed-con" label="Contraste" value={e.contrast} min={-100} max={100} onChange={(v) => set({ contrast: v }, "contrast")} />
              <Slider id="ed-sat" label="Saturación" value={e.saturation} min={-100} max={100} onChange={(v) => set({ saturation: v }, "saturation")} />
              <Slider id="ed-war" label="Calidez (frío a cálido)" value={e.warmth} min={-100} max={100} onChange={(v) => set({ warmth: v }, "warmth")} />
              <Slider id="ed-vig" label="Viñeta" value={e.vignette} min={0} max={100} onChange={(v) => set({ vignette: v }, "vignette")} />
            </fieldset>

            <fieldset>
              <legend className="text-xs mb-1" style={{ color: "#6B7280", fontWeight: 700 }}>Texto sobre la foto</legend>
              <label htmlFor="ed-text" className="text-xs" style={{ color: "#1A1A1A", fontWeight: 600 }}>Texto (título, precio o etiqueta)</label>
              <input
                id="ed-text"
                type="text"
                value={t?.text ?? ""}
                maxLength={80}
                onChange={(ev) => setText({ text: ev.target.value })}
                placeholder="Ej.: ¡Nuevo! USD 185.000"
                className="mt-1 w-full rounded-lg border px-3 min-h-11 text-sm"
                style={{ borderColor: "#E9E5DE", color: "#1A1A1A" }}
              />
              <div className="flex flex-wrap gap-2 mt-2" role="group" aria-label="Etiquetas rápidas">
                {TEXT_PRESETS.map((p) => (
                  <button key={p} type="button" className={btn} style={btnStyle} onClick={() => setText({ text: p }, "")}>{p}</button>
                ))}
              </div>
              {t?.text.trim() && (
                <div className="mt-3 flex flex-col gap-3">
                  <Slider id="ed-tsize" label="Tamaño" value={t.size} min={3} max={14} onChange={(v) => setText({ size: v }, "tsize")} />
                  <div role="radiogroup" aria-label="Color del texto" className="flex flex-wrap gap-2">
                    {TEXT_COLORS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        role="radio"
                        aria-checked={t.color === c.value}
                        onClick={() => setText({ color: c.value }, "")}
                        className="px-3 min-h-11 md:min-h-9 rounded-xl border text-xs flex items-center gap-2"
                        style={{ borderColor: t.color === c.value ? "#9B21FF" : "#E9E5DE", background: "white", color: "#1A1A1A", fontWeight: 600 }}
                      >
                        <span aria-hidden="true" className="w-4 h-4 rounded-full border" style={{ background: c.value, borderColor: "#9CA3AF" }} />
                        {c.label}
                      </button>
                    ))}
                  </div>
                  <div role="radiogroup" aria-label="Posición del texto" className="flex flex-wrap gap-2">
                    {(["top", "center", "bottom"] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        role="radio"
                        aria-checked={t.pos === p}
                        onClick={() => setText({ pos: p }, "")}
                        className="px-3 min-h-11 md:min-h-9 rounded-xl border text-xs"
                        style={{ borderColor: t.pos === p ? "#9B21FF" : "#E9E5DE", background: t.pos === p ? "#F7F0FF" : "white", color: "#1A1A1A", fontWeight: 600 }}
                      >
                        {p === "top" ? "Arriba" : p === "center" ? "Centro" : "Abajo"}
                      </button>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 text-sm min-h-11 cursor-pointer" style={{ color: "#1A1A1A" }}>
                    <input type="checkbox" className="w-5 h-5" style={{ accentColor: "#9B21FF" }} checked={t.plate === "auto"} onChange={(ev) => setText({ plate: ev.target.checked ? "auto" : "none" }, "")} />
                    Fondo automático para que se lea
                  </label>
                  <p className="text-xs" style={{ color: t.plate === "auto" ? "#15803D" : "#92400E" }} role="status">
                    {t.plate === "auto"
                      ? `Contraste del texto sobre el fondo: ${ratio.toFixed(1).replace(".", ",")}:1 (mínimo recomendado 4,5:1).`
                      : "Sin fondo, el texto puede perderse sobre fotos claras u ocupadas. Revisá la vista previa."}
                  </p>
                </div>
              )}
            </fieldset>

            <label className="flex items-start gap-2 text-sm min-h-11 cursor-pointer" style={{ color: "#1A1A1A" }}>
              <input type="checkbox" className="w-5 h-5 mt-0.5" style={{ accentColor: "#9B21FF" }} checked={e.stamp} disabled={!stampName.trim()} onChange={(ev) => set({ stamp: ev.target.checked })} />
              <span>
                Sello con el nombre de la inmobiliaria{stampName.trim() ? ` («${stampName}»)` : ""}
                {!stampName.trim() && <span className="block text-xs" style={{ color: "#6B7280" }}>Cargá el nombre de la agencia en Configuración para usarlo.</span>}
              </span>
            </label>

            {canCopy && (
              <div className="flex flex-wrap gap-2 border-t pt-4" style={{ borderColor: "#F0EDE6" }}>
                <button type="button" className={btn} style={btnStyle} onClick={() => onCopyAll("adjust")}>Copiar filtro y ajustes a todas</button>
                <button type="button" className={btn} style={btnStyle} onClick={() => onCopyAll("all")}>Copiar también el texto</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Aplica a todas las imágenes los ajustes de `from` (sin tocar encuadre; el texto solo si `withText`). */
export function copyEdits(from: PhotoEdits, to: PhotoEdits, withText: boolean): PhotoEdits {
  return { ...to, ...adjustmentsOf(from), ...(withText ? { text: from.text } : {}) };
}
