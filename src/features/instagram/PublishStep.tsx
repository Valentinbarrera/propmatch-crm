import { useState } from "react";
import { Card, Badge } from "@/components/ui/Card";
import { AlertTriangleIcon, CheckIcon, DownloadIcon } from "@/components/ui/icons";
import { countHashtags, hasPlaceholders, joinCaption, slugify } from "./caption";
import { ApiPublishCard } from "./ApiPublishCard";
import { downloadBlob, exportEditedJpeg } from "./exportImages";
import { checkPhoto, checkVideo, getFormat, getPostKind, IG_LIMITS, type CheckLevel } from "./imageSpecs";
import { factsFor } from "./MediaStep";
import { getMedia } from "./mediaStore";
import type { InstagramPost } from "./postStore";
import { arParts, arToIso, formatAr } from "./schedule";
import { useReminders } from "./reminders";

interface Props {
  post: InstagramPost;
  urls: Record<string, string>;
  stampName: string;
  safeMargin: number;
  onPatch: (part: Partial<InstagramPost>) => void;
}

interface Item {
  ok: boolean;
  level: CheckLevel;
  label: string;
  detail: string;
}

export function publishChecklist(post: InstagramPost): Item[] {
  const kind = getPostKind(post.kind);
  const format = getFormat(post.format);
  const full = joinCaption(post.body, post.hashtags);
  const items: Item[] = [];
  const countOk = post.media.length >= kind.min && post.media.length <= kind.max;
  items.push({ ok: countOk, level: countOk ? "ok" : "error", label: kind.min === kind.max ? `${kind.min === 1 ? "Un archivo" : `${kind.min} archivos`}` : `De ${kind.min} a ${kind.max} archivos`, detail: `Tenés ${post.media.length}. ${kind.limits}` });

  let bad = 0;
  for (const m of post.media) {
    const checks = m.kind === "video"
      ? checkVideo({ width: m.width, height: m.height, durationSec: m.durationSec ?? 0, bytes: m.bytes }, post.kind === "story" ? "story" : "reel", m.mime)
      : checkPhoto(factsFor(m), format, m.edits.focal);
    if (checks.some((c) => c.level === "error")) bad++;
  }
  items.push({ ok: bad === 0, level: bad === 0 ? "ok" : "error", label: "Medios dentro de los límites", detail: bad === 0 ? "Sin problemas bloqueantes." : `${bad} ${bad === 1 ? "archivo tiene" : "archivos tienen"} un problema: revisalo en el paso Medios o Editar.` });

  if (kind.hasCaption) {
    const tags = countHashtags(full);
    const over = full.length > IG_LIMITS.captionMax || tags > IG_LIMITS.hashtagsMax;
    items.push({ ok: !over, level: over ? "error" : "ok", label: "Texto dentro del límite", detail: `Máximo ${IG_LIMITS.captionMax.toLocaleString("es-AR")} caracteres y ${IG_LIMITS.hashtagsMax} hashtags (tenés ${full.length.toLocaleString("es-AR")} y ${tags}).` });
    const ph = hasPlaceholders(post.body);
    items.push({ ok: !ph, level: ph ? "warn" : "ok", label: "Sin [campos] sin completar", detail: "El texto todavía tiene partes entre corchetes de la plantilla: reemplazalas antes de publicar." });
  }
  return items;
}

const dot = (level: CheckLevel) => (level === "ok" ? ["#DCFCE7", "#16A34A"] : level === "warn" ? ["#FEF3C7", "#D97706"] : ["#FFE4E6", "#E11D48"]);

