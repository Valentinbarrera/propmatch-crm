import { useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useStore } from "@/data/store";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, Badge } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/states";
import {
  HomeIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  ClockIcon,
  MapPinIcon,
  SparkIcon,
  ChevronLeftIcon,
} from "@/components/ui/icons";
import { money, PROPERTY_TYPE_LABEL } from "@/lib/format";
import { MATCH_THRESHOLD } from "@/lib/matching";
import { diagnose } from "@/lib/listingDiagnostics";
import type { PublicationChannel } from "@/types/db";
import { usePublications, type ChannelState } from "./usePublications";
import { useMeliConnection } from "./useIntegrations";
import { MeliPublishPanel } from "./MeliPublishPanel";
import { isSample, SAMPLE_PUBLISH_BLOCKED } from "@/lib/samples";
import { metaEnv } from "@/lib/inbox/metaSdk";
import { useMetaConnection } from "./useMetaConnection";
import { MetaPublishPanel } from "./MetaPublishPanel";
import { WebChannelPanel } from "./WebChannelPanel";
import { SampleBadge, SampleNotice } from "@/components/ui/SampleBadge";
import { FixList, type Fix, type FixItem } from "./completar/InlineFix";
import { PublishToPortalsDialog } from "@/features/integraciones/PublishToPortalsDialog";
import { AppChannelRow } from "@/features/appSync/PublishAllToApp";
import { FIX_LABEL, editorHref, fixesForCheck, isFieldKey, optionalMissing, shortMissingForCheck, type FixKey, type LinkKey } from "./completar/fields";

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase" style={{ color: "#6B7280", fontWeight: 600, letterSpacing: "0.06em" }}>
        {label}
      </p>
      <p className="text-sm truncate" style={{ color: "#1A1A1A", fontWeight: 700 }}>
        {value}
      </p>
    </div>
  );
}

function ChannelRow({
  ch,
  selected,
  onToggle,
  onRetry,
  onDesign,
}: {
  ch: ChannelState;
  selected: boolean;
  onToggle: () => void;
  onRetry: () => void;
  onDesign: () => void;
}) {
  const { info, status } = ch;
  const isWeb = info.channel === "web";
  // Mercado Libre se publica de verdad desde su panel, no por la cola.
  const isMeli = info.channel === "mercadolibre";
  // Con la publicación de Meta habilitada, Facebook/Instagram se publican desde su panel (no por la cola).
  const isMeta = metaEnv.publishEnabled && (info.channel === "facebook" || info.channel === "instagram");
  const selectable = !isWeb && !isMeli && !isMeta && status === null;

  let line: { text: string; color: string; icon: React.ReactNode };
  if (isWeb)
    line =
      status === "published"
        ? { text: "En tu web", color: "#15803D", icon: <CheckCircleIcon size={14} color="#16A34A" /> }
        : { text: status === "removed" ? "Oculta en tu web" : status === "paused" ? "No disponible" : "Sin sincronizar", color: "#6B7280", icon: null };
  else if (status === "published") line = { text: "Publicada", color: "#15803D", icon: <CheckCircleIcon size={14} color="#16A34A" /> };
  else if (status === "pending")
    line = isMeli
      ? { text: "Enviando / en revisión", color: "#B45309", icon: <ClockIcon size={13} color="#D97706" /> }
      : { text: "En cola · conector pendiente", color: "#B45309", icon: <ClockIcon size={13} color="#D97706" /> };
  else if (status === "paused") line = { text: "Pausada", color: "#B45309", icon: <ClockIcon size={13} color="#D97706" /> };
  else if (status === "removed") line = { text: "Finalizada", color: "#6B7280", icon: null };
  else if (status === "error") line = { text: "Error", color: "#BE123C", icon: <AlertTriangleIcon size={13} color="#E11D48" /> };
  else line = { text: "Sin publicar", color: "#9CA3AF", icon: null };

  return (
    <div
      className="flex flex-wrap items-center gap-3 px-5 py-4 border-b last:border-b-0"
      style={{ borderColor: "#F0EDE6" }}
    >
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-sm"
        style={{ background: info.color, color: info.color === "#FFE600" ? "#1F2937" : "white", fontWeight: 800 }}
      >
        {info.short}
      </div>
      <div className="min-w-0 flex-1" style={{ minWidth: 160 }}>
        <p className="text-sm truncate" style={{ color: "#1A1A1A", fontWeight: 700 }}>
          {info.name}
        </p>
        <p className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: line.color, fontWeight: 600 }}>
          {line.icon}
          {line.text}
        </p>
        {status === "error" && ch.errorMessage && (
          <p className="text-xs mt-0.5" style={{ color: "#BE123C" }}>
            {ch.errorMessage}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {info.channel === "instagram" && (
          <button
            onClick={onDesign}
            className="px-3 py-2 min-h-11 md:min-h-0 md:py-1.5 rounded-lg text-xs border hover:bg-violet-50"
            style={{ borderColor: "#E9E5DE", color: "#6B7280", fontWeight: 700 }}
          >
            Diseñar publicación
          </button>
        )}
        {status === "published" && ch.externalId && (
          <span
            className="text-[11px] px-2 py-1 rounded-md border"
            style={{ background: "#F8FAFC", borderColor: "#E2E8F0", color: "#475569", fontWeight: 600 }}
          >
            ID: {ch.externalId}
          </span>
        )}
        {status === "published" && ch.externalUrl && (
          <a
            href={ch.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-lg text-xs border hover:bg-violet-50"
            style={{ borderColor: "#E9E5DE", color: "#9B21FF", fontWeight: 700 }}
          >
            Ver ficha
          </a>
        )}
        {(isMeli || isMeta || isWeb) && (
          <a
            href={isMeli ? "#mercadolibre" : isWeb ? "#web" : "#meta"}
            className="px-3 py-1.5 rounded-lg text-xs border hover:bg-violet-50"
            style={{ borderColor: "#E9E5DE", color: "#9B21FF", fontWeight: 700 }}
          >
            Gestionar
          </a>
        )}
        {status === "error" && !isMeli && (
          <button
            onClick={onRetry}
            className="px-3 py-1.5 rounded-lg text-xs border hover:bg-rose-50"
            style={{ borderColor: "#FECDD3", color: "#BE123C", fontWeight: 700 }}
          >
            Reintentar
          </button>
        )}
        {selectable && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            aria-label={`Seleccionar ${info.name}`}
            className="w-5 h-5 cursor-pointer"
            style={{ accentColor: "#9B21FF" }}
          />
        )}
      </div>
    </div>
  );
}

