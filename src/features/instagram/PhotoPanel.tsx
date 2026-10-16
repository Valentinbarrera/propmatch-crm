import { useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent } from "react";
import { Card, Badge } from "@/components/ui/Card";
import { CheckIcon, AlertTriangleIcon, PlusIcon } from "@/components/ui/icons";
import { checkPhoto, clamp01, IG_LIMITS, LEVEL_STYLE, worstLevel, type Focal, type IgFormat } from "./imageSpecs";
import type { ImageInfo } from "./useImageInfos";

export interface IgPhoto {
  id: string;
  url: string;
  source: "property" | "upload";
  /** Clave estable para el borrador (solo fotos de la propiedad). */
  key: string;
  included: boolean;
  focal: Focal;
  alt: string;
}

interface Props {
  photos: IgPhoto[];
  infos: Record<string, ImageInfo>;
  format: IgFormat;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChange: (photos: IgPhoto[]) => void;
  onUpload: (files: FileList) => void;
  notice: string;
}

const iconBtn = "w-11 h-11 md:w-9 md:h-9 rounded-lg border flex items-center justify-center text-base disabled:opacity-30 disabled:cursor-not-allowed hover:bg-violet-50";

function FocalEditor({ photo, info, format, onFocal }: { photo: IgPhoto; info: ImageInfo | undefined; format: IgFormat; onFocal: (f: Focal) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; f: Focal } | null>(null);

  const overflow = () => {
    const el = box.current;
    if (!el || info?.status !== "ready") return { ox: 0, oy: 0 };
    const scale = Math.max(el.clientWidth / info.width, el.clientHeight / info.height);
    return { ox: info.width * scale - el.clientWidth, oy: info.height * scale - el.clientHeight };
  };
  const onDown = (e: PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, f: photo.focal };
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const { ox, oy } = overflow();
    onFocal({
      x: ox > 0 ? clamp01(d.f.x - (e.clientX - d.x) / ox) : d.f.x,
      y: oy > 0 ? clamp01(d.f.y - (e.clientY - d.y) / oy) : d.f.y,
    });
  };
  const onKey = (e: KeyboardEvent) => {
    const step = 0.05;
    const f = photo.focal;
    const next: Partial<Record<string, Focal>> = {
      ArrowLeft: { x: clamp01(f.x - step), y: f.y },
      ArrowRight: { x: clamp01(f.x + step), y: f.y },
      ArrowUp: { x: f.x, y: clamp01(f.y - step) },
      ArrowDown: { x: f.x, y: clamp01(f.y + step) },
    };
    const n = next[e.key];
    if (n) {
      e.preventDefault();
      onFocal(n);
    }
  };

  return (
    <div
      ref={box}
      tabIndex={0}
      role="group"
      aria-label="Encuadre: arrastrá la imagen o usá las flechas del teclado para mover el recorte"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onKeyDown={onKey}
      className="relative overflow-hidden rounded-xl border cursor-grab active:cursor-grabbing touch-none"
      style={{ aspectRatio: String(format.ratio), maxHeight: 340, maxWidth: "100%", margin: "0 auto", borderColor: "#DDD8CF", background: "#F3F4F6" }}
    >
      <img
        src={photo.url}
        alt=""
        draggable={false}
        style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${photo.focal.x * 100}% ${photo.focal.y * 100}%`, pointerEvents: "none" }}
      />
    </div>
  );
}

export function PhotoPanel({ photos, infos, format, selectedId, onSelect, onChange, onUpload, notice }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const included = photos.filter((p) => p.included);
  const selected = photos.find((p) => p.id === selectedId) ?? null;

  const patch = (id: string, part: Partial<IgPhoto>) => onChange(photos.map((p) => (p.id === id ? { ...p, ...part } : p)));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= photos.length || from === to) return;
    const next = [...photos];
    next.splice(to, 0, next.splice(from, 1)[0]);
    onChange(next);
  };
  const toggle = (p: IgPhoto) => patch(p.id, { included: !p.included });

  const onDrop = (e: DragEvent, targetId: string) => {
    e.preventDefault();
    const from = photos.findIndex((p) => p.id === dragId);
    const to = photos.findIndex((p) => p.id === targetId);
    setDragId(null);
    setOverId(null);
    move(from, to);
  };

  const checks = selected && infos[selected.url]?.status === "ready"
    ? checkPhoto(infos[selected.url] as Extract<ImageInfo, { status: "ready" }>, format, selected.focal)
    : null;

  return (
    <Card>
      <div className="px-5 py-4 border-b flex flex-wrap items-center gap-3" style={{ borderColor: "#F0EDE6" }}>
        <div className="flex-1 min-w-0">
          <h3 className="text-base" style={{ color: "#1A1A1A", fontWeight: 700 }}>Fotos</h3>
          <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
            Tildá las que van, ordenalas y elegí el encuadre. La primera es la portada y define el recorte de todo el carrusel.
          </p>
        </div>
        <Badge bg={included.length > IG_LIMITS.carouselMax ? "#FFE4E6" : "#F7F0FF"} text={included.length > IG_LIMITS.carouselMax ? "#BE123C" : "#6B7280"} size="xs">
          {included.length}/{IG_LIMITS.carouselMax}
        </Badge>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="px-3 min-h-11 md:min-h-9 rounded-xl text-xs border flex items-center gap-1.5 hover:bg-violet-50"
          style={{ borderColor: "#E9E5DE", color: "#6B7280", fontWeight: 700 }}
        >
          <PlusIcon size={12} color="#6B7280" /> Subir fotos
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            if (e.target.files?.length) onUpload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <p role="status" aria-live="polite" className={notice ? "px-5 py-2 text-sm" : "sr-only"} style={{ background: notice ? "#FEF3C7" : undefined, color: "#92400E" }}>
        {notice}
      </p>
      <p className="px-5 pt-3 text-xs" style={{ color: "#6B7280" }}>
        Las fotos subidas desde tu equipo solo viven en esta pantalla: no se guardan en la propiedad ni en el borrador.
      </p>

      {photos.length === 0 ? (
        <p className="px-5 py-8 text-sm text-center" style={{ color: "#6B7280" }}>
          Esta propiedad todavía no tiene fotos. Subí algunas desde tu equipo para armar la publicación.
        </p>
      ) : (
        <ul className="p-3 flex flex-col gap-2">
          {photos.map((p, i) => {
            const info = infos[p.url];
            const level = info?.status === "ready" ? worstLevel(checkPhoto(info, format, p.focal)) : "unknown";
            const st = LEVEL_STYLE[level];
            const order = p.included ? included.indexOf(p) + 1 : 0;
            return (
              <li
                key={p.id}
                draggable
                onDragStart={() => setDragId(p.id)}
                onDragOver={(e) => { e.preventDefault(); setOverId(p.id); }}
                onDragLeave={() => setOverId((o) => (o === p.id ? null : o))}
                onDrop={(e) => onDrop(e, p.id)}
                onDragEnd={() => { setDragId(null); setOverId(null); }}
                className="rounded-xl border p-2 flex flex-wrap items-center gap-2"
                style={{
                  borderColor: selectedId === p.id ? "#9B21FF" : overId === p.id ? "#BF7FFF" : "#E9E5DE",
                  background: p.included ? "white" : "#FAF8F5",
                  opacity: dragId === p.id ? 0.5 : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={p.included}
                  onChange={() => toggle(p)}
                  aria-label={`Incluir la foto ${i + 1} en la publicación`}
                  className="w-5 h-5 mx-1 cursor-pointer"
                  style={{ accentColor: "#9B21FF" }}
                />
                <button
                  type="button"
                  onClick={() => onSelect(p.id)}
                  aria-label={`Editar encuadre de la foto ${i + 1}`}
                  aria-pressed={selectedId === p.id}
                  className="relative w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 cursor-grab"
                  style={{ background: "#F3F4F6" }}
                >
                  <img src={p.url} alt="" draggable={false} className="w-full h-full object-cover" />
                  {order > 0 && (
                    <span className="absolute left-0.5 top-0.5 px-1.5 rounded-full text-white text-[10px]" style={{ background: "rgba(8, 11, 31,.8)", fontWeight: 700 }}>
                      {order}
                    </span>
                  )}
                </button>
                <div className="min-w-0 flex-1" style={{ minWidth: 120 }}>
                  <p className="text-xs flex items-center gap-1.5" style={{ color: st.text, fontWeight: 700 }}>
                    <span aria-hidden="true" className="inline-block w-2 h-2 rounded-full" style={{ background: st.dot }} />
                    {info?.status === "loading" || !info ? "Analizando…" : info.status === "error" ? "No se pudo leer" : st.word}
                    {order === 1 && <Badge bg="#F7F0FF" text="#6B7280" size="xs">Portada</Badge>}
                    {p.source === "upload" && <Badge bg="#F3F4F6" text="#4B5563" size="xs">Subida</Badge>}
                  </p>
                  <input
                    type="text"
                    value={p.alt}
                    maxLength={200}
                    onChange={(e) => patch(p.id, { alt: e.target.value })}
                    placeholder="Texto alternativo (opcional)"
                    aria-label={`Texto alternativo de la foto ${i + 1}`}
                    className="mt-1 w-full text-xs rounded-lg border px-2 min-h-11 md:min-h-8"
                    style={{ borderColor: "#E9E5DE", color: "#1A1A1A" }}
                  />
                </div>
                <div className="flex items-center gap-1 ml-auto">
                  <button type="button" className={iconBtn} style={{ borderColor: "#E9E5DE", color: "#6B7280" }} disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`Subir la foto ${i + 1}`}>↑</button>
                  <button type="button" className={iconBtn} style={{ borderColor: "#E9E5DE", color: "#6B7280" }} disabled={i === photos.length - 1} onClick={() => move(i, i + 1)} aria-label={`Bajar la foto ${i + 1}`}>↓</button>
                  {p.included && order !== 1 && (
                    <button
                      type="button"
                      className="px-2 min-h-11 md:min-h-9 rounded-lg border text-xs hover:bg-violet-50"
                      style={{ borderColor: "#E9E5DE", color: "#6B7280", fontWeight: 700 }}
                      onClick={() => move(i, photos.indexOf(included[0]))}
                    >
                      Hacer portada
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {selected && (
        <div className="px-5 pb-5 pt-2 border-t" style={{ borderColor: "#F0EDE6" }}>
          <p className="text-sm mt-3 mb-2" style={{ color: "#1A1A1A", fontWeight: 700 }}>
            Encuadre ({format.ratioLabel}) · {format.width}×{format.height}
          </p>
          <FocalEditor photo={selected} info={infos[selected.url]} format={format} onFocal={(focal) => patch(selected.id, { focal })} />
          <div className="mt-2 flex justify-center">
            <button
              type="button"
              onClick={() => patch(selected.id, { focal: { x: 0.5, y: 0.5 } })}
              className="px-3 min-h-11 md:min-h-9 rounded-lg border text-xs hover:bg-violet-50"
              style={{ borderColor: "#E9E5DE", color: "#6B7280", fontWeight: 700 }}
            >
              Centrar
            </button>
          </div>
          {checks ? (
            <ul className="mt-3 flex flex-col gap-1.5">
              {checks.map((c) => {
                const s = LEVEL_STYLE[c.level];
                return (
                  <li key={c.id} className="flex items-start gap-2 text-xs">
                    <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: s.bg }} aria-hidden="true">
                      {c.level === "ok" ? <CheckIcon size={11} color={s.dot} /> : <AlertTriangleIcon size={11} color={s.dot} />}
                    </span>
                    <span style={{ color: "#1A1A1A" }}>
                      <strong>{c.label}:</strong> <span className="sr-only">{s.word}. </span>
                      <span style={{ color: s.text }}>{c.detail}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 text-xs" style={{ color: "#6B7280" }}>Leyendo la imagen para calcular los chequeos…</p>
          )}
        </div>
      )}
    </Card>
  );
}