export function PublishStep({ post, urls, stampName, safeMargin, onPatch }: Props) {
  const { unschedule } = useReminders();
  const kind = getPostKind(post.kind);
  const format = getFormat(post.format);
  const full = joinCaption(post.body, post.hashtags);
  const items = publishChecklist(post);
  const blocking = items.some((i) => i.level === "error");

  const [dl, setDl] = useState<{ busy: boolean; lines: { text: string; ok: boolean }[]; summary: string }>({ busy: false, lines: [], summary: "" });
  const [copied, setCopied] = useState("");
  const now = arParts(Date.now());
  const [pubDate, setPubDate] = useState(post.publishedAt ? arParts(post.publishedAt).date : now.date);
  const [pubTime, setPubTime] = useState(post.publishedAt ? arParts(post.publishedAt).time : now.time);
  const [link, setLink] = useState(post.publishedUrl ?? "");
  const [err, setErr] = useState("");

  const slug = slugify(post.title || "publicacion");

  const download = async () => {
    if (dl.busy) return;
    setDl({ busy: true, lines: [], summary: "" });
    const lines: { text: string; ok: boolean }[] = [];
    let ok = 0;
    let n = 0;
    for (const [i, m] of post.media.entries()) {
      const idx = String(i + 1).padStart(2, "0");
      try {
        if (m.kind === "image") {
          const src = urls[m.id];
          if (!src) throw new Error("No se encontró el archivo en este navegador.");
          // Las zonas que tapa la interfaz de Instagram (Story/Reel) corren el texto y el sello.
          const blob = await exportEditedJpeg(src, format, m.edits, { stampText: stampName, safeMargin });
          downloadBlob(blob, `${idx}-${slug}.jpg`);
          lines.push({ text: `Foto ${i + 1}: descargada (${format.width}×${format.height}, JPEG).`, ok: true });
        } else {
          const rec = await getMedia(m.id);
          if (!rec) throw new Error("No se encontró el video en este navegador.");
          downloadBlob(rec.blob, `${idx}-${slug}${/\.(mp4|mov)$/i.test(m.name) ? m.name.slice(m.name.lastIndexOf(".")) : ".mp4"}`);
          lines.push({ text: "Video: descargado tal cual lo subiste (no se recomprime).", ok: true });
          const cover = m.hasCover ? await getMedia(`${m.id}:cover`) : null;
          if (cover) {
            await new Promise((r) => setTimeout(r, 350));
            downloadBlob(cover.blob, `${idx}-${slug}-portada.jpg`);
            lines.push({ text: "Portada: descargada (JPEG).", ok: true });
          }
        }
        ok++;
      } catch (e) {
        lines.push({ text: `Archivo ${i + 1}: ${e instanceof Error ? e.message : "error desconocido."}`, ok: false });
      }
      n++;
      setDl({ busy: true, lines: [...lines], summary: "" });
      // Los navegadores frenan descargas encadenadas muy rápidas.
      await new Promise((r) => setTimeout(r, 350));
    }
    setDl({ busy: false, lines, summary: ok === n ? `Listo: ${ok} ${ok === 1 ? "archivo descargado" : "archivos descargados"}. Si el navegador pide permiso para descargas múltiples, aceptalo.` : `Se descargaron ${ok} de ${n}. Revisá los que fallaron.` });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(full);
      setCopied("Texto copiado al portapapeles.");
    } catch {
      setCopied("No pudimos copiar automáticamente: seleccioná el texto en el paso Texto y copialo con Ctrl+C.");
    }
    setTimeout(() => setCopied(""), 4000);
  };

  const markPublished = () => {
    const iso = arToIso(pubDate, pubTime);
    if (!iso) return setErr("Elegí una fecha y hora válidas.");
    if (new Date(iso).getTime() > Date.now() + 5 * 60_000) return setErr("La fecha de publicación no puede ser futura: marcala cuando ya la hayas subido.");
    const url = link.trim();
    if (url && !/^https?:\/\//i.test(url)) return setErr("El enlace tiene que empezar con https://");
    setErr("");
    // Ya no hace falta el recordatorio: se saca de la Agenda.
    unschedule(post);
    onPatch({ status: "published", publishedAt: iso, publishedUrl: url || null, reminderEventId: null });
  };

  const published = post.status === "published";

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="px-5 py-4 border-b flex items-center gap-2 flex-wrap" style={{ borderColor: "#F0EDE6" }}>
          <h3 className="text-base" style={{ color: "#1A1A1A", fontWeight: 700 }}>Antes de publicar</h3>
          <Badge bg={blocking ? "#FFE4E6" : "#DCFCE7"} text={blocking ? "#BE123C" : "#15803D"} size="xs">{blocking ? "Hay algo para corregir" : "Todo en orden"}</Badge>
        </div>
        <ul className="p-5 flex flex-col gap-2">
          {items.map((c) => {
            const [bg, fg] = dot(c.level);
            return (
              <li key={c.label} className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: bg }} aria-hidden="true">
                  {c.ok ? <CheckIcon size={11} color={fg} /> : <AlertTriangleIcon size={11} color={fg} />}
                </span>
                <div>
                  <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 600 }}>
                    <span className="sr-only">{c.ok ? "Cumplido: " : "Falta: "}</span>
                    {c.label}
                  </p>
                  {!c.ok && <p className="text-xs" style={{ color: "#B45309" }}>{c.detail}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <div className="px-5 py-4 border-b flex items-center gap-2 flex-wrap" style={{ borderColor: "#F0EDE6" }}>
          <h3 className="text-base" style={{ color: "#1A1A1A", fontWeight: 700 }}>Publicar a mano</h3>
          <Badge bg="#DCFCE7" text="#15803D" size="xs">Disponible ahora</Badge>
        </div>
        <ol className="p-5 flex flex-col gap-5">
          <li>
            <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>1. Descargá {kind.accepts.includes("video") && post.media.some((m) => m.kind === "video") ? "el video y la portada" : "las fotos listas"}</p>
            <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
              {post.media.some((m) => m.kind === "image") ? `Con tus ediciones aplicadas, ${format.width} px de ancho, JPEG calidad ${IG_LIMITS.exportJpegQuality}.` : "El video se descarga tal cual lo subiste."}
            </p>
            <button type="button" onClick={download} disabled={!post.media.length || dl.busy} className="mt-2 px-5 min-h-11 rounded-xl text-sm text-white flex items-center gap-2 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed" style={{ background: "var(--gradient-brand)", fontWeight: 700 }}>
              <DownloadIcon size={14} color="white" /> {dl.busy ? "Preparando…" : "Descargar archivos"}
            </button>
            <p role="status" aria-live="polite" className={dl.summary ? "text-sm mt-2" : "sr-only"} style={{ color: "#1A1A1A" }}>{dl.summary}</p>
            {dl.lines.length > 0 && (
              <ul className="mt-1 flex flex-col gap-1">
                {dl.lines.map((l) => (
                  <li key={l.text} className="text-xs flex items-start gap-2" style={{ color: l.ok ? "#4B5563" : "#BE123C" }}>
                    {l.ok ? <CheckIcon size={12} color="#16A34A" /> : <AlertTriangleIcon size={12} color="#E11D48" />}
                    <span>{l.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
          <li>
            <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>2. Copiá el texto</p>
            {kind.hasCaption ? (
              <>
                <button type="button" onClick={copy} className="mt-2 px-5 min-h-11 rounded-xl text-sm border hover:bg-violet-50" style={{ borderColor: "#E9E5DE", color: "#6B7280", fontWeight: 700 }}>Copiar texto</button>
                <span role="status" aria-live="polite" className="ml-3 text-xs" style={{ color: "#15803D", fontWeight: 600 }}>{copied}</span>
              </>
            ) : (
              <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>Las Stories no llevan texto de publicación: si querés texto, ponelo sobre la foto en el paso Editar.</p>
            )}
          </li>
          <li>
            <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>3. Abrí Instagram y subila</p>
            <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>Desde la app del celular: «+», elegí {kind.label === "Reel" ? "Reel" : kind.label === "Story" ? "Story" : "Publicación"}, seleccioná los archivos descargados y pegá el texto.</p>
            <a href="https://www.instagram.com/" target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center px-5 min-h-11 rounded-xl text-sm border hover:bg-violet-50" style={{ borderColor: "#E9E5DE", color: "#6B7280", fontWeight: 700 }}>
              Abrir Instagram (se abre en otra pestaña)
            </a>
          </li>
          <li className="border-t pt-4" style={{ borderColor: "#F0EDE6" }}>
            <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>4. Marcá como publicada</p>
            {published ? (
              <div className="mt-1">
                <p className="text-sm" style={{ color: "#15803D" }}>Publicada el {formatAr(post.publishedAt)}.</p>
                {post.publishedUrl && <a href={post.publishedUrl} target="_blank" rel="noopener noreferrer" className="text-sm underline" style={{ color: "#6B7280" }}>Ver la publicación</a>}
                <div className="mt-2">
                  <button type="button" onClick={() => onPatch({ status: "draft", publishedAt: null, publishedUrl: null })} className="px-4 min-h-11 rounded-xl text-xs border hover:bg-violet-50" style={{ borderColor: "#E9E5DE", color: "#6B7280", fontWeight: 700 }}>
                    Desmarcar (volver a borrador)
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-2 flex flex-col gap-3 max-w-md">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="pub-date" className="text-xs" style={{ color: "#6B7280", fontWeight: 700 }}>Fecha real</label>
                    <input id="pub-date" type="date" value={pubDate} onChange={(e) => setPubDate(e.target.value)} className="mt-1 w-full rounded-lg border px-3 min-h-11 text-sm" style={{ borderColor: "#E9E5DE", color: "#1A1A1A" }} />
                  </div>
                  <div>
                    <label htmlFor="pub-time" className="text-xs" style={{ color: "#6B7280", fontWeight: 700 }}>Hora real</label>
                    <input id="pub-time" type="time" value={pubTime} onChange={(e) => setPubTime(e.target.value)} className="mt-1 w-full rounded-lg border px-3 min-h-11 text-sm" style={{ borderColor: "#E9E5DE", color: "#1A1A1A" }} />
                  </div>
                </div>
                <div>
                  <label htmlFor="pub-link" className="text-xs" style={{ color: "#6B7280", fontWeight: 700 }}>Enlace de la publicación (opcional)</label>
                  <input id="pub-link" type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://www.instagram.com/p/…" className="mt-1 w-full rounded-lg border px-3 min-h-11 text-sm" style={{ borderColor: "#E9E5DE", color: "#1A1A1A" }} />
                </div>
                <div>
                  <button type="button" onClick={markPublished} className="px-5 min-h-11 rounded-xl text-sm text-white hover:opacity-90" style={{ background: "var(--gradient-brand)", fontWeight: 700 }}>
                    Marcar como publicada
                  </button>
                  <p className="text-xs mt-1.5" style={{ color: "#6B7280" }}>Solo anota que ya la subiste; PropMatch no verifica nada en Instagram. Se quita el recordatorio de la Agenda.</p>
                </div>
                <p role="alert" className={err ? "text-sm" : "sr-only"} style={{ color: "#BE123C" }}>{err}</p>
              </div>
            )}
          </li>
        </ol>
      </Card>

      <ApiPublishCard post={post} urls={urls} stampName={stampName} safeMargin={safeMargin} blocking={blocking} onPatch={onPatch} />
    </div>
  );
}
