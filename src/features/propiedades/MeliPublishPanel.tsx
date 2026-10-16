/**
 * Panel de Mercado Libre en la pantalla por propiedad del multipublicador:
 * validación previa (qué falta), ubicación de Mercado Libre, publicar,
 * actualizar, pausar, reactivar, finalizar y releer el estado. Todo contra
 * api/meli/publish; nada simulado.
 *
 * Funciona también con propiedades que NO están en la app (precio en pesos o
 * sin sincronizar): las fotos se suben a la carpeta de la agencia y el
 * servidor valida la ficha (ver meliTarget.ts).
 */
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, Badge } from "@/components/ui/Card";
import { CheckIcon } from "@/components/ui/icons";
import type { Property, PropertyPublication } from "@/types/db";
import {
  MELI_LAND_ACCESS,
  MELI_LISTING_TYPES,
  MELI_REQUIRED,
  categoryFor,
  isPublishable,
  validateMeliListing,
  type MeliIssue,
  type MeliListingType,
} from "../../../shared/meliListing";
import { MeliLocationPicker, type MeliLocationValue } from "./MeliLocationPicker";
import { toMeliListing, useMeliPublish, type MeliAction } from "./useMeliPublish";
import type { ChannelState } from "./usePublications";
import type { useMeliConnection } from "./useIntegrations";
import { isSample, SAMPLE_PUBLISH_BLOCKED } from "@/lib/samples";
import { SampleNotice } from "@/components/ui/SampleBadge";
import { FixList, type Fix, type FixItem } from "./completar/InlineFix";
import { FIX_LABEL, MELI_EXTRA_ID, editorHref, fixForMeliField, isFieldKey, type MeliExtraKey } from "./completar/fields";
import { focusField } from "./completar/focusField";
import { useStore } from "@/data/store";
import {
  CRM_PHOTO_UPLOAD_ERROR,
  LOCAL_ONLY_NOTICE,
  meliBlockReason,
  meliTargetBody,
  meliTargetKind,
  photosForValidation,
  prepareCrmPhotos,
} from "./meliTarget";

type MeliConnection = ReturnType<typeof useMeliConnection>;

interface Extras {
  location: MeliLocationValue | null;
  guests: number | null;
  landAccess: string | null;
  listingType: MeliListingType;
}

const storageKey = (propertyId: string) => `pm.meli.extras.${propertyId}`;

/** Datos del aviso que se eligen en este panel (ubicación de ML, huéspedes, acceso), guardados en este navegador. */
export function loadExtras(propertyId: string): Extras {
  const empty: Extras = { location: null, guests: null, landAccess: null, listingType: "silver" };
  try {
    const raw = window.localStorage.getItem(storageKey(propertyId));
    return raw ? { ...empty, ...(JSON.parse(raw) as Partial<Extras>) } : empty;
  } catch {
    return empty;
  }
}

export function saveExtras(propertyId: string, e: Extras) {
  try {
    window.localStorage.setItem(storageKey(propertyId), JSON.stringify(e));
  } catch {
    /* sin storage: se pierde al recargar, nada más */
  }
}

const INK = "#1A1A1A";
const MUTED = "#6B7280";

