import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/data/store";
import { Card, Badge } from "@/components/ui/Card";
import { AlertTriangleIcon, CheckCircleIcon } from "@/components/ui/icons";
import { isSample } from "@/lib/samples";
import { deleteFromFacebook, publishToFacebook, publishToInstagram } from "@/lib/metaPublish";
import type { Property, PropertyPublication } from "@/types/db";
import { buildCaption, DEFAULT_OPTIONS, joinCaption, suggestHashtags } from "@/features/instagram/caption";
import { checkIgCaption, igKindFor, META_PUBLISH_LIMITS, metaPublishErrorText, type MediaIssue } from "../../../shared/metaPublish";
import type { ChannelState } from "./usePublications";
import type { MetaConnection } from "./useMetaConnection";

const INK = "#1A1A1A";

type Busy = null | "ig" | "fb" | "fb-delete";

interface Props {
  property: Property;
  photos: string[];
  facebook: ChannelState;
  instagram: ChannelState;
  meta: MetaConnection;
  onRow: (row: PropertyPublication) => void;
}

/** Fotos que se pueden mandar a Meta: las que ya tienen URL pública en la app. */
const publicPhotos = (list: string[]) => list.filter((u) => /^https:\/\/.+\/storage\/v1\/object\/public\/property-photos\//.test(u));

/**
 * Publicar UNA propiedad en la Página de Facebook y en Instagram (/publicador/:id).
 * Fotos tal cual están en la app; para recortar o editar está el Estudio de Instagram.
 */
export function MetaPublishPanel({ property, photos, facebook, instagram, meta, onRow }: Props) {
  const { agency } = useStore();
  const available = useMemo(() => publicPhotos(photos), [photos]);
  const [selected, setSelected] = useState<string[]>(() => available.slice(0, META_PUBLISH_LIMITS.carouselMax));
  const baseCaption = useMemo(() => buildCaption(property, agency, { ...DEFAULT_OPTIONS, linkInBio: false }), [property, agency]);
  const [igCaption, setIgCaption] = useState(() => joinCaption(baseCaption, suggestHashtags(property, agency).slice(0, 5)));
  const [fbMessage, setFbMessage] = useState(baseCaption);
  const [withLink, setWithLink] = useState(true);
  const [busy, setBusy] = useState<Busy>(null);
  const [step, setStep] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string; issues?: MediaIssue[] } | null>(null);

  const blocked = isSample(property)
    ? "Es una propiedad de ejemplo: no se publica."
    : !property.app_property_id
      ? "Todavía no está sincronizada con la app: guardala con tu cuenta de la inmobiliaria para que las fotos tengan un link público."
      : property.status !== "disponible"
        ? "Solo se publican propiedades disponibles."
        : null;

  const toggle = (u: string) =>
    setSelected((prev) => (prev.includes(u) ? prev.filter((x) => x !== u) : prev.length >= META_PUBLISH_LIMITS.carouselMax ? prev : [...prev, u]));

  const igCaptionIssue = checkIgCaption(igCaption);
  const canAct = meta.connected && !blocked && busy === null;

  const showError = (code: string | null, issues: MediaIssue[] = [], detail?: string | null) =>
    setMsg({ ok: false, text: `${metaPublishErrorText(code)}${detail ? ` (Meta: ${detail})` : ""}`, issues });

  const publishIg = async () => {
    if (!canAct || !meta.hasInstagram || selected.length === 0 || igCaptionIssue) return;
    setBusy("ig");
    setMsg(null);
    const out = await publishToInstagram(
      { kind: igKindFor(selected.length), images: selected.map((url) => ({ url })), caption: igCaption, propertyId: property.app_property_id },
      (s) => setStep(s === "preparing" ? "Preparando las fotos…" : s === "processing" ? "Instagram está procesando…" : "Publicando…"),
    );
    setBusy(null);
    setStep("");
    if (!out.ok) return showError(out.error, out.issues, out.detail);
    if (out.row) onRow(out.row);
    setMsg({ ok: true, text: "Listo: se publicó en Instagram." });
  };

  const publishFb = async () => {
    if (!canAct) return;
    setBusy("fb");
    setMsg(null);
    const r = await publishToFacebook({ propertyId: property.app_property_id, message: fbMessage, images: selected, withLink });
    setBusy(null);
    if (!r.ok || !r.data) return showError(r.error, (r.body?.issues as MediaIssue[]) ?? [], r.body?.detail as string | null);
    if (r.data.row) onRow(r.data.row);
    setMsg({ ok: true, text: "Listo: se publicó en tu Página de Facebook." });
  };

  const deleteFb = async () => {
    if (!property.app_property_id || busy) return;
    if (!window.confirm("¿Borrar el posteo de tu Página de Facebook? No se puede deshacer.")) return;
    setBusy("fb-delete");
    setMsg(null);
    const r = await deleteFromFacebook(property.app_property_id);
    setBusy(null);
    if (!r.ok) return showError(r.error);
    if (r.data?.row) onRow(r.data.row);
    setMsg({ ok: true, text: "Se borró el posteo de Facebook." });
  };

  return (
    <Card>
      <div className="px-5 py-4 border-b flex flex-wrap items-center gap-2" style={{ borderColor: "#F0EDE6" }}>
        <h3 className="text-base" style={{ color: INK, fontWeight: 700 }}>Facebook e Instagram</h3>
        {meta.approvalPending ? (
          <Badge bg="#FEF3C7" text="#92400E" size="xs">Requiere aprobación de Meta</Badge>
        ) : meta.connected ? (
          <Badge bg="#DCFCE7" text="#15803D" size="xs">Conectado</Badge>
        ) : (
          <Badge bg="#F3F4F6" text="#4B5563" size="xs">Sin conectar</Badge>
        )}
      </div>

      <div className="p-5 flex flex-col gap-5">
        {meta.approvalPending ? (
          <p className="text-sm" style={{ color: "#4B5563" }}>
            Publicar en tu Página de Facebook y en tu Instagram profesional desde PropMatch requiere aprobación de Meta. Mientras tanto podés armar la
            publicación en el{" "}
            <Link to={`/instagram/nueva?propiedad=${property.id}`} className="underline" style={{ color: "#7C0BD8" }}>
              Estudio de Instagram
            </Link>{" "}
            y subirla a mano.
          </p>
        ) : !meta.connected ? (
          <p className="text-sm" style={{ color: "#4B5563" }}>
            {meta.needsReauth ? "La conexión con Facebook venció. " : ""}
            Conectá tu Página de Facebook desde las{" "}
            <Link to="/publicador#plataformas" className="underline" style={{ color: "#7C0BD8" }}>
              plataformas del multipublicador
            </Link>
            .
          </p>
        ) : null}

        {blocked && (
          <p className="text-sm px-3 py-2 rounded-lg" style={{ background: "#FFFBEB", color: "#92400E" }}>
            {blocked}
          </p>
        )}

        {/* Fotos */}
        <section aria-labelledby="meta-photos-h">
          <h4 id="meta-photos-h" className="text-sm" style={{ color: INK, fontWeight: 700 }}>
            Fotos ({selected.length} de {available.length} elegidas, máx. {META_PUBLISH_LIMITS.carouselMax})
          </h4>
          {available.length === 0 ? (
            <p className="text-xs mt-1" style={{ color: "#6B7280" }}>
              Esta propiedad no tiene fotos con link público todavía.
            </p>
          ) : (
            <ul className="mt-2 grid grid-cols-4 sm:grid-cols-6 gap-2">
              {available.map((u, i) => {
                const on = selected.includes(u);
                const pos = selected.indexOf(u);
                return (
                  <li key={u}>
                    <button
                      type="button"
                      aria-pressed={on}
                      aria-label={`Foto ${i + 1}${on ? `, elegida en el lugar ${pos + 1}` : ""}`}
                      onClick={() => toggle(u)}
                      className="relative block w-full aspect-square rounded-lg overflow-hidden border-2"
                      style={{ borderColor: on ? "#9B21FF" : "transparent", opacity: on ? 1 : 0.55 }}
                    >
                      <img src={u} alt="" loading="lazy" className="w-full h-full object-cover" />
                      {on && (
                        <span className="absolute top-1 left-1 w-5 h-5 rounded-full text-[11px] flex items-center justify-center text-white" style={{ background: "#9B21FF", fontWeight: 800 }}>
                          {pos + 1}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs mt-2" style={{ color: "#6B7280" }}>
            Instagram pide JPEG con relación de 4:5 a 1,91:1. Si alguna foto no cumple, recortala en el{" "}
            <Link to={`/instagram/nueva?propiedad=${property.id}`} className="underline" style={{ color: "#7C0BD8" }}>
              Estudio de Instagram
            </Link>
            .
          </p>
        </section>

        {/* Instagram */}
        <section aria-labelledby="meta-ig-h" className="border-t pt-4" style={{ borderColor: "#F0EDE6" }}>
          <div className="flex flex-wrap items-center gap-2">
            <h4 id="meta-ig-h" className="text-sm" style={{ color: INK, fontWeight: 700 }}>Instagram</h4>
            <ChannelStatusLine ch={instagram} />
          </div>
          <label htmlFor="meta-ig-caption" className="block text-xs mt-2" style={{ color: "#6B7280", fontWeight: 700 }}>
            Texto ({igCaption.length.toLocaleString("es-AR")} / {META_PUBLISH_LIMITS.captionMax.toLocaleString("es-AR")})
          </label>
          <textarea
            id="meta-ig-caption"
            value={igCaption}
            onChange={(e) => setIgCaption(e.target.value)}
            rows={6}
            className="mt-1 w-full rounded-lg border p-3 text-sm"
            style={{ borderColor: "#E9E5DE", color: INK }}
          />
          {igCaptionIssue && <p className="text-xs" style={{ color: "#BE123C" }}>{igCaptionIssue}</p>}
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <button
              type="button"
              onClick={publishIg}
              disabled={!canAct || !meta.hasInstagram || selected.length === 0 || !!igCaptionIssue}
              className="px-5 min-h-11 rounded-xl text-sm text-white disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "var(--gradient-brand)", fontWeight: 700 }}
            >
              {busy === "ig" ? step || "Publicando…" : selected.length > 1 ? `Publicar carrusel (${selected.length} fotos)` : "Publicar en Instagram"}
            </button>
            {meta.connected && !meta.hasInstagram && (
              <span className="text-xs" style={{ color: "#BE123C" }}>Tu Página no tiene un Instagram profesional vinculado.</span>
            )}
          </div>
          <p className="text-xs mt-2" style={{ color: "#6B7280" }}>
            Instagram no permite borrar publicaciones por API: si necesitás sacarla, borrala desde la app de Instagram.
          </p>
        </section>

        {/* Facebook */}
        <section aria-labelledby="meta-fb-h" className="border-t pt-4" style={{ borderColor: "#F0EDE6" }}>
          <div className="flex flex-wrap items-center gap-2">
            <h4 id="meta-fb-h" className="text-sm" style={{ color: INK, fontWeight: 700 }}>Página de Facebook</h4>
            <ChannelStatusLine ch={facebook} />
          </div>
          <label htmlFor="meta-fb-msg" className="block text-xs mt-2" style={{ color: "#6B7280", fontWeight: 700 }}>
            Texto del posteo
          </label>
          <textarea
            id="meta-fb-msg"
            value={fbMessage}
            onChange={(e) => setFbMessage(e.target.value)}
            rows={5}
            maxLength={META_PUBLISH_LIMITS.fbMessageMax}
            className="mt-1 w-full rounded-lg border p-3 text-sm"
            style={{ borderColor: "#E9E5DE", color: INK }}
          />
          <label className="mt-2 flex items-center gap-2 text-sm min-h-11" style={{ color: INK }}>
            <input type="checkbox" checked={withLink} onChange={(e) => setWithLink(e.target.checked)} className="w-5 h-5" style={{ accentColor: "#9B21FF" }} />
            Agregar el link a la ficha en mi web
          </label>
          <div className="flex flex-wrap gap-3 mt-1">
            <button
              type="button"
              onClick={publishFb}
              disabled={!canAct || (selected.length === 0 && !fbMessage.trim() && !withLink)}
              className="px-5 min-h-11 rounded-xl text-sm text-white disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "#1877F2", fontWeight: 700 }}
            >
              {busy === "fb" ? "Publicando…" : selected.length ? `Publicar con ${selected.length} ${selected.length === 1 ? "foto" : "fotos"}` : "Publicar en Facebook"}
            </button>
            {facebook.status === "published" && facebook.externalId && (
              <button
                type="button"
                onClick={deleteFb}
                disabled={busy !== null || !meta.connected}
                className="px-5 min-h-11 rounded-xl text-sm border disabled:opacity-40"
                style={{ borderColor: "#FECDD3", color: "#BE123C", background: "white", fontWeight: 700 }}
              >
                {busy === "fb-delete" ? "Borrando…" : "Borrar de Facebook"}
              </button>
            )}
          </div>
        </section>

        <div aria-live="polite">
          {msg && (
            <div className="text-sm px-4 py-3 rounded-xl" role={msg.ok ? "status" : "alert"} style={msg.ok ? { background: "#F0FDF4", color: "#15803D" } : { background: "#FFF1F2", color: "#BE123C" }}>
              <p>{msg.text}</p>
              {msg.issues && msg.issues.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-xs">
                  {msg.issues.map((i) => (
                    <li key={i.url}>
                      Foto {available.indexOf(i.url) + 1 || "subida"}: {i.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function ChannelStatusLine({ ch }: { ch: ChannelState }) {
  if (ch.status === "published") {
    return (
      <span className="text-xs inline-flex items-center gap-1" style={{ color: "#15803D", fontWeight: 600 }}>
        <CheckCircleIcon size={13} color="#16A34A" /> Publicada
        {ch.externalUrl && (
          <a href={ch.externalUrl} target="_blank" rel="noopener noreferrer" className="underline ml-1" style={{ color: "#7C0BD8" }}>
            Ver publicación<span className="sr-only"> (se abre en otra pestaña)</span>
          </a>
        )}
      </span>
    );
  }
  if (ch.status === "error") {
    return (
      <span className="text-xs inline-flex items-center gap-1" style={{ color: "#BE123C", fontWeight: 600 }}>
        <AlertTriangleIcon size={13} color="#E11D48" /> Con error{ch.errorMessage ? `: ${ch.errorMessage}` : ""}
      </span>
    );
  }
  if (ch.status === "removed") return <span className="text-xs" style={{ color: "#6B7280", fontWeight: 600 }}>Borrada</span>;
  return <span className="text-xs" style={{ color: "#9CA3AF", fontWeight: 600 }}>Sin publicar</span>;
}
