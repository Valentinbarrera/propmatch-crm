import { useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/data/store";
import { Card, Badge } from "@/components/ui/Card";
import { isSample } from "@/lib/samples";
import { publishToInstagram, uploadSocialJpeg } from "@/lib/metaPublish";
import { metaPublishErrorText, type IgPublishKind } from "../../../shared/metaPublish";
import { joinCaption } from "./caption";
import { exportEditedJpeg } from "./exportImages";
import { getFormat, getPostKind } from "./imageSpecs";
import type { InstagramPost } from "./postStore";
import { useReminders } from "./reminders";
import { useInstagramConnection } from "./connection";

interface Props {
  post: InstagramPost;
  urls: Record<string, string>;
  stampName: string;
  safeMargin: number;
  blocking: boolean;
  onPatch: (part: Partial<InstagramPost>) => void;
}

/**
 * «Publicar ahora» por la API oficial de Instagram (cuenta profesional
 * vinculada a la Página conectada). Hornea las ediciones a JPEG, las sube a
 * la carpeta de la agencia en el bucket público de la app (Meta necesita una
 * URL pública) y publica foto, carrusel o story de imagen.
 *
 * Programar sigue siendo un recordatorio: no hay cola en el servidor.
 * Reels y stories de video: no por ahora (ver docs/meta-publicaciones-y-web.md).
 */
export function ApiPublishCard({ post, urls, stampName, safeMargin, blocking, onPatch }: Props) {
  const { agency, properties } = useStore();
  const ig = useInstagramConnection();
  const { unschedule } = useReminders();
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const kind = getPostKind(post.kind);
  const format = getFormat(post.format);
  const property = post.propertyId ? properties.find((p) => p.id === post.propertyId) : undefined;
  const hasVideo = post.media.some((m) => m.kind === "video");
  const apiKind: IgPublishKind | null = hasVideo ? null : post.kind === "story" ? "story" : post.media.length > 1 ? "carousel" : "image";
  const published = post.status === "published";

  const reason = ig.approvalPending
    ? "Requiere aprobación de Meta"
    : !ig.connected
      ? "Conectá tu Página de Facebook (con su Instagram profesional) en el multipublicador"
      : !ig.hasInstagram
        ? "Tu Página no tiene un Instagram profesional vinculado"
        : property && isSample(property)
          ? "La propiedad es de ejemplo: no se publica"
          : !apiKind
            ? "Los videos (Reels y stories de video) todavía se suben a mano"
            : blocking
              ? "Corregí lo marcado en «Antes de publicar»"
              : published
                ? "Ya está marcada como publicada"
                : null;

  const run = async () => {
    if (reason || busy || !apiKind) return;
    setBusy(true);
    setMsg(null);
    try {
      const images: { url: string; alt?: string }[] = [];
      for (const [i, m] of post.media.entries()) {
        setStep(`Preparando foto ${i + 1} de ${post.media.length}…`);
        const src = urls[m.id];
        if (!src) throw new Error("No se encontró una de las fotos en este navegador.");
        const blob = await exportEditedJpeg(src, format, m.edits, { stampText: stampName, safeMargin });
        images.push({ url: await uploadSocialJpeg(agency.id, blob), alt: m.alt || undefined });
      }
      const out = await publishToInstagram(
        {
          kind: apiKind,
          images,
          caption: kind.hasCaption ? joinCaption(post.body, post.hashtags) : "",
          propertyId: property && !isSample(property) ? (property.app_property_id ?? null) : null,
        },
        (s) => setStep(s === "preparing" ? "Enviando a Instagram…" : s === "processing" ? "Instagram está procesando…" : "Publicando…"),
      );
      if (!out.ok) {
        const issues = out.issues.map((x) => x.message).join(" ");
        setMsg({ ok: false, text: `${metaPublishErrorText(out.error)}${issues ? ` ${issues}` : ""}${out.detail ? ` (Meta: ${out.detail})` : ""}` });
        return;
      }
      unschedule(post);
      onPatch({ status: "published", publishedAt: new Date().toISOString(), publishedUrl: out.permalink, reminderEventId: null });
      setMsg({ ok: true, text: "¡Listo! Se publicó en Instagram." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error && e.message !== "upload" ? e.message : "No pudimos subir las fotos. Probá de nuevo." });
    } finally {
      setBusy(false);
      setStep("");
    }
  };

  return (
    <Card>
      <div className="px-5 py-4 border-b flex items-center gap-2 flex-wrap" style={{ borderColor: "#F0EDE6" }}>
        <h3 className="text-base" style={{ color: "#1A1A1A", fontWeight: 700 }}>Publicar en Instagram</h3>
        {ig.approvalPending ? (
          <Badge bg="#FEF3C7" text="#92400E" size="xs">Requiere aprobación de Meta</Badge>
        ) : ig.hasInstagram ? (
          <Badge bg="#DCFCE7" text="#15803D" size="xs">{ig.instagramUsername ? `@${ig.instagramUsername}` : "Conectado"}</Badge>
        ) : (
          <Badge bg="#FEF3C7" text="#92400E" size="xs">Requiere conexión</Badge>
        )}
      </div>
      <div className="p-5 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={run}
            disabled={!!reason || busy}
            aria-describedby="ig-api-why"
            className="px-5 min-h-11 rounded-xl text-sm text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "var(--gradient-brand)", fontWeight: 700 }}
          >
            {busy ? step || "Publicando…" : "Publicar ahora"}
          </button>
          <span id="ig-api-why" className="text-xs" style={{ color: "#6B7280" }}>
            {reason ?? `Se publica ya en tu Instagram como ${kind.label.toLowerCase()}.`}
          </span>
        </div>
        {!ig.approvalPending && !ig.connected && (
          <Link to="/publicador#plataformas" className="text-xs underline" style={{ color: "#7C0BD8" }}>
            Ir a conectar
          </Link>
        )}
        <p className="text-xs" style={{ color: "#6B7280" }}>
          Programar una fecha crea un recordatorio: PropMatch todavía no publica solo a una hora. Instagram no permite borrar por API.
        </p>
        <div aria-live="polite">
          {msg && (
            <p role={msg.ok ? "status" : "alert"} className="text-sm px-3 py-2 rounded-lg" style={msg.ok ? { background: "#F0FDF4", color: "#15803D" } : { background: "#FFF1F2", color: "#BE123C" }}>
              {msg.text}
              {msg.ok && post.publishedUrl && (
                <>
                  {" "}
                  <a href={post.publishedUrl} target="_blank" rel="noopener noreferrer" className="underline">
                    Ver la publicación
                  </a>
                </>
              )}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
