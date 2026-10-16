import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { VIDEO_SPECS } from "./imageSpecs";
import { captureFrame } from "./mediaTools";
import { putMedia } from "./mediaStore";
import type { PostMedia } from "./postStore";
import { VideoChecks } from "./MediaStep";

interface Props {
  media: PostMedia;
  kind: "reel" | "story";
  videoUrl: string | undefined;
  coverUrl: string | undefined;
  onChange: (part: Partial<PostMedia>) => void;
}

export function VideoCoverPanel({ media, kind, videoUrl, coverUrl, onChange }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const duration = media.durationSec ?? 0;
  const [t, setT] = useState(media.coverTimeSec ?? 0);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (video.current && videoUrl) video.current.currentTime = t;
  }, [t, videoUrl]);

  const use = async () => {
    if (!videoUrl || busy) return;
    setBusy(true);
    try {
      const blob = await captureFrame(videoUrl, t);
      if (blob.size > VIDEO_SPECS.coverMaxBytes) throw new Error("La portada pesa más de 8 MB.");
      if (!(await putMedia(`${media.id}:cover`, blob, `portada-${media.name}.jpg`))) throw new Error("No pudimos guardar la portada en este navegador.");
      onChange({ coverTimeSec: t, hasCover: true });
      setMsg(`Portada elegida: fotograma en ${t.toFixed(1).replace(".", ",")} s.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo capturar el fotograma.");
    }
    setBusy(false);
  };

  return (
    <Card>
      <div className="px-5 py-4 border-b" style={{ borderColor: "#F0EDE6" }}>
        <h3 className="text-base" style={{ color: "#1A1A1A", fontWeight: 700 }}>{kind === "reel" ? "Video del Reel" : "Video de la Story"}</h3>
        <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
          Subí el video ya editado, en 9:16. Acá no recortamos ni comprimimos video: elegís la portada y se publica tal cual.
        </p>
      </div>
      <div className="p-5 grid gap-5 md:grid-cols-[minmax(0,200px)_minmax(0,1fr)] items-start">
        <div className="mx-auto w-full" style={{ maxWidth: 200 }}>
          <div className="rounded-xl overflow-hidden border" style={{ aspectRatio: "9 / 16", background: "#111", borderColor: "#DDD8CF" }}>
            {videoUrl ? (
              <video ref={video} src={videoUrl} muted playsInline preload="auto" className="w-full h-full object-cover" aria-label="Fotograma elegido para la portada" />
            ) : (
              <p className="text-xs text-white p-4">No se encontró el video.</p>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-4 min-w-0">
          <div>
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="cover-t" style={{ color: "#1A1A1A", fontWeight: 600 }}>Buscar fotograma</label>
              <output htmlFor="cover-t" style={{ color: "#4B5563" }}>{t.toFixed(1).replace(".", ",")} s de {duration.toFixed(1).replace(".", ",")} s</output>
            </div>
            <input id="cover-t" type="range" min={0} max={Math.max(0.1, duration)} step={0.1} value={t} onChange={(e) => setT(Number(e.target.value))} className="w-full min-h-11 cursor-pointer" style={{ accentColor: "#9B21FF" }} disabled={!duration} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={use} disabled={busy || !videoUrl} className="px-4 min-h-11 rounded-xl text-sm text-white hover:opacity-90 disabled:opacity-40" style={{ background: "var(--gradient-brand)", fontWeight: 700 }}>
              {busy ? "Capturando…" : "Usar este fotograma como portada"}
            </button>
            {coverUrl && <img src={coverUrl} alt="Portada elegida" className="h-16 rounded-lg border" style={{ borderColor: "#E9E5DE" }} />}
          </div>
          <p role="status" aria-live="polite" className="text-xs" style={{ color: msg.startsWith("Portada") ? "#15803D" : "#BE123C" }}>{msg}</p>
          <p className="text-xs" style={{ color: "#6B7280" }}>
            La portada se descarga como JPEG junto al video. Al publicar a mano, Instagram te deja elegir la portada desde el propio video; este fotograma sirve para la vista previa y como referencia (cómo se aplica por API: <code>cover_url</code> o <code>thumb_offset</code>).
          </p>
          <VideoChecks media={media} kind={kind} />
        </div>
      </div>
    </Card>
  );
}
