/**
 * «Publicar en portales»: elegir en qué portales sale una propiedad y
 * publicarla en todos a la vez con el motor (/api/integrations/publish).
 *
 * - Portales conectados: casilla + validación previa (faltantes con su arreglo
 *   ahí mismo, el mismo panel que usa el publicador).
 * - Sin conectar: botón «Conectar» que lleva a Configuración → Integraciones.
 * - No disponibles: deshabilitados con el motivo.
 * - Facebook/Instagram: se publican desde su panel (texto y fotos a elección).
 * El servidor vuelve a validar todo; el resultado se muestra por portal.
 *
 * Propiedades que no están en la app (precio en pesos o sin sincronizar):
 * Mercado Libre las publica igual (fotos subidas a la carpeta de la agencia,
 * ver meliTarget.ts); los portales que todavía necesitan la app lo explican.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Property, PropertyPublication } from "@/types/db";
import { PORTALS, type PortalId, type PortalMeta } from "@/lib/integrations/registry";
import { isSample, SAMPLE_PUBLISH_BLOCKED } from "@/lib/samples";
import { SampleNotice } from "@/components/ui/SampleBadge";
import { FixList, type Fix, type FixItem } from "@/features/propiedades/completar/InlineFix";
import { FIX_LABEL, editorHref, fixForMeliField, isFieldKey } from "@/features/propiedades/completar/fields";
import { loadExtras } from "@/features/propiedades/MeliPublishPanel";
import { toMeliListing } from "@/features/propiedades/useMeliPublish";
import {
  CRM_PHOTO_UPLOAD_ERROR,
  LOCAL_ONLY_NOTICE,
  meliBlockReason,
  meliTargetBody,
  meliTargetKind,
  photosForValidation,
  prepareCrmPhotos,
} from "@/features/propiedades/meliTarget";
import { useStore } from "@/data/store";
import { saveCrmPublication } from "@/lib/crmPublications";
import { isPublishable, validateMeliListing } from "../../../shared/meliListing";
import { integrationsApi, type PortalResult, type PortalStatus, type PublishOutcome } from "./api";
import { usePortalConnections } from "./usePortalConnections";
import { PortalLogo } from "./PortalLogo";
import { stateLabel } from "./labels";

const INK = "#1A1A1A";
const MUTED = "#6B7280";

/** Lo mínimo que hace falta saber de cada canal de la propiedad. */
export interface ChannelSummary {
  channel: string;
  status: string | null;
  externalId: string | null;
}

const OUTCOME_TEXT: Record<PublishOutcome, { text: string; ok: boolean }> = {
  ready: { text: "Lista para publicar", ok: true },
  published: { text: "Publicada", ok: true },
  updated: { text: "Ya estaba publicada: la actualizamos", ok: true },
  pending_payment: { text: "Creada, pero falta el pago o el cupo", ok: false },
  invalid: { text: "Faltan datos", ok: false },
  rejected: { text: "El portal la rechazó", ok: false },
  not_connected: { text: "Sin conectar", ok: false },
  needs_reauth: { text: "Hay que volver a conectar", ok: false },
  unavailable: { text: "No disponible", ok: false },
  in_progress: { text: "Ya se está publicando", ok: false },
  not_published: { text: "Todavía no tiene aviso", ok: false },
  property_not_found: { text: "Necesita la propiedad en la app", ok: false },
  error: { text: "No se pudo", ok: false },
};

/** Datos de Mercado Libre que se mandan al motor (los mismos que el panel de ML). */
function meliInput(property: Property) {
  const extras = loadExtras(property.id);
  const loc = extras.location;
  // Igual que el panel: alcanza con el barrio; la ciudad sola la valida el servidor.
  const location = loc?.neighborhoodId ? { neighborhoodId: loc.neighborhoodId } : loc?.cityId ? { cityId: loc.cityId } : null;
  return {
    listing: toMeliListing(property, { location, guests: extras.guests, landAccess: extras.landAccess }),
    listingType: extras.listingType,
  };
}

