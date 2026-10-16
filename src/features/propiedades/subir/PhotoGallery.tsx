/**
 * Galería del alta: subir, ordenar (arrastrando o con ← →), girar, elegir
 * portada y borrar. La primera foto es la portada.
 *
 * Arrastrar usa la API nativa de HTML5 (sin librerías). Como arrastrar no es
 * accesible con teclado ni cómodo en el celular, cada foto tiene además
 * botones para moverla.
 */

import { useRef, useState } from "react";
import { compressImage, rotateImage } from "@/lib/images";
import { PHOTOS_MIN } from "@/lib/listingDiagnostics";
import { ChevronLeftIcon, ChevronRightIcon, StarIcon } from "@/components/ui/icons";

const MAX_PHOTO_MB = 10;
/** Cuántas se ven antes de colapsar en "+N fotos". */
const COLLAPSED_COUNT = 7;

const DRAG_TYPE = "application/x-propmatch-photo";

export function PhotoGallery({
  photos,
  onChange,
  onError,
  selectId,
}: {
  photos: string[];
  onChange: (next: string[] | ((prev: string[]) => string[])) => void;
  onError: (text: string) => void;
  /** id del botón "Seleccionar archivos" (lo usa "Completar" para llevar el foco). */
  selectId?: string;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragOverZone, setDragOverZone] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [announce, setAnnounce] = useState("");

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const accepted: string[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
        onError(`"${file.name}" supera los ${MAX_PHOTO_MB} MB.`);
        continue;
      }
      try {
        accepted.push(await compressImage(file));
      } catch {
        onError(`No pudimos leer "${file.name}".`);
      }
    }
    if (accepted.length) onChange((prev) => [...prev, ...accepted]);
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= photos.length || from === to) return;
    onChange((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    setAnnounce(`Foto movida a la posición ${to + 1} de ${photos.length}.`);
  }

  async function rotate(idx: number) {
    setBusy(idx);
    try {
      const rotated = await rotateImage(photos[idx]);
      onChange((prev) => prev.map((p, i) => (i === idx ? rotated : p)));
      setAnnounce(`Foto ${idx + 1} girada.`);
    } catch {
      onError("No pudimos girar esa foto.");
    } finally {
      setBusy(null);
    }
  }

  const hidden = photos.length - COLLAPSED_COUNT;
  const collapsed = !expanded && hidden > 1;
  const visible = collapsed ? photos.slice(0, COLLAPSED_COUNT) : photos;
  const missing = Math.max(0, PHOTOS_MIN - photos.length);

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragOverZone(true);
        }}
        onDragLeave={() => setDragOverZone(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragOverZone(false);
          void addFiles(e.dataTransfer.files);
        }}
        className="rounded-xl border-2 border-dashed p-6 flex flex-col items-center justify-center text-center transition-all"
        style={{
          borderColor: dragOverZone ? "#9B21FF" : "#DDD8CF",
          background: dragOverZone ? "#F7F0FF" : "#FAF8F5",
        }}
      >
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          hidden
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
          style={{ background: "var(--gradient-soft)", border: "1px solid #E9E5DE" }}
          aria-hidden="true"
        >
          <StarIcon size={20} color="#9B21FF" />
        </div>
        <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
          Arrastrá las fotos acá
        </p>
        <button
          id={selectId}
          type="button"
          onClick={() => fileInput.current?.click()}
          className="mt-2 px-4 min-h-11 rounded-xl text-sm border transition-all hover:bg-violet-50"
          style={{ borderColor: "#DDD8CF", color: "#9B21FF", fontWeight: 600, background: "white" }}
        >
          Seleccionar archivos
        </button>
        <p className="text-xs mt-2" style={{ color: "#6B7280" }}>
          JPG, PNG o WEBP · Máximo {MAX_PHOTO_MB} MB por foto · Se achican a 1280 px para que entren en el navegador
        </p>
      </div>

      <p className="text-xs" style={{ color: missing ? "#B45309" : "#15803D", fontWeight: 600 }}>
        {photos.length} {photos.length === 1 ? "foto" : "fotos"}
        {missing
          ? ` · faltan ${missing} para el mínimo de ${PHOTOS_MIN} que piden los portales`
          : " · dentro de lo recomendado"}
        {photos.length > 1 && " · Arrastrá para reordenar: la primera es la portada."}
      </p>

      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      {photos.length > 0 && (
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" aria-label="Fotos cargadas">
          {visible.map((url, idx) => (
            <li
              key={`${idx}-${url.slice(-24)}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_TYPE, String(idx));
                e.dataTransfer.effectAllowed = "move";
                setDragIndex(idx);
              }}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
                e.preventDefault();
                setOverIndex(idx);
              }}
              onDragLeave={() => setOverIndex((o) => (o === idx ? null : o))}
              onDrop={(e) => {
                if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
                e.preventDefault();
                const from = Number(e.dataTransfer.getData(DRAG_TYPE));
                if (!Number.isNaN(from)) move(from, idx);
                setOverIndex(null);
                setDragIndex(null);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              className="relative rounded-xl overflow-hidden group cursor-grab active:cursor-grabbing"
              style={{
                aspectRatio: "4/3",
                background: "#F7F0FF",
                outline: overIndex === idx && dragIndex !== idx ? "2px solid #9B21FF" : undefined,
                opacity: dragIndex === idx ? 0.5 : 1,
              }}
            >
              <img src={url} alt={`Foto ${idx + 1}${idx === 0 ? " (portada)" : ""}`} className="w-full h-full object-cover" draggable={false} />
              {idx === 0 && (
                <span
                  className="absolute top-2 left-2 text-xs px-2 py-0.5 rounded-full"
                  style={{ background: "var(--gradient-brand)", color: "white", fontWeight: 700, fontSize: 10 }}
                >
                  Portada
                </span>
              )}
              {busy === idx && (
                <span className="absolute inset-0 flex items-center justify-center text-xs" style={{ background: "rgba(255,255,255,0.7)", color: "#9B21FF", fontWeight: 700 }}>
                  Girando…
                </span>
              )}
              {/* Siempre visibles en pantallas táctiles; en escritorio al pasar o al enfocar. */}
              <div className="absolute inset-x-1.5 bottom-1.5 flex gap-1 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
                <TileButton label={`Mover foto ${idx + 1} a la izquierda`} disabled={idx === 0} onClick={() => move(idx, idx - 1)}>
                  <ChevronLeftIcon size={14} />
                </TileButton>
                <TileButton label={`Mover foto ${idx + 1} a la derecha`} disabled={idx === photos.length - 1} onClick={() => move(idx, idx + 1)}>
                  <ChevronRightIcon size={14} color="currentColor" />
                </TileButton>
                <TileButton label={`Girar foto ${idx + 1}`} disabled={busy !== null} onClick={() => void rotate(idx)}>
                  <span aria-hidden="true" style={{ fontSize: 14, lineHeight: 1 }}>↻</span>
                </TileButton>
                {idx !== 0 && (
                  <TileButton label={`Usar foto ${idx + 1} como portada`} onClick={() => move(idx, 0)}>
                    <StarIcon size={12} color="#9B21FF" />
                  </TileButton>
                )}
                <TileButton label={`Eliminar foto ${idx + 1}`} danger onClick={() => onChange((prev) => prev.filter((_, i) => i !== idx))}>
                  <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1 }}>×</span>
                </TileButton>
              </div>
            </li>
          ))}
          {collapsed && (
            <li>
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="w-full h-full rounded-xl flex flex-col items-center justify-center border transition-all hover:bg-violet-50"
                style={{ aspectRatio: "4/3", borderColor: "#DDD8CF", background: "#FAF8F5", color: "#9B21FF" }}
              >
                <span className="text-xl" style={{ fontWeight: 800 }}>+{hidden}</span>
                <span className="text-xs" style={{ fontWeight: 600 }}>fotos más</span>
              </button>
            </li>
          )}
        </ul>
      )}
      {expanded && hidden > 1 && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-xs min-h-11 px-3 rounded-lg hover:bg-violet-50"
          style={{ color: "#9B21FF", fontWeight: 600 }}
        >
          Mostrar menos fotos
        </button>
      )}
    </div>
  );
}

function TileButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex-1 min-h-11 rounded-lg flex items-center justify-center backdrop-blur-sm disabled:opacity-40"
      style={{ background: "rgba(255,255,255,0.92)", color: danger ? "#E11D48" : "#9B21FF", fontWeight: 700 }}
    >
      {children}
    </button>
  );
}
