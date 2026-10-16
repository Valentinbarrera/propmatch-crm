import { useRef, useState, type DragEvent } from "react";
import { Card, Badge } from "@/components/ui/Card";
import { AlertTriangleIcon, CheckIcon, PlusIcon } from "@/components/ui/icons";
import { checkPhoto, checkVideo, LEVEL_STYLE, worstLevel, type CheckLevel, type IgFormat, type ImageFacts, type PostKindInfo } from "./imageSpecs";
import { mimeOf, probeFile, validateUpload } from "./mediaTools";
import { deleteMedia, putMedia } from "./mediaStore";
import { DEFAULT_EDITS } from "./photoEdits";
import { newPostId, type PostMedia } from "./postStore";

interface Props {
  kind: PostKindInfo;
  media: PostMedia[];
  urls: Record<string, string>;
  missing: string[];
  format: IgFormat;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMedia: (next: PostMedia[]) => void;
  /** `false` = IndexedDB no disponible; `null` = todavía se está comprobando. */
  storageOk: boolean | null;
}

/** Dimensiones efectivas del recorte para los chequeos (giro y zoom cuentan). */
export function factsFor(m: PostMedia): ImageFacts {
  const swap = m.edits.rotate === 90 || m.edits.rotate === 270;
  const z = Math.max(1, m.edits.zoom);
  return { width: (swap ? m.height : m.width) / z, height: (swap ? m.width : m.height) / z, bytes: m.source === "upload" ? m.bytes : null, mime: m.mime || null };
}

export function levelOf(m: PostMedia, kind: PostKindInfo, format: IgFormat): CheckLevel {
  if (m.kind === "video") return worstLevel(checkVideo({ width: m.width, height: m.height, durationSec: m.durationSec ?? 0, bytes: m.bytes }, kind.id === "story" ? "story" : "reel", m.mime));
  return worstLevel(checkPhoto(factsFor(m), format, m.edits.focal));
}

const iconBtn = "w-11 h-11 md:w-9 md:h-9 rounded-lg border flex items-center justify-center text-base disabled:opacity-30 disabled:cursor-not-allowed hover:bg-violet-50";