export function PublishToPortalsDialog({
  property,
  photos,
  channels = [],
  onRow,
  onClose,
}: {
  property: Property;
  photos: string[];
  channels?: ChannelSummary[];
  onRow?: (row: PropertyPublication) => void;
  onClose: () => void;
}) {
  const { loading, statusOf, serverError } = usePortalConnections();
  const { agency, replacePropertyPhotos } = useStore();
  const sample = isSample(property);
  const kind = meliTargetKind(property);
  const blockReason = meliBlockReason(property, agency.id);
  // App o solo-CRM: se puede salvo ejemplo o cuenta sin inmobiliaria.
  const synced = !blockReason;
  const [selected, setSelected] = useState<PortalId[]>(["mercadolibre"]);
  const [busy, setBusy] = useState<"check" | "publish" | null>(null);
  const [results, setResults] = useState<PortalResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ml = useMemo(() => meliInput(property), [property]);
  const publicPhotos = useMemo(() => photosForValidation(property, photos), [property, photos]);
  const mlChannel = channels.find((c) => c.channel === "mercadolibre");
  const mlLive = !!mlChannel?.externalId && mlChannel.status !== "removed" && mlChannel.status !== "error";
  // Si ya hay aviso vivo, la ubicación no se vuelve a mandar (igual que el panel de ML).
  const mlIssues = validateMeliListing(ml.listing, publicPhotos).filter((i) => !(mlLive && i.field === "location"));

  const publishable = (id: PortalId, s: PortalStatus | null) =>
    !!s && s.availability.state === "available" && s.state === "connected" && id !== "meta";
  const chosen = selected.filter((id) => publishable(id, statusOf(id)));
  const blocked = chosen.includes("mercadolibre") && !isPublishable(mlIssues);

  const run = async (mode: "check" | "publish") => {
    if (!synced || chosen.length === 0) return;
    setBusy(mode);
    setError(null);
    const target = meliTargetBody(property, agency.id);
    let mlInput: Record<string, unknown> = { ...ml, previous: target.previous };
    if (kind === "crm" && chosen.includes("mercadolibre")) {
      try {
        mlInput = { ...mlInput, photos: await prepareCrmPhotos(property, agency.id, photos, replacePropertyPhotos) };
      } catch {
        setBusy(null);
        return setError(CRM_PHOTO_UPLOAD_ERROR);
      }
    }
    const body = {
      ...(target.propertyId ? { propertyId: target.propertyId } : {}),
      crmPropertyId: target.crmPropertyId,
      portals: chosen,
      inputs: { mercadolibre: mlInput },
      isSample: sample,
    };
    const r = mode === "check" ? await integrationsApi.check(body) : await integrationsApi.publish(body);
    setBusy(null);
    if (!r.ok) return setError(r.message);
    const results = r.data.results.map((x) =>
      x.portal === "mercadolibre" && x.row?.local_only ? { ...x, warnings: [...x.warnings, LOCAL_ONLY_NOTICE] } : x,
    );
    setResults(results);
    for (const x of results) {
      if (!x.row) continue;
      if (x.portal === "mercadolibre" && (kind === "crm" || x.row.local_only)) saveCrmPublication(agency.id, property.id, x.row);
      onRow?.(x.row);
    }
  };

  const toggle = (id: PortalId) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div
      className="pm-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      style={{ background: "rgba(8, 11, 31,0.35)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="publicar-portales-h"
    >
      <div
        className="pm-modal rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        style={{ background: "white", boxShadow: "var(--shadow-pop)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b flex items-center gap-3" style={{ borderColor: "#E9E5DE", background: "#FAF8F5" }}>
          <div className="flex-1 min-w-0">
            <p id="publicar-portales-h" className="text-lg tracking-tight" style={{ color: INK, fontWeight: 800 }}>
              Publicar en portales
            </p>
            <p className="text-xs mt-0.5 truncate" style={{ color: "#6B7280" }}>{property.title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-violet-50" style={{ color: "#6B7280", fontSize: 22 }}>
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
          {sample && <SampleNotice>{SAMPLE_PUBLISH_BLOCKED} en ningún portal.</SampleNotice>}
          {blockReason && !sample && (
            <p className="text-sm px-4 py-3 rounded-xl" style={{ background: "#FFF1F2", color: "#BE123C" }}>{blockReason}</p>
          )}
          {!blockReason && kind === "crm" && (
            <p className="text-sm px-4 py-3 rounded-xl" style={{ background: "#F7F0FF", color: "#7C0BD8" }}>
              {property.currency === "ARS" ? "Precio en pesos: " : ""}la propiedad no está en la app de PropMatch. Mercado Libre la publica
              igual (las fotos se suben a la carpeta de tu inmobiliaria); los portales que todavía necesitan la app te lo van a avisar.
            </p>
          )}
          {serverError && (
            <p role="alert" className="text-sm px-4 py-3 rounded-xl" style={{ background: "#FFFBEB", color: "#92400E" }}>{serverError}</p>
          )}

          <ul className="flex flex-col gap-3">
            {PORTALS.map((p) => (
              <PortalRow
                key={p.id}
                meta={p}
                status={statusOf(p.id)}
                loading={loading}
                propertyId={property.id}
                checked={selected.includes(p.id)}
                onToggle={() => toggle(p.id)}
                onNavigate={onClose}
                result={results?.find((r) => r.portal === p.id) ?? null}
              >
                {p.id === "mercadolibre" && publishable(p.id, statusOf(p.id)) && selected.includes(p.id) && (
                  <MeliPreflight property={property} issues={mlIssues} live={mlLive} onNavigate={onClose} />
                )}
              </PortalRow>
            ))}
          </ul>

          {error && <p role="alert" className="text-sm px-4 py-3 rounded-xl" style={{ background: "#FFF1F2", color: "#BE123C" }}>{error}</p>}
        </div>

        <div className="px-6 py-4 border-t flex flex-wrap gap-2 items-center" style={{ borderColor: "#E9E5DE" }}>
          <button
            type="button"
            onClick={() => void run("publish")}
            disabled={!synced || chosen.length === 0 || blocked || !!busy}
            className="min-h-[44px] px-5 rounded-xl text-sm text-white disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "var(--gradient-brand)", fontWeight: 700 }}
          >
            {busy === "publish" ? "Publicando…" : `Publicar en ${chosen.length} ${chosen.length === 1 ? "portal" : "portales"}`}
          </button>
          <button
            type="button"
            onClick={() => void run("check")}
            disabled={!synced || chosen.length === 0 || !!busy}
            className="min-h-[44px] px-4 rounded-xl text-sm border bg-white disabled:opacity-40"
            style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 700 }}
          >
            {busy === "check" ? "Verificando…" : "Verificar con los portales"}
          </button>
          {blocked && <p className="text-xs" style={{ color: "#B45309" }}>Completá lo que falta para Mercado Libre.</p>}
        </div>
      </div>
    </div>
  );
}