export default function MultipublicadorVivoPage() {
  const { propertyId } = useParams<{ propertyId: string }>();
  const navigate = useNavigate();
  const { properties, photos, matches, contactById, profileById, coverPhoto } = useStore();
  const { channelsOf, queue, applyRow, setWeb, loading, error } = usePublications();
  const meli = useMeliConnection();
  const meta = useMetaConnection();
  const [selected, setSelected] = useState<PublicationChannel[]>([]);
  const [portalsOpen, setPortalsOpen] = useState(false);
  /** Una vez que hubo opcionales, la lista queda visible (para ver los ✓ de lo que se completó). */
  const hadOptional = useRef(false);

  const property = properties.find((p) => p.id === propertyId);

  const compatible = useMemo(
    () =>
      property
        ? matches
            .filter((m) => m.property_id === property.id && !m.is_dismissed && m.score >= MATCH_THRESHOLD)
            .sort((a, b) => b.score - a.score)
        : [],
    [matches, property],
  );

  if (!property) {
    return (
      <>
        <AppHeader title="Multipublicador" breadcrumb={["Publicaciones"]} />
        <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-10">
          <Card className="mt-8">
            <EmptyState
              icon={<HomeIcon size={24} color="#9B21FF" />}
              title="No encontramos esta propiedad"
              description="Puede que se haya eliminado o que el enlace no sea correcto."
              action={{ label: "Volver al multipublicador", onClick: () => navigate("/publicador") }}
            />
          </Card>
        </div>
      </>
    );
  }

  const channels = channelsOf(property);
  const photoList = photos[property.id] ?? [];
  const cover = coverPhoto(property.id);
  const total = channels.length;
  const published = channels.filter((c) => c.status === "published").length;
  const pending = channels.filter((c) => c.status === "pending").length;
  const errored = channels.filter((c) => c.status === "error");
  // Los reintentos masivos son para la cola; Mercado Libre se reintenta desde su panel.
  const erroredQueued = errored.filter((c) => c.info.channel !== "mercadolibre");
  const meliChannel = channels.find((c) => c.info.channel === "mercadolibre")!;
  const involved = channels.filter((c) => c.status !== null).length;

  const sample = isSample(property);
  const checks = diagnose(property, photoList.length);
  const validPct = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);

  // Cada check que no pasa trae su arreglo: inline si es un dato, botón directo si no.
  const LINK_LABEL: Partial<Record<FixKey, string>> = { photos: "Subir fotos", authorization: "Cargar autorización" };
  const checkItems: FixItem[] = checks.map((c) => ({
    id: c.id,
    title: c.label,
    // "Superficie, ambientes y baños" es un check compuesto: se dice qué parte falta.
    detail: c.id === "size" && !c.ok ? `Falta: ${shortMissingForCheck(c, property, photoList.length).join(", ")}.` : c.detail,
    tone: c.ok ? "ok" : "warn",
    fixes: fixesForCheck(c, property).map(
      (k): Fix =>
        isFieldKey(k)
          ? { kind: "field", key: k }
          : { kind: "link", key: k, label: LINK_LABEL[k] ?? `Completar ${FIX_LABEL[k].toLowerCase()}`, to: editorHref(property.id, k as LinkKey) },
    ),
  }));
  const requiredKeys = checks.flatMap((c) => fixesForCheck(c, property));
  const optionalItems: FixItem[] = optionalMissing(property, requiredKeys).map((k) => ({
    id: `opt-${k}`,
    title: FIX_LABEL[k],
    tone: "optional",
    fixes: [{ kind: "field", key: k }],
  }));
  const synced = !!property.app_property_id && !sample;
  if (optionalItems.length > 0) hadOptional.current = true;

  const agent = profileById(property.owner_agent_id)?.full_name;
  const address = [
    [property.street, property.street_number].filter(Boolean).join(" "),
    property.zone,
    property.province,
  ]
    .filter(Boolean)
    .join(", ");

  const toggle = (c: PublicationChannel) =>
    setSelected((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  const publish = () => {
    if (sample) return;
    void queue(property, selected);
    setSelected([]);
  };

  const buyers = compatible.slice(0, 4).map((m) => contactById(m.contact_id));
  const extraBuyers = compatible.length - buyers.length;

  return (
    <>
      <AppHeader
        title="Multipublicador"
        subtitle={property.title}
        breadcrumb={["Publicaciones", "Multipublicador"]}
      >
        <button
          onClick={() => navigate("/publicador")}
          className="px-3 py-2 rounded-xl text-xs border flex items-center gap-1 hover:bg-violet-50"
          style={{ borderColor: "#E9E5DE", color: "#9B21FF", fontWeight: 700, background: "white" }}
        >
          <ChevronLeftIcon size={12} /> Volver
        </button>
      </AppHeader>

      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-10">
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Columna principal */}
          <div className="lg:col-span-2 flex flex-col gap-6 min-w-0">
            <Card padded>
              {sample && (
                <div className="mb-4">
                  <SampleNotice>{SAMPLE_PUBLISH_BLOCKED}. Sirve para ver cómo funciona el multipublicador.</SampleNotice>
                </div>
              )}
              <p className="text-[11px] uppercase" style={{ color: "#9B21FF", fontWeight: 700, letterSpacing: "0.08em" }}>
                Distribución multicanal
              </p>
              <h2 className="text-xl md:text-2xl tracking-tight mt-1" style={{ color: "#1A1A1A", fontWeight: 800 }}>
                Distribución de la propiedad en {involved} {involved === 1 ? "canal" : "canales"}
              </h2>

              <div
                className="mt-5 rounded-2xl border p-4 flex flex-col sm:flex-row gap-4"
                style={{ borderColor: "#E9E5DE", background: "#FAF8F5" }}
              >
                <div
                  className="relative w-full sm:w-44 h-40 sm:h-32 rounded-xl overflow-hidden flex-shrink-0"
                  style={{ background: "#F7F0FF" }}
                >
                  {cover ? (
                    <img src={cover} alt={property.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <HomeIcon size={28} color="#DDD8CF" />
                    </div>
                  )}
                  <span
                    className="absolute left-2 bottom-2 text-[10px] px-2 py-0.5 rounded-full text-white"
                    style={{ background: "rgba(8, 11, 31,0.75)", fontWeight: 700 }}
                  >
                    {photoList.length} {photoList.length === 1 ? "FOTO" : "FOTOS"}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-2xl" style={{ color: "#1A1A1A", fontWeight: 800 }}>
                      {money(property.price, property.currency)}
                    </span>
                    {property.authorization_type === "exclusiva" && (
                      <Badge bg="#F7F0FF" text="#9B21FF" size="xs">Exclusiva</Badge>
                    )}
                    <Badge bg="#F3F4F6" text="#4B5563" size="xs">#{property.id.slice(0, 6)}</Badge>
                    <Badge bg="#F7F0FF" text="#9B21FF" size="xs">{PROPERTY_TYPE_LABEL[property.type]}</Badge>
                  </div>
                  <p className="text-sm mt-1" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                    {property.title} <SampleBadge record={property} />
                  </p>
                  {address && (
                    <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: "#6B7280" }}>
                      <MapPinIcon size={12} /> {address}
                    </p>
                  )}
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Spec label="Superficie" value={property.surface_total ? `${property.surface_total} m²` : "—"} />
                    <Spec label="Ambientes" value={property.rooms ? String(property.rooms) : "—"} />
                    <Spec label="Baños" value={property.bathrooms != null ? String(property.bathrooms) : "—"} />
                    {agent && <Spec label="Agente gestor" value={agent} />}
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-2">
                  <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                    {published} de {total} canales publicados
                  </p>
                  <p className="text-xs" style={{ color: "#6B7280" }}>
                    {pending} en cola · {errored.length} con error
                  </p>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "#F0EDE6" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${(published / total) * 100}%`, background: "var(--gradient-brand)" }}
                  />
                </div>
              </div>
            </Card>

            <Card>
              <div className="px-5 py-4 border-b" style={{ borderColor: "#F0EDE6" }}>
                <h3 className="text-base" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                  Canales de distribución
                </h3>
              </div>

              {error && (
                <p className="m-5 text-sm px-4 py-3 rounded-xl" style={{ background: "#FFF1F2", color: "#BE123C" }}>
                  No se pudieron guardar las publicaciones: {error}
                </p>
              )}

              {loading ? (
                <p className="px-5 py-10 text-sm text-center" style={{ color: "#6B7280" }}>
                  Cargando publicaciones…
                </p>
              ) : (
                <div>
                  {/* La app PropMatch es un canal más (la demanda propia de PropMatch). */}
                  <AppChannelRow propertyId={property.id} />
                  {channels.map((ch) => (
                    <ChannelRow
                      key={ch.info.channel}
                      ch={ch}
                      selected={selected.includes(ch.info.channel)}
                      onToggle={() => toggle(ch.info.channel)}
                      onRetry={() => void queue(property, [ch.info.channel])}
                      onDesign={() => navigate(`/publicador/${property.id}/instagram`)}
                    />
                  ))}
                </div>
              )}

              <div className="px-5 py-4 border-t flex flex-col gap-3" style={{ borderColor: "#F0EDE6" }}>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setPortalsOpen(true)}
                    className="px-5 py-2.5 rounded-xl text-sm text-white transition-all hover:opacity-90 active:scale-95"
                    style={{ background: "#9B21FF", fontWeight: 700 }}
                  >
                    Publicar en portales
                  </button>
                  <button
                    onClick={publish}
                    disabled={selected.length === 0 || sample}
                    title={sample ? SAMPLE_PUBLISH_BLOCKED : undefined}
                    className="px-5 py-2.5 rounded-xl text-sm text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: "var(--gradient-brand)", fontWeight: 700 }}
                  >
                    Publicar en {selected.length} {selected.length === 1 ? "canal" : "canales"}
                  </button>
                  {erroredQueued.length > 0 && (
                    <button
                      onClick={() => void queue(property, erroredQueued.map((c) => c.info.channel))}
                      className="px-5 py-2.5 rounded-xl text-sm border hover:bg-rose-50"
                      style={{ borderColor: "#FECDD3", color: "#BE123C", fontWeight: 700 }}
                    >
                      Reintentar fallidos
                    </button>
                  )}
                </div>
                <p className="text-xs flex items-start gap-2" style={{ color: "#6B7280" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#BF7FFF" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0 mt-px">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4M12 8h.01" />
                  </svg>
                  Mercado Libre se publica de verdad desde su panel. El resto de los portales todavía no tiene conector: esos canales quedan en cola.
                </p>
              </div>
            </Card>

            <div id="mercadolibre" className="scroll-mt-6">
              <MeliPublishPanel
                property={property}
                channel={meliChannel}
                photos={photoList}
                meli={meli}
                onRow={applyRow}
              />
            </div>

            <div id="meta" className="scroll-mt-6">
              <MetaPublishPanel
                property={property}
                photos={photoList}
                facebook={channels.find((c) => c.info.channel === "facebook")!}
                instagram={channels.find((c) => c.info.channel === "instagram")!}
                meta={meta}
                onRow={applyRow}
              />
            </div>

            <div id="web" className="scroll-mt-6">
              <WebChannelPanel property={property} web={channels.find((c) => c.info.channel === "web")!} setWeb={setWeb} />
            </div>
          </div>

          {/* Columna lateral */}
          <div className="flex flex-col gap-6 min-w-0">
            <Card>
              <div className="px-5 py-4 border-b flex items-center justify-between gap-3" style={{ borderColor: "#F0EDE6" }}>
                <h3 className="text-base" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                  Diagnóstico previo
                </h3>
                <Badge
                  bg={validPct === 100 ? "#DCFCE7" : "#FEF3C7"}
                  text={validPct === 100 ? "#15803D" : "#B45309"}
                  size="xs"
                >
                  {validPct}% VÁLIDO
                </Badge>
              </div>
              <div className="px-5">
                <FixList property={property} items={checkItems} dense />
              </div>
              {(sample || synced) && (
                <p className="mx-5 mb-3 text-xs px-3 py-2 rounded-lg bg-lavender text-lilac-text">
                  {sample
                    ? "Es una propiedad de ejemplo: lo que completes acá queda solo en este navegador."
                    : "Lo que completes acá se guarda en el CRM al instante. Para que también llegue a la app, abrí el editor y tocá «Guardar cambios»."}
                </p>
              )}
              {hadOptional.current && (
                <details className="border-t border-divider group">
                  <summary className="px-5 min-h-11 flex items-center justify-between gap-2 cursor-pointer text-sm text-ink list-none [&::-webkit-details-marker]:hidden" style={{ fontWeight: 700 }}>
                    <span>
                      También conviene completar{" "}
                      {optionalItems.length > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-lavender" style={{ color: "#9B21FF" }}>
                          {optionalItems.length}
                        </span>
                      )}
                    </span>
                    <span aria-hidden="true" className="text-lilac-text transition-transform group-open:rotate-180">▾</span>
                  </summary>
                  <div className="px-5 pb-2">
                    <p className="text-xs text-ink-soft">No frena ninguna publicación, pero mejora la ficha y el matching.</p>
                    <FixList property={property} items={optionalItems} dense />
                  </div>
                </details>
              )}
            </Card>

            <Card>
              <div className="px-5 py-4 border-b flex items-center gap-2" style={{ borderColor: "#F0EDE6" }}>
                <SparkIcon size={16} color="#9B21FF" />
                <h3 className="text-base" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                  Match automático
                </h3>
              </div>
              {compatible.length === 0 ? (
                <EmptyState
                  compact
                  title="Todavía no hay compradores compatibles"
                  description="Cuando haya contactos cuya búsqueda encaje con esta propiedad, van a aparecer acá."
                />
              ) : (
                <div className="p-5">
                  <p className="text-3xl" style={{ color: "#1A1A1A", fontWeight: 800 }}>
                    {compatible.length}
                    <span className="text-sm ml-2" style={{ color: "#6B7280", fontWeight: 600 }}>
                      {compatible.length === 1 ? "comprador compatible" : "compradores compatibles"}
                    </span>
                  </p>
                  <p className="text-xs mt-1" style={{ color: "#6B7280" }}>
                    Mejor coincidencia: <strong style={{ color: "#9B21FF" }}>{compatible[0].score}%</strong>
                  </p>
                  <div className="flex items-center mt-4">
                    {buyers.map((c, i) => (
                      <span
                        key={compatible[i].id}
                        title={c?.full_name}
                        className="w-9 h-9 rounded-full flex items-center justify-center text-xs text-white border-2 border-white"
                        style={{ background: "var(--gradient-brand)", fontWeight: 700, marginLeft: i === 0 ? 0 : -8 }}
                      >
                        {c ? initialsOf(c.full_name) : "?"}
                      </span>
                    ))}
                    {extraBuyers > 0 && (
                      <span
                        className="w-9 h-9 rounded-full flex items-center justify-center text-xs border-2 border-white"
                        style={{ background: "#F7F0FF", color: "#9B21FF", fontWeight: 700, marginLeft: -8 }}
                      >
                        +{extraBuyers}
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-4" style={{ color: "#6B7280" }}>
                    Cuando se confirmen los canales, PropMatch puede avisar por WhatsApp a estos compradores.
                  </p>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
      {portalsOpen && (
        <PublishToPortalsDialog
          property={property}
          photos={photoList}
          channels={channels.map((c) => ({ channel: c.info.channel, status: c.status, externalId: c.externalId }))}
          onRow={applyRow}
          onClose={() => setPortalsOpen(false)}
        />
      )}
    </>
  );
}