export function MediaStep({ kind, media, urls, missing, format, selectedId, onSelect, onMedia, storageOk }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);

  const single = kind.max === 1;
  const accept = [kind.accepts.includes("image") ? "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" : "", kind.accepts.includes("video") ? "video/mp4,video/quicktime,.mp4,.mov" : ""].filter(Boolean).join(",");
  const what = kind.accepts.length === 2 ? "fotos o un video" : kind.accepts[0] === "video" ? "un video" : single ? "una foto" : "fotos";

  const addFiles = async (files: File[]) => {
    if (!files.length || busy) return;
    setBusy(true);
    const msgs: string[] = [];
    let list = [...media];
    for (const file of files) {
      if (!single && list.length >= kind.max) {
        msgs.push(`Llegaste al máximo de ${kind.max}: «${file.name}» quedó afuera.`);
        continue;
      }
      const v = validateUpload(file, kind.accepts);
      if (!v.ok) {
        msgs.push(v.message);
        continue;
      }
      try {
        const probed = await probeFile(file, v.kind);
        const id = newPostId("m");
        if (!(await putMedia(id, file, file.name))) {
          msgs.push(`«${file.name}»: no pudimos guardarla en este navegador (almacenamiento bloqueado o sin espacio). Liberá espacio o borrá publicaciones viejas.`);
          continue;
        }
        const item: PostMedia = {
          id,
          kind: v.kind,
          source: "upload",
          name: file.name,
          mime: mimeOf(file),
          bytes: file.size,
          width: probed.width,
          height: probed.height,
          durationSec: probed.durationSec,
          alt: "",
          edits: { ...DEFAULT_EDITS },
        };
        if (single) {
          list.forEach((m) => void deleteMedia(m.id));
          list = [item];
          if (files.length > 1) msgs.push("Este tipo de publicación lleva un solo archivo: usamos el primero válido.");
          break;
        }
        list = [...list, item];
      } catch (err) {
        msgs.push(`«${file.name}»: ${err instanceof Error ? err.message : "no se pudo leer."}`);
      }
    }
    onMedia(list);
    if (list.length && !selectedId) onSelect(list[0].id);
    setMessages(msgs);
    setBusy(false);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void addFiles(Array.from(e.dataTransfer.files));
  };

  const patch = (id: string, part: Partial<PostMedia>) => onMedia(media.map((m) => (m.id === id ? { ...m, ...part } : m)));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= media.length || from === to) return;
    const next = [...media];
    next.splice(to, 0, next.splice(from, 1)[0]);
    onMedia(next);
  };
  const remove = (m: PostMedia) => {
    onMedia(media.filter((x) => x.id !== m.id));
    setMessages([]);
  };
  const dropOn = (e: DragEvent, targetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const from = media.findIndex((m) => m.id === dragId);
    const to = media.findIndex((m) => m.id === targetId);
    setDragId(null);
    move(from, to);
  };

  const videoItem = media.find((m) => m.kind === "video");

  return (
    <Card>
      <div className="px-5 py-4 border-b flex flex-wrap items-center gap-3" style={{ borderColor: "#F0EDE6" }}>
        <div className="flex-1 min-w-0">
          <h3 className="text-base" style={{ color: "#1A1A1A", fontWeight: 700 }}>Medios</h3>
          <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>{kind.limits}</p>
        </div>
        <Badge bg="#F7F0FF" text="#6B7280" size="xs">{media.length}/{kind.max}</Badge>
      </div>

      <div className="p-5 flex flex-col gap-4">
        {storageOk === false && (
          <p role="alert" className="text-sm px-4 py-3 rounded-xl" style={{ background: "#FFF1F2", color: "#BE123C" }}>
            Este navegador no deja guardar archivos (IndexedDB no está disponible, por ejemplo en una ventana privada). Podés armar la publicación, pero las fotos y videos que subas no se van a conservar.
          </p>
        )}

        <div
          role="button"
          tabIndex={0}
          aria-label={`Subir ${what}: arrastrá archivos acá o presioná Enter para elegirlos`}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), fileRef.current?.click())}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          className="rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer min-h-[120px] flex flex-col items-center justify-center gap-1.5"
          style={{ borderColor: over ? "#9B21FF" : "#D4AAFF", background: over ? "#F7F0FF" : "#FAF8F5" }}
        >
          <span className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "var(--gradient-soft)" }} aria-hidden="true"><PlusIcon size={18} color="#9B21FF" /></span>
          <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>{busy ? "Procesando archivos…" : `Arrastrá ${what} o tocá para elegir`}</p>
          <p className="text-xs" style={{ color: "#6B7280" }}>
            {kind.accepts.includes("image") && "Fotos JPEG, PNG o WebP. "}
            {kind.accepts.includes("video") && "Videos MP4 o MOV. "}
            Quedan guardados en este navegador.
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={accept}
          multiple={!single}
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            void addFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />

        <div role="status" aria-live="polite" className={messages.length ? "flex flex-col gap-1" : "sr-only"}>
          {messages.map((m) => (
            <p key={m} className="text-sm px-3 py-2 rounded-lg" style={{ background: "#FEF3C7", color: "#92400E" }}>{m}</p>
          ))}
        </div>

        {missing.length > 0 && (
          <p role="alert" className="text-sm px-4 py-3 rounded-xl" style={{ background: "#FFF1F2", color: "#BE123C" }}>
            {missing.length === 1 ? "Un archivo de esta publicación ya no está" : `${missing.length} archivos de esta publicación ya no están`} en este navegador (se borraron los datos del sitio o se abrió en otro equipo). Quitalos y subilos de nuevo.
          </p>
        )}

        {kind.id === "reel" && (
          <p className="text-xs px-3 py-2 rounded-lg" style={{ background: "#F7F0FF", color: "#7C0BD8" }}>
            Subí el video ya editado, en 9:16. Acá no recortamos ni comprimimos video: se publica tal cual lo subís.
          </p>
        )}

        {media.length > 0 && (
          <ul className="flex flex-col gap-2">
            {media.map((m, i) => {
              const lv = levelOf(m, kind, format);
              const st = LEVEL_STYLE[lv];
              const url = urls[m.id];
              return (
                <li
                  key={m.id}
                  draggable={media.length > 1}
                  onDragStart={() => setDragId(m.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => dropOn(e, m.id)}
                  onDragEnd={() => setDragId(null)}
                  className="rounded-xl border p-2 flex flex-wrap items-center gap-2"
                  style={{ borderColor: selectedId === m.id ? "#9B21FF" : "#E9E5DE", opacity: dragId === m.id ? 0.5 : 1 }}
                >
                  <button type="button" onClick={() => onSelect(m.id)} aria-pressed={selectedId === m.id} aria-label={`Elegir el archivo ${i + 1} para editar`} className="relative w-14 h-14 rounded-lg overflow-hidden flex-shrink-0" style={{ background: "#F3F4F6" }}>
                    {url && (m.kind === "image" ? <img src={url} alt="" draggable={false} className="w-full h-full object-cover" /> : <video src={url} muted preload="metadata" className="w-full h-full object-cover" />)}
                    {kind.max > 1 && <span className="absolute left-0.5 top-0.5 px-1.5 rounded-full text-white text-[10px]" style={{ background: "rgba(8, 11, 31,.8)", fontWeight: 700 }}>{i + 1}</span>}
                  </button>
                  <div className="min-w-0 flex-1" style={{ minWidth: 140 }}>
                    <p className="text-xs flex items-center gap-1.5 flex-wrap" style={{ color: st.text, fontWeight: 700 }}>
                      <span aria-hidden="true" className="inline-block w-2 h-2 rounded-full" style={{ background: st.dot }} />
                      {st.word}
                      {i === 0 && kind.max > 1 && <Badge bg="#F7F0FF" text="#6B7280" size="xs">Portada</Badge>}
                      <Badge bg="#F3F4F6" text="#4B5563" size="xs">{m.kind === "video" ? "Video" : "Foto"}</Badge>
                    </p>
                    <p className="text-[11px] truncate" style={{ color: "#6B7280" }}>{m.name} · {m.width}×{m.height}{m.durationSec ? ` · ${Math.round(m.durationSec)} s` : ""}</p>
                    {m.kind === "image" && (
                      <input
                        type="text"
                        value={m.alt}
                        maxLength={200}
                        onChange={(e) => patch(m.id, { alt: e.target.value })}
                        placeholder="Texto alternativo (para quien no ve la imagen)"
                        aria-label={`Texto alternativo de la foto ${i + 1}`}
                        className="mt-1 w-full text-xs rounded-lg border px-2 min-h-11 md:min-h-8"
                        style={{ borderColor: "#E9E5DE", color: "#1A1A1A" }}
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-auto">
                    {media.length > 1 && (
                      <>
                        <button type="button" className={iconBtn} style={{ borderColor: "#E9E5DE", color: "#6B7280" }} disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`Subir el archivo ${i + 1}`}>↑</button>
                        <button type="button" className={iconBtn} style={{ borderColor: "#E9E5DE", color: "#6B7280" }} disabled={i === media.length - 1} onClick={() => move(i, i + 1)} aria-label={`Bajar el archivo ${i + 1}`}>↓</button>
                      </>
                    )}
                    <button type="button" onClick={() => remove(m)} className="px-3 min-h-11 md:min-h-9 rounded-lg border text-xs hover:bg-rose-50" style={{ borderColor: "#FECDD3", color: "#BE123C", fontWeight: 700 }} aria-label={`Quitar el archivo ${i + 1}`}>
                      Quitar
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {videoItem && (kind.id === "reel" || kind.id === "story") && (
          <VideoChecks media={videoItem} kind={kind.id} />
        )}
        {kind.id === "carousel" && media.length === 1 && (
          <p className="text-xs" style={{ color: "#B45309" }}>Un carrusel necesita al menos 2 fotos; con una sola, elegí «Foto única».</p>
        )}
      </div>
    </Card>
  );
}

export function VideoChecks({ media, kind }: { media: PostMedia; kind: "reel" | "story" }) {
  const checks = checkVideo({ width: media.width, height: media.height, durationSec: media.durationSec ?? 0, bytes: media.bytes }, kind, media.mime);
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "#E9E5DE", background: "#FAF8F5" }}>
      <p className="text-xs mb-2" style={{ color: "#6B7280", fontWeight: 700 }}>Chequeo del video ({media.width}×{media.height} · {(media.bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB)</p>
      <ul className="flex flex-col gap-1.5">
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
    </div>
  );
}