function PortalRow({
  meta: p,
  status: s,
  loading,
  propertyId,
  checked,
  onToggle,
  onNavigate,
  result,
  children,
}: {
  meta: PortalMeta;
  status: PortalStatus | null;
  loading: boolean;
  propertyId: string;
  checked: boolean;
  onToggle: () => void;
  onNavigate: () => void;
  result: PortalResult | null;
  children?: React.ReactNode;
}) {
  const label = s ? stateLabel(s) : null;
  const isMeta = p.id === "meta";
  const available = s?.availability.state === "available";
  const connected = s?.state === "connected";
  const canPick = !loading && !isMeta && available && connected;
  const inputId = `portal-${p.id}`;

  return (
    <li className="rounded-xl border p-4" style={{ borderColor: checked && canPick ? "#D4AAFF" : "#E9E5DE" }}>
      <div className="flex items-start gap-3">
        {canPick ? (
          <input id={inputId} type="checkbox" checked={checked} onChange={onToggle} className="w-5 h-5 mt-3 cursor-pointer" style={{ accentColor: "#9B21FF" }} />
        ) : (
          <input type="checkbox" disabled aria-hidden="true" tabIndex={-1} className="w-5 h-5 mt-3 opacity-40" />
        )}
        <PortalLogo meta={p} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={canPick ? inputId : undefined} className="text-sm" style={{ color: INK, fontWeight: 700 }}>{p.name}</label>
            {loading ? (
              <span className="text-xs" style={{ color: MUTED }}>Verificando…</span>
            ) : (
              label && <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: label.bg, color: label.fg, fontWeight: 700 }}>{label.text}</span>
            )}
          </div>
          {!loading && isMeta && (
            <p className="text-xs mt-1" style={{ color: MUTED }}>
              Se publica desde su panel, donde elegís el texto y las fotos.{" "}
              <Link to={`/publicador/${propertyId}#meta`} onClick={onNavigate} className="underline" style={{ color: "#9B21FF", fontWeight: 700 }}>
                Ir al panel de Facebook e Instagram
              </Link>
            </p>
          )}
          {!loading && !isMeta && s && !available && <p className="text-xs mt-1" style={{ color: MUTED }}>{s.availability.state !== "available" ? s.availability.reason : null}</p>}
          {!loading && !isMeta && available && !connected && (
            <p className="text-xs mt-1 flex flex-wrap items-center gap-2" style={{ color: MUTED }}>
              {s?.state === "needs_reauth" ? "La conexión venció." : "Tu inmobiliaria todavía no lo conectó."}
              <Link
                to="/configuracion/integraciones"
                onClick={onNavigate}
                className="inline-flex items-center min-h-[36px] px-3 rounded-lg text-xs text-white"
                style={{ background: "#9B21FF", fontWeight: 700 }}
              >
                {s?.state === "needs_reauth" ? "Reconectar" : "Conectar"}
              </Link>
            </p>
          )}
          {!loading && connected && s?.accountLabel && <p className="text-xs mt-1" style={{ color: MUTED }}>Cuenta: {s.accountLabel}</p>}
          {children}
          {result && <ResultBox r={result} />}
        </div>
      </div>
    </li>
  );
}