export function MeliPublishPanel({
  property,
  channel,
  photos,
  meli,
  onRow,
}: {
  property: Property;
  channel: ChannelState;
  photos: string[];
  meli: MeliConnection;
  onRow: (row: PropertyPublication) => void;
}) {
  const [extras, setExtras] = useState<Extras>(() => loadExtras(property.id));
  const [hoodCount, setHoodCount] = useState<number | null>(null);
  const [serverIssues, setServerIssues] = useState<MeliIssue[] | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const { run, busy } = useMeliPublish(onRow);
  const { agency, replacePropertyPhotos } = useStore();

  const update = (patch: Partial<Extras>) => {
    setServerIssues(null);
    setExtras((prev) => {
      const next = { ...prev, ...patch };
      saveExtras(property.id, next);
      return next;
    });
  };

  // Alcanza con el barrio; la ciudad sola solo si no tiene barrios.
  const loc = extras.location;
  const effectiveLocation = loc?.neighborhoodId
    ? { neighborhoodId: loc.neighborhoodId }
    : loc?.cityId && hoodCount === 0
      ? { cityId: loc.cityId }
      : null;
  const listing = toMeliListing(property, { location: effectiveLocation, guests: extras.guests, landAccess: extras.landAccess });

  // App: solo URLs públicas. Solo-CRM: también las locales (se suben al publicar).
  const publicPhotos = useMemo(() => photosForValidation(property, photos), [property, photos]);
  // Mensaje de ubicación más preciso que el genérico de la validación.
  const locationMessage = !loc?.cityId
    ? "Elegí la ciudad de Mercado Libre donde está la propiedad."
    : hoodCount === null
      ? "Cargando los barrios de la ciudad…"
      : "Falta el barrio: en Mercado Libre esta ciudad tiene barrios y hay que elegir uno.";
  const localIssues = validateMeliListing(listing, publicPhotos).map((i) =>
    i.field === "location" && !effectiveLocation ? { ...i, message: locationMessage } : i,
  );
  const issues = serverIssues ?? localIssues;
  const categoryId = categoryFor(property.type, property.operation);
  const required = categoryId ? MELI_REQUIRED[categoryId] ?? [] : [];

  // Seguridad: una propiedad de ejemplo nunca llega a Mercado Libre.
  const sample = isSample(property);
  const kind = meliTargetKind(property);
  const blockReason = meliBlockReason(property, agency.id);
  // Se puede operar (app o solo-CRM) salvo ejemplo o cuenta sin inmobiliaria.
  const synced = !blockReason;
  const status = channel.status;
  // Con error, el aviso puede haber quedado cerrado (p. ej. sin cupo): se ofrece publicar de nuevo
  // y el servidor decide si actualiza o crea uno nuevo según el estado real en Mercado Libre.
  const hasItem = !!channel.externalId && status !== "removed" && status !== "error";

  const act = useCallback(
    async (action: MeliAction) => {
      if (blockReason) return;
      if (action === "close" && !window.confirm("¿Finalizar el aviso en Mercado Libre? No se puede reactivar: habría que publicarlo de nuevo.")) return;
      setMessage(null);
      setWarnings([]);
      const needsListing = action === "publish" || action === "update" || action === "check";
      // Solo-CRM: antes de validar o publicar se suben las fotos locales a la carpeta de la agencia.
      const before =
        kind === "crm" && needsListing
          ? async () => {
              try {
                return { photos: await prepareCrmPhotos(property, agency.id, photos, replacePropertyPhotos) };
              } catch {
                return CRM_PHOTO_UPLOAD_ERROR;
              }
            }
          : undefined;
      const res = await run(action, meliTargetBody(property, agency.id), needsListing ? listing : undefined, extras.listingType, before);
      setServerIssues(res.issues.length ? res.issues : null);
      setWarnings(res.storedOnServer === false && res.row ? [...res.warnings, LOCAL_ONLY_NOTICE] : res.warnings);
      if (!res.ok) setMessage({ ok: false, text: res.message ?? "No se pudo completar la acción." });
      else if (action === "check") setMessage({ ok: isPublishable(res.issues), text: isPublishable(res.issues) ? "Todo listo para publicar." : "Hay datos para completar." });
      else
        setMessage({
          ok: true,
          text:
            action === "publish" ? "Aviso enviado a Mercado Libre."
            : action === "update" ? "Aviso actualizado."
            : action === "pause" ? "Aviso pausado."
            : action === "activate" ? "Aviso reactivado."
            : action === "close" ? "Aviso finalizado."
            : "Estado actualizado.",
        });
    },
    [agency.id, blockReason, extras.listingType, kind, listing, photos, property, replacePropertyPhotos, run],
  );

  const btn = "min-h-[44px] px-4 rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed";
  const primary = { background: "#9B21FF", color: "white", fontWeight: 700 };
  const secondary = { background: "white", color: "#7C0BD8", border: "1px solid #DDD8CF", fontWeight: 700 };
  const danger = { background: "white", color: "#BE123C", border: "1px solid #FECDD3", fontWeight: 700 };
  /** Lleva al control del panel: en la ubicación, al primer select que falta (provincia, ciudad o barrio). */
  const focusExtra = (k: MeliExtraKey) => {
    if (k === "meli_location") {
      const which = !loc?.stateId ? "provincia" : !loc?.cityId ? "ciudad" : "barrio";
      focusField(`${MELI_EXTRA_ID.meli_location}-${which}`);
    } else focusField(MELI_EXTRA_ID[k]);
  };

  // Cada faltante con su arreglo al lado: bloqueantes primero.
  const seen = new Map<string, number>();
  const issueItems: FixItem[] = [...issues]
    .sort((a, b) => Number(b.blocking) - Number(a.blocking))
    .map((i) => {
      const n = seen.get(i.field) ?? 0;
      seen.set(i.field, n + 1);
      const key = fixForMeliField(i.field);
      const fixes: Fix[] = [];
      if (key && isFieldKey(key)) fixes.push({ kind: "field", key });
      else if (key === "photos") fixes.push({ kind: "link", key, label: "Subir fotos", to: editorHref(property.id, "photos") });
      else if (key === "type") fixes.push({ kind: "link", key, label: "Cambiar tipo u operación", to: editorHref(property.id, "type") });
      else if (key && !hasItem && (key === "meli_location" || key === "meli_guests" || key === "meli_land_access"))
        fixes.push({ kind: "action", key, label: key === "meli_location" ? "Elegir ubicación" : "Completar", onClick: () => focusExtra(key) });
      return {
        id: `${i.field}#${n}`,
        title: key ? FIX_LABEL[key] : i.blocking ? "Falta un dato" : "Sugerencia",
        detail: `${i.blocking ? "Falta" : "Sugerencia"}: ${i.message}`,
        tone: i.blocking ? "block" : "warn",
        fixes,
      };
    });

  const canPublish = meli.connected && synced && !sample && isPublishable(localIssues) && !busy;

  return (
    <Card>
      <div className="px-5 py-4 border-b flex flex-wrap items-center justify-between gap-2" style={{ borderColor: "#F0EDE6" }}>
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-lg flex items-center justify-center text-xs" style={{ background: "#FFE600", color: "#1F2937", fontWeight: 800 }}>
            ML
          </span>
          <div>
            <h3 className="text-base" style={{ color: INK, fontWeight: 700 }}>Mercado Libre Inmuebles</h3>
            <p className="text-xs" style={{ color: MUTED }}>
              {meli.loading
                ? "Verificando conexión…"
                : meli.connected
                  ? `Cuenta conectada${meli.nickname ? `: ${meli.nickname}` : ""}`
                  : meli.needsReauth
                    ? "La conexión venció: hay que volver a conectar la cuenta."
                    : meli.configured
                      ? "Sin cuenta conectada."
                      : "La integración no está configurada en este entorno."}
            </p>
          </div>
        </div>
        {categoryId && <Badge bg="#F3F4F6" text="#4B5563" size="xs">Categoría {categoryId}</Badge>}
      </div>

      <div className="p-5 flex flex-col gap-4">
        {!meli.loading && !meli.connected && (
          <p className="text-sm px-4 py-3 rounded-xl" style={{ background: "#FFFBEB", color: "#92400E" }}>
            Para publicar, un administrador tiene que conectar la cuenta de Mercado Libre de la inmobiliaria en{" "}
            <Link to="/publicador#plataformas" className="underline" style={{ fontWeight: 700 }}>Plataformas</Link>.
          </p>
        )}
        {sample && <SampleNotice>{SAMPLE_PUBLISH_BLOCKED} en Mercado Libre.</SampleNotice>}
        {blockReason && !sample && (
          <p className="text-sm px-4 py-3 rounded-xl" style={{ background: "#FFF1F2", color: "#BE123C" }}>
            {blockReason}
          </p>
        )}
        {!blockReason && kind === "crm" && (
          <p className="text-sm px-4 py-3 rounded-xl" style={{ background: "#F7F0FF", color: "#7C0BD8" }}>
            {property.currency === "ARS" ? "Precio en pesos: " : ""}esta propiedad no está en la app de PropMatch, pero se
            publica igual en Mercado Libre. Las fotos se suben a la carpeta de tu inmobiliaria y Mercado Libre las toma de ahí.
          </p>
        )}

        {hasItem && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span style={{ color: INK, fontWeight: 700 }}>Aviso {channel.externalId}</span>
            {channel.externalUrl && (
              <a href={channel.externalUrl} target="_blank" rel="noopener noreferrer" className="underline text-sm" style={{ color: "#9B21FF", fontWeight: 700 }}>
                Ver en Mercado Libre
              </a>
            )}
            {channel.lastSyncedAt && (
              <span className="text-xs" style={{ color: MUTED }}>
                · sincronizado {new Date(channel.lastSyncedAt).toLocaleString("es-AR")}
              </span>
            )}
          </div>
        )}
        {channel.errorMessage && (
          <p className="text-sm px-4 py-3 rounded-xl" style={{ background: status === "error" ? "#FFF1F2" : "#FFFBEB", color: status === "error" ? "#BE123C" : "#92400E" }}>
            {channel.errorMessage}
          </p>
        )}

        {!hasItem && (
          <>
            <div id={MELI_EXTRA_ID.meli_location} className="scroll-mt-6">
              <p className="text-sm mb-2" style={{ color: INK, fontWeight: 700 }}>Ubicación en Mercado Libre</p>
              <MeliLocationPicker
                idPrefix={MELI_EXTRA_ID.meli_location}
                value={extras.location}
                onChange={(v) => update({ location: v })}
                hints={{ province: property.province, locality: property.locality, zone: property.zone }}
                onNeighborhoodCount={setHoodCount}
              />
            </div>

            {(required.includes("GUESTS") || required.includes("LAND_ACCESS")) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {required.includes("GUESTS") && (
                  <label className="text-xs" style={{ color: MUTED, fontWeight: 600 }}>
                    Huéspedes (alquiler temporario)
                    <input
                      id={MELI_EXTRA_ID.meli_guests}
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={extras.guests ?? ""}
                      onChange={(e) => update({ guests: e.target.value ? Number(e.target.value) : null })}
                      className="w-full min-h-[44px] px-3 rounded-xl border text-sm"
                      style={{ borderColor: "#DDD8CF", color: INK }}
                    />
                  </label>
                )}
                {required.includes("LAND_ACCESS") && (
                  <label className="text-xs" style={{ color: MUTED, fontWeight: 600 }}>
                    Acceso del terreno
                    <select
                      id={MELI_EXTRA_ID.meli_land_access}
                      value={extras.landAccess ?? ""}
                      onChange={(e) => update({ landAccess: e.target.value || null })}
                      className="w-full min-h-[44px] px-3 rounded-xl border text-sm bg-white"
                      style={{ borderColor: "#DDD8CF", color: INK }}
                    >
                      <option value="">Elegí…</option>
                      {MELI_LAND_ACCESS.map((a) => (
                        <option key={a.id} value={a.id}>{a.label}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}

            <label className="text-xs" style={{ color: MUTED, fontWeight: 600 }}>
              Tipo de publicación (consume cupo de tu paquete)
              <select
                value={extras.listingType}
                onChange={(e) => update({ listingType: e.target.value as MeliListingType })}
                className="w-full min-h-[44px] px-3 rounded-xl border text-sm bg-white"
                style={{ borderColor: "#DDD8CF", color: INK }}
              >
                {MELI_LISTING_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </label>
          </>
        )}

        <div>
          <p className="text-sm mb-2 flex items-center gap-2" style={{ color: INK, fontWeight: 700 }}>
            Validación previa
            {isPublishable(issues) && (
              <span className="inline-flex items-center gap-1 text-xs" style={{ color: "#15803D" }}>
                <CheckIcon size={11} color="#16A34A" /> sin faltantes
              </span>
            )}
          </p>
          {issueItems.length > 0 && (
            <>
              <p className="text-xs mb-1 text-ink-soft">Completalo acá mismo: al guardar se vuelve a validar.</p>
              <FixList property={property} items={issueItems} onSaved={() => setServerIssues(null)} />
            </>
          )}
        </div>

        {message && (
          <p role="status" className="text-sm px-4 py-3 rounded-xl" style={message.ok ? { background: "#F0FDF4", color: "#15803D" } : { background: "#FFF1F2", color: "#BE123C" }}>
            {message.text}
          </p>
        )}
        {warnings.map((w, i) => (
          <p key={i} className="text-xs px-3 py-2 rounded-lg" style={{ background: "#FFFBEB", color: "#92400E" }}>{w}</p>
        ))}

        <div className="flex flex-wrap gap-2">
          {!hasItem && (
            <>
              <button type="button" className={btn} style={primary} disabled={!canPublish} onClick={() => void act("publish")}>
                {busy === "publish" ? "Publicando…" : status === "error" || status === "removed" ? "Publicar de nuevo" : "Publicar en Mercado Libre"}
              </button>
              {!!channel.externalId && status === "error" && (
                <button type="button" className={btn} style={secondary} disabled={!meli.connected || !!busy} onClick={() => void act("sync")}>
                  {busy === "sync" ? "Consultando…" : "Actualizar estado"}
                </button>
              )}
              <button type="button" className={btn} style={secondary} disabled={!meli.connected || !synced || !!busy} onClick={() => void act("check")}>
                {busy === "check" ? "Verificando…" : "Verificar con Mercado Libre"}
              </button>
            </>
          )}
          {hasItem && (
            <>
              <button type="button" className={btn} style={primary} disabled={!meli.connected || !!busy || !isPublishable(localIssues.filter((i) => i.field !== "location"))} onClick={() => void act("update")}>
                {busy === "update" ? "Actualizando…" : "Actualizar aviso"}
              </button>
              {status === "published" && (
                <button type="button" className={btn} style={secondary} disabled={!meli.connected || !!busy} onClick={() => void act("pause")}>
                  {busy === "pause" ? "Pausando…" : "Pausar"}
                </button>
              )}
              {status === "paused" && (
                <button type="button" className={btn} style={secondary} disabled={!meli.connected || !!busy} onClick={() => void act("activate")}>
                  {busy === "activate" ? "Reactivando…" : "Reactivar"}
                </button>
              )}
              <button type="button" className={btn} style={secondary} disabled={!meli.connected || !!busy} onClick={() => void act("sync")}>
                {busy === "sync" ? "Consultando…" : "Actualizar estado"}
              </button>
              {meli.isAdmin && (
                <button type="button" className={btn} style={danger} disabled={!meli.connected || !!busy} onClick={() => void act("close")}>
                  {busy === "close" ? "Finalizando…" : "Finalizar aviso"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