function MeliPreflight({ property, issues, live, onNavigate }: { property: Property; issues: ReturnType<typeof validateMeliListing>; live: boolean; onNavigate: () => void }) {
  const navigate = useNavigate();
  const seen = new Map<string, number>();
  const items: FixItem[] = [...issues]
    .sort((a, b) => Number(b.blocking) - Number(a.blocking))
    .map((i) => {
      const n = seen.get(i.field) ?? 0;
      seen.set(i.field, n + 1);
      const key = fixForMeliField(i.field);
      const fixes: Fix[] = [];
      if (key && isFieldKey(key)) fixes.push({ kind: "field", key });
      else if (key === "photos") fixes.push({ kind: "link", key, label: "Subir fotos", to: editorHref(property.id, "photos") });
      else if (key === "type") fixes.push({ kind: "link", key, label: "Cambiar tipo u operación", to: editorHref(property.id, "type") });
      else if (key === "meli_location" || key === "meli_guests" || key === "meli_land_access")
        fixes.push({ kind: "action", key, label: key === "meli_location" ? "Elegir ubicación" : "Completar", onClick: () => { onNavigate(); navigate(`/publicador/${property.id}#mercadolibre`); } });
      return {
        id: `${i.field}#${n}`,
        title: key ? FIX_LABEL[key] : i.blocking ? "Falta un dato" : "Sugerencia",
        detail: `${i.blocking ? "Falta" : "Sugerencia"}: ${i.message}`,
        tone: i.blocking ? "block" : "warn",
        fixes,
      };
    });
  return (
    <div className="mt-2">
      <p className="text-xs" style={{ color: isPublishable(issues) ? "#15803D" : "#B45309", fontWeight: 700 }}>
        {live ? "Ya tiene aviso: se actualiza (no se duplica)." : isPublishable(issues) ? "Sin faltantes." : "Antes de publicar, completá:"}
      </p>
      {items.length > 0 && <FixList property={property} items={items} dense />}
    </div>
  );
}

function ResultBox({ r }: { r: PortalResult }) {
  const t = OUTCOME_TEXT[r.outcome] ?? OUTCOME_TEXT.error;
  const ok = r.ok && t.ok;
  return (
    <div role="status" className="mt-3 rounded-lg px-3 py-2 text-xs" style={ok ? { background: "#F0FDF4", color: "#15803D" } : { background: "#FFF1F2", color: "#BE123C" }}>
      <p style={{ fontWeight: 700 }}>{t.text}</p>
      {r.message && <p className="mt-0.5">{r.message}</p>}
      {r.issues.filter((i) => i.blocking).length > 0 && (
        <ul className="mt-1 list-disc pl-4">{r.issues.filter((i) => i.blocking).map((i, k) => <li key={k}>{i.message}</li>)}</ul>
      )}
      {r.warnings.map((w, k) => <p key={k} className="mt-1" style={{ color: "#92400E" }}>{w}</p>)}
      {ok && r.row?.external_url && (
        <a href={r.row.external_url} target="_blank" rel="noopener noreferrer" className="inline-block mt-1 underline" style={{ fontWeight: 700 }}>
          Ver el aviso
        </a>
      )}
    </div>
  );
}
