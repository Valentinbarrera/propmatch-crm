/**
 * «Publicar todas en la app»: sube a la app PropMatch, en tandas, las
 * propiedades del CRM que todavía no están, copiando sus fotos externas al
 * almacenamiento de PropMatch. Solo admins/dueños de una agencia vinculada.
 * Ver docs/publicar-todas-en-la-app.md.
 *
 *  - <PublishAllToAppButton/>: botón (Propiedades e Integraciones).
 *  - <AppPropMatchCard/>: tarjeta «App PropMatch» de Configuración → Integraciones.
 *  - <BulkAppSyncHost/>: montado en el layout; mantiene vivas las dependencias
 *    del trabajo, muestra el progreso flotante y el diálogo.
 *  - <UpdateAppPhotos/>: «Actualizar las fotos en la app» (Marca → Logo sobre
 *    las fotos): vuelve a mandar las fotos de las propiedades que ya están en
 *    la app, con el mismo motor en tandas. Ver docs/marca-de-agua-app.md.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { useStore } from "@/data/store";
import { supabase } from "@/lib/supabase";
import { integrationsApi } from "@/features/integraciones/api";
import {
  INELIGIBLE_LABEL,
  classifyForApp,
  externalPhotos,
  failedIds,
  ineligibleReasons,
  jobProgress,
  planPhotos,
  type BulkSummary,
  type CopyPhotosResponse,
  type IneligibleReason,
} from "../../../shared/appBulkSync";
import {
  appliedFingerprint,
  cancelJob,
  clearJob,
  isRunning,
  pauseJob,
  resumeJob,
  retryFailedJob,
  setBulkDeps,
  startJob,
  useBulkJob,
} from "./bulkAppSync";

const INK = "#1A1A1A";
const MUTED = "#6B7280";
const VIOLET = "#9B21FF";

export const NOT_LINKED_TEXT = "Tu cuenta todavía no está vinculada a la app PropMatch";
const NOT_ADMIN_TEXT = "Solo los administradores de la inmobiliaria pueden publicar todas en la app";

/* ── Apertura del diálogo (compartida entre botón, tarjeta y aviso flotante) ── */

let dialogOpen = false;
const openListeners = new Set<() => void>();
function setDialogOpen(v: boolean) {
  dialogOpen = v;
  for (const l of openListeners) l();
}
function useDialogOpen() {
  return useSyncExternalStore(
    (l) => {
      openListeners.add(l);
      return () => openListeners.delete(l);
    },
    () => dialogOpen,
  );
}

/** Quién puede usarlo: cuenta vinculada + admin/dueño. */
function useBulkAccess() {
  const { appAgencyId, profile } = useStore();
  const isAdmin = profile.role === "owner" || profile.role === "admin";
  if (!appAgencyId) return { allowed: false, reason: NOT_LINKED_TEXT, agencyId: null };
  if (!isAdmin) return { allowed: false, reason: NOT_ADMIN_TEXT, agencyId: appAgencyId };
  return { allowed: true, reason: null, agencyId: appAgencyId };
}

/** URL pública de `property-photos/<agencia>/` (las fotos que ya son nuestras no se copian). */
function ownPhotoPrefix(agencyId: string): string {
  return supabase.storage.from("property-photos").getPublicUrl(`${agencyId}/x`).data.publicUrl.slice(0, -1);
}

/* ── Host ─────────────────────────────────────────────────────────────── */

async function copyPhotosViaApi(crmPropertyId: string, urls: string[]): Promise<CopyPhotosResponse> {
  const r = await integrationsApi.copyPhotos(crmPropertyId, urls);
  if (r.ok) return { ok: true, results: r.data.results, skipped: r.data.skipped };
  const status = r.error === "no_server" || r.error === "network" ? 0 : r.status;
  const message =
    r.status === 403
      ? NOT_ADMIN_TEXT
      : r.error === "not_found"
        ? "El servidor todavía no tiene la copia de fotos (falta desplegar esta versión)"
        : r.message;
  return { ok: false, status, message };
}

export function BulkAppSyncHost() {
  const { appAgencyId, photos, replacePropertyPhotos, publishPropertyToApp } = useStore();
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const open = useDialogOpen();
  const job = useBulkJob(appAgencyId);

  useEffect(() => {
    if (!appAgencyId) {
      setBulkDeps(null);
      return;
    }
    setBulkDeps({
      ownPrefix: ownPhotoPrefix(appAgencyId),
      photosOf: (id) => photosRef.current[id],
      copyPhotos: copyPhotosViaApi,
      replacePhotos: replacePropertyPhotos,
      publish: publishPropertyToApp,
    });
    return () => setBulkDeps(null);
  }, [appAgencyId, replacePropertyPhotos, publishPropertyToApp]);

  const active = job && (job.status === "running" || job.status === "paused" || job.status === "interrupted");
  const p = job ? jobProgress(job) : null;

  return (
    <>
      {active && !open && p && (
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="fixed z-40 right-4 lg:right-6 bottom-[calc(148px+env(safe-area-inset-bottom))] lg:bottom-24 flex items-center gap-2 px-4 py-2.5 rounded-full text-sm"
          style={{ background: "white", color: INK, fontWeight: 700, boxShadow: "var(--shadow-pop)", border: "1px solid #E9E5DE" }}
          aria-label={`Publicación en la app: ${p.done} de ${p.total}. Ver detalle`}
        >
          <span
            className={`w-2.5 h-2.5 rounded-full ${job.status === "running" ? "animate-pulse" : ""}`}
            style={{ background: job.status === "running" ? VIOLET : "#F59E0B" }}
            aria-hidden="true"
          />
          {job.kind === "refresh"
            ? job.status === "running"
              ? "Actualizando fotos en la app"
              : "Actualización de fotos en pausa"
            : job.status === "running"
              ? "Publicando en la app"
              : "Publicación en la app en pausa"}{" "}
          · {p.done}/{p.total}
        </button>
      )}
      {open && <PublishAllDialog onClose={() => setDialogOpen(false)} />}
    </>
  );
}

/* ── Botón y tarjeta ──────────────────────────────────────────────────── */

/**
 * Sin cuenta vinculada (o sin ser admin) se ve deshabilitado; al tocarlo igual
 * abre el diálogo con el motivo (un `title` solo no se ve en el celular).
 */
export function PublishAllToAppButton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const access = useBulkAccess();
  return (
    <button
      type="button"
      onClick={() => setDialogOpen(true)}
      aria-disabled={!access.allowed}
      title={access.reason ?? undefined}
      className={`${className ?? ""} ${access.allowed ? "" : "opacity-50"}`}
      style={style}
    >
      Publicar todas en la app
    </button>
  );
}

export function AppPropMatchCard() {
  const access = useBulkAccess();
  const { properties, photos } = useStore();
  const summary = useMemo(() => classifyForApp(properties, photos), [properties, photos]);
  return (
    <Card padded>
      <div className="flex items-start gap-3">
        <span
          className="w-10 h-10 rounded-xl flex items-center justify-center text-xs text-white flex-shrink-0"
          style={{ background: "var(--gradient-brand)", fontWeight: 800 }}
          aria-hidden="true"
        >
          PM
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm" style={{ color: INK, fontWeight: 700 }}>App PropMatch</p>
          {access.agencyId ? (
            <p className="text-sm mt-1" style={{ color: "#374151" }}>
              Cuenta vinculada. {summary.synced.length} propiedades ya están en la app y {summary.ready.length} están listas para subir.
            </p>
          ) : (
            <p className="text-sm mt-1" style={{ color: "#374151" }}>
              {NOT_LINKED_TEXT}. Mientras tanto, todo lo que cargás queda solo en el CRM.
            </p>
          )}
          <p className="text-xs mt-1" style={{ color: MUTED }}>
            Las propiedades en USD se publican en la app PropMatch para que las vean quienes buscan. Las fotos se copian al almacenamiento de PropMatch.
          </p>
          <div className="mt-3">
            <PublishAllToAppButton
              className="inline-flex items-center min-h-[44px] px-5 rounded-xl text-sm text-white"
              style={{ background: "var(--gradient-brand)", fontWeight: 700 }}
            />
          </div>
          {access.agencyId && access.reason && (
            <p className="mt-2 text-xs px-3 py-2 rounded-lg" style={{ background: "#F7F0FF", color: "#7C0BD8" }}>
              {access.reason}.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ── Diálogo ──────────────────────────────────────────────────────────── */

function PublishAllDialog({ onClose }: { onClose: () => void }) {
  const access = useBulkAccess();
  const job = useBulkJob(access.agencyId);
  const refresh = job?.kind === "refresh";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="pm-backdrop fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
      style={{ background: "rgba(8, 11, 31,0.35)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="publish-all-h"
    >
      <div
        className="pm-modal w-full sm:max-w-2xl max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{ background: "white", boxShadow: "var(--shadow-pop)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b flex items-center gap-3" style={{ borderColor: "#E9E5DE", background: "#FAF8F5" }}>
          <div className="flex-1 min-w-0">
            <p id="publish-all-h" className="text-lg tracking-tight" style={{ color: INK, fontWeight: 800 }}>
              {refresh ? "Actualizar las fotos en la app PropMatch" : "Publicar todas en la app PropMatch"}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
              {refresh
                ? "Vuelve a mandar, en tandas, las fotos de las propiedades que ya están en la app, con el logo como está configurado ahora."
                : "Sube en tandas las propiedades del CRM que todavía no están en la app."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-violet-50"
            style={{ color: "#6B7280", fontSize: 22 }}
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
          {!access.allowed ? (
            <p className="text-sm px-4 py-3 rounded-xl" style={{ background: "#F7F0FF", color: "#7C0BD8" }}>
              {access.reason}.
            </p>
          ) : job ? (
            <JobProgress />
          ) : (
            <Summary agencyId={access.agencyId!} />
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone: "ok" | "info" | "muted" }) {
  const c = tone === "ok" ? { bg: "#F0FDF4", fg: "#15803D" } : tone === "info" ? { bg: "#F7F0FF", fg: VIOLET } : { bg: "#F9FAFB", fg: "#4B5563" };
  return (
    <div className="flex-1 min-w-[120px] rounded-xl px-4 py-3" style={{ background: c.bg }}>
      <p className="text-2xl" style={{ color: c.fg, fontWeight: 800 }}>{value}</p>
      <p className="text-xs" style={{ color: c.fg, fontWeight: 600 }}>{label}</p>
    </div>
  );
}

function Summary({ agencyId }: { agencyId: string }) {
  const { properties, photos } = useStore();
  const summary = useMemo(() => classifyForApp(properties, photos), [properties, photos]);
  const [agreed, setAgreed] = useState(false);
  const photosToCopy = useMemo(
    () => {
      const own = ownPhotoPrefix(agencyId);
      return summary.ready.reduce((n, p) => n + externalPhotos(planPhotos(photos[p.id], own)).length, 0);
    },
    [summary, photos, agencyId],
  );
  const n = summary.ready.length;

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <Stat value={n} label="listas para subir" tone="ok" />
        <Stat value={summary.synced.length} label="ya están en la app" tone="info" />
        <Stat value={summary.ineligible.length} label="no van" tone="muted" />
      </div>

      {photosToCopy > 0 && (
        <p className="text-sm" style={{ color: "#374151" }}>
          Se van a copiar hasta {photosToCopy} fotos de otros sitios al almacenamiento de PropMatch, para que la app no dependa de esos sitios.
        </p>
      )}

      <NotGoingList summary={summary} />

      {n > 0 ? (
        <>
          <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "#FFFBEB", color: "#92400E" }} role="note">
            <p style={{ fontWeight: 700 }}>Antes de publicar</p>
            <p className="mt-1">
              Estas {n} propiedades van a aparecer en la app PropMatch para los usuarios que buscan: van a poder verlas, marcar «me interesa» y
              pedir visitas. Confirmá que la inmobiliaria está de acuerdo con publicarlas ahí.
            </p>
          </div>
          <label className="flex items-start gap-3 text-sm cursor-pointer" style={{ color: INK }}>
            <input type="checkbox" className="mt-1 w-4 h-4" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>La inmobiliaria está de acuerdo en publicar estas propiedades en la app PropMatch.</span>
          </label>
          <button
            type="button"
            disabled={!agreed || isRunning()}
            onClick={() => startJob(agencyId, summary.ready)}
            className="self-start inline-flex items-center min-h-[44px] px-5 rounded-xl text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "var(--gradient-brand)", fontWeight: 700 }}
          >
            Publicar {n} {n === 1 ? "propiedad" : "propiedades"}
          </button>
        </>
      ) : (
        <p className="text-sm" style={{ color: MUTED }}>
          No hay propiedades nuevas para subir. {summary.synced.length > 0 ? "Las que se pueden ya están en la app." : ""}
        </p>
      )}
    </>
  );
}

const REFRESH_STATUS_TEXT = {
  running: "Actualizando las fotos…",
  paused: "En pausa",
  interrupted: "Se interrumpió (se recargó o cerró la página). Podés retomarla desde donde quedó.",
  cancelled: "Cancelada. Las que ya se actualizaron quedan así en la app.",
  done: "¡Listo! Las fotos de la app quedaron al día.",
} as const;

const STATUS_TEXT = {
  running: "Publicando…",
  paused: "En pausa",
  interrupted: "Se interrumpió (se recargó o cerró la página). Podés retomarla desde donde quedó.",
  cancelled: "Cancelada. Lo que ya subió queda en la app.",
  done: "¡Listo!",
} as const;

/**
 * Las que no van a la app, con el motivo de cada una y un acceso para
 * completarlas (el multipublicador de la propiedad tiene los arreglos en línea).
 */
function NotGoingList({ summary, open = false, title }: { summary: BulkSummary; open?: boolean; title?: string }) {
  const navigate = useNavigate();
  if (summary.ineligible.length === 0) return null;
  const reasons = Object.entries(summary.reasonCounts) as [IneligibleReason, number][];
  const fixable = (r: IneligibleReason[]) => !r.includes("sample") && !r.includes("currency") && !r.includes("closed");
  return (
    <details className="rounded-xl border px-4 py-3" style={{ borderColor: "#E9E5DE" }} open={open}>
      <summary className="text-sm cursor-pointer" style={{ color: INK, fontWeight: 700 }}>
        {title ?? `Por qué no van ${summary.ineligible.length} propiedades`}
      </summary>
      <ul className="mt-2 text-sm space-y-1" style={{ color: "#374151" }}>
        {reasons.map(([r, count]) => (
          <li key={r}>
            <strong>{count}</strong> · {INELIGIBLE_LABEL[r]}
          </li>
        ))}
      </ul>
      <details className="mt-3" open={open}>
        <summary className="text-xs cursor-pointer" style={{ color: VIOLET, fontWeight: 700 }}>Ver cuáles son</summary>
        <ul className="mt-2 text-xs space-y-1.5 max-h-72 overflow-y-auto" style={{ color: MUTED }}>
          {summary.ineligible.slice(0, 500).map((p) => (
            <li key={p.id} className="flex flex-wrap items-baseline gap-x-2">
              <span style={{ color: INK, fontWeight: 600 }}>{p.title}</span>
              <span>— {p.reasons.map((r) => INELIGIBLE_LABEL[r]).join(" · ")}</span>
              {fixable(p.reasons) && (
                <button
                  type="button"
                  onClick={() => {
                    setDialogOpen(false);
                    navigate(`/publicador/${p.id}`);
                  }}
                  className="underline"
                  style={{ color: VIOLET, fontWeight: 700 }}
                >
                  Completar
                </button>
              )}
            </li>
          ))}
          {summary.ineligible.length > 500 && <li>… y {summary.ineligible.length - 500} más.</li>}
        </ul>
      </details>
      {summary.reasonCounts.currency ? (
        <p className="mt-3 text-xs" style={{ color: MUTED }}>
          Las propiedades en pesos siguen en el CRM y se pueden publicar en los portales; la app solo maneja USD.
        </p>
      ) : null}
    </details>
  );
}

function JobProgress() {
  const { appAgencyId, properties, photos } = useStore();
  const pending = useMemo(() => classifyForApp(properties, photos), [properties, photos]);
  const job = useBulkJob(appAgencyId);
  if (!job) return null;
  const p = jobProgress(job);
  const failed = failedIds(job);
  const finished = job.status === "done" || job.status === "cancelled";
  const refresh = job.kind === "refresh";
  const btn = "inline-flex items-center min-h-[44px] px-4 rounded-xl text-sm border hover:bg-violet-50";
  const btnStyle = { borderColor: "#E9E5DE", color: VIOLET, fontWeight: 600, background: "white" } as const;

  return (
    <>
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm" style={{ color: INK, fontWeight: 700 }} role="status" aria-live="polite">
            {(refresh ? REFRESH_STATUS_TEXT : STATUS_TEXT)[job.status]}
          </p>
          <p className="text-sm tabular-nums" style={{ color: INK, fontWeight: 700 }}>
            {p.done}/{p.total}
          </p>
        </div>
        <div
          className="mt-2 h-2.5 rounded-full overflow-hidden"
          style={{ background: "#E9E5DE" }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={p.total}
          aria-valuenow={p.done}
          aria-label="Propiedades procesadas"
        >
          <div className="h-full transition-all" style={{ width: `${p.pct}%`, background: "var(--gradient-brand)" }} />
        </div>
        <p className="mt-2 text-xs" style={{ color: MUTED }}>
          {p.ok} {refresh ? "actualizadas" : "subidas"} · {p.failed} fallidas
          {p.photoFailures > 0 ? ` · ${p.photoFailures} fotos no se pudieron copiar` : ""}
          {p.watermarkFailures > 0 ? ` · ${p.watermarkFailures} fotos fueron sin el logo` : ""}
        </p>
      </div>

      {job.lastError && (
        <p role="alert" className="text-sm px-4 py-3 rounded-xl" style={{ background: "#FFF1F2", color: "#BE123C" }}>
          Se frenó: {job.lastError}. Cuando esté resuelto, tocá «Retomar».
        </p>
      )}

      {!finished && (
        <p className="text-xs" style={{ color: MUTED }}>
          Podés cerrar esta ventana y seguir usando el CRM: sigue en segundo plano mientras no recargues la página. Si se recarga, la retomás desde acá.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {job.status === "running" && (
          <button type="button" className={btn} style={btnStyle} onClick={pauseJob}>Pausar</button>
        )}
        {(job.status === "paused" || job.status === "interrupted") && (
          <button
            type="button"
            className="inline-flex items-center min-h-[44px] px-5 rounded-xl text-sm text-white"
            style={{ background: "var(--gradient-brand)", fontWeight: 700 }}
            onClick={resumeJob}
          >
            {job.status === "paused" && isRunning() ? "Reanudar" : "Retomar"}
          </button>
        )}
        {!finished && (
          <button type="button" className={btn} style={{ ...btnStyle, color: "#BE123C" }} onClick={cancelJob}>Cancelar</button>
        )}
        {finished && failed.length > 0 && (
          <button
            type="button"
            className="inline-flex items-center min-h-[44px] px-5 rounded-xl text-sm text-white"
            style={{ background: "var(--gradient-brand)", fontWeight: 700 }}
            onClick={retryFailedJob}
          >
            Reintentar {failed.length} fallidas
          </button>
        )}
        {finished && (
          <button type="button" className={btn} style={btnStyle} onClick={clearJob}>{refresh ? "Listo" : "Nueva publicación"}</button>
        )}
      </div>

      {failed.length > 0 && (
        <details className="rounded-xl border px-4 py-3" style={{ borderColor: "#FECDD3" }} open={finished}>
          <summary className="text-sm cursor-pointer" style={{ color: "#BE123C", fontWeight: 700 }}>
            {failed.length} no se pudieron {refresh ? "actualizar" : "subir"}
          </summary>
          <ul className="mt-2 text-xs space-y-1 max-h-60 overflow-y-auto" style={{ color: MUTED }}>
            {failed.slice(0, 500).map((id) => (
              <li key={id}>
                <span style={{ color: INK, fontWeight: 600 }}>{job.titles[id] ?? id}</span> — {job.results[id]?.reason ?? "Error"}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Al terminar: las que quedaron afuera de la app y por qué. */}
      {finished && !refresh && (
        <NotGoingList
          summary={pending}
          open
          title={`${pending.ineligible.length} propiedades no se publicaron en la app`}
        />
      )}

      {p.photoFailures > 0 && (
        <details className="rounded-xl border px-4 py-3" style={{ borderColor: "#E9E5DE" }}>
          <summary className="text-sm cursor-pointer" style={{ color: INK, fontWeight: 700 }}>
            Propiedades con fotos que no se pudieron copiar
          </summary>
          <ul className="mt-2 text-xs space-y-1 max-h-48 overflow-y-auto" style={{ color: MUTED }}>
            {job.ids
              .filter((id) => (job.results[id]?.photoFailures ?? 0) > 0)
              .map((id) => (
                <li key={id}>
                  <span style={{ color: INK, fontWeight: 600 }}>{job.titles[id] ?? id}</span> — {job.results[id]?.photoFailures}{" "}
                  {job.results[id]?.photoFailures === 1 ? "foto" : "fotos"}
                </li>
              ))}
          </ul>
        </details>
      )}

      {p.photoFailures > 0 && (
        <p className="text-xs" style={{ color: MUTED }}>
          Las fotos que no se pudieron copiar no se mandaron a la app (la propiedad subió con el resto) y siguen en el CRM con su dirección original.
        </p>
      )}

      {p.watermarkFailures > 0 && (
        <p className="text-xs" style={{ color: MUTED }}>
          A las fotos que fueron sin el logo no se les pudo generar la copia: en la app se ve la original. Podés volver a intentarlo con «Actualizar las
          fotos en la app» (en Configuración → Marca).
        </p>
      )}
    </>
  );
}

/* ── «Actualizar las fotos en la app» ─────────────────────────────────── */

/**
 * Vuelve a mandar las fotos de las propiedades que YA están en la app (con o
 * sin logo, según la marca guardada). Se destaca cuando la marca cambió desde
 * la última actualización (`fingerprint` = huella de la marca guardada).
 */
export function UpdateAppPhotos({ fingerprint }: { fingerprint: string }) {
  const access = useBulkAccess();
  const { properties, photos } = useStore();
  const job = useBulkJob(access.agencyId);
  const synced = useMemo(() => classifyForApp(properties, photos).synced, [properties, photos]);
  if (!access.agencyId) return null;
  const pending = appliedFingerprint(access.agencyId) !== fingerprint;
  const busy = isRunning() || (!!job && (job.status === "running" || job.status === "paused" || job.status === "interrupted"));
  const n = synced.length;
  const warn = pending && n > 0;
  const before = n === 1 ? "la propiedad que ya está en la app sigue" : `las ${n} propiedades que ya están en la app siguen`;
  const upToDate = n === 1 ? "la propiedad que está" : `las ${n} propiedades que están`;

  return (
    <div
      className="rounded-xl px-4 py-3 grid gap-2"
      style={{ background: warn ? "#FFFBEB" : "#F9FAFB", color: warn ? "#92400E" : "#374151" }}
      role={warn ? "note" : undefined}
    >
      <p className="text-xs">
        {n === 0
          ? "Todavía no hay propiedades en la app: las que publiques desde ahora ya salen con esta configuración."
          : pending
            ? `Cambió el logo o esta opción desde la última vez: ${before} con las fotos de antes. Guardá la marca y actualizalas.`
            : `Las fotos de ${upToDate} en la app ya tienen esta configuración. Las que publiques o edites desde ahora también.`}
      </p>
      {n > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!access.allowed || busy}
            onClick={() => {
              startJob(access.agencyId!, synced, { kind: "refresh", fingerprint });
              setDialogOpen(true);
            }}
            className="min-h-9 px-3 rounded-lg text-xs border bg-white disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 700 }}
          >
            Actualizar las fotos en la app
          </button>
          {busy && <span className="text-xs">Hay una publicación en la app en curso: esperá a que termine.</span>}
          {!access.allowed && access.reason && <span className="text-xs">{access.reason}.</span>}
        </div>
      )}
    </div>
  );
}

/* ── Fila «App PropMatch» del multipublicador ─────────────────────────── */

/**
 * La app PropMatch como un canal más de una propiedad. Publica (o actualiza)
 * SOLO esta propiedad reutilizando el motor de «Publicar todas»: copia de
 * fotos externas, logo en las fotos si está activo, reintentos.
 */
export function AppChannelRow({ propertyId }: { propertyId: string }) {
  const access = useBulkAccess();
  const job = useBulkJob(access.agencyId);
  const { properties, photos } = useStore();
  const property = properties.find((p) => p.id === propertyId);
  if (!property) return null;

  const inJob = job && job.ids.includes(propertyId) ? job : null;
  const result = inJob?.results[propertyId];
  const working = (inJob?.status === "running" && !result) || property.sync_status === "syncing";
  const otherJobRunning = !inJob && isRunning();
  const reasons = property.is_sample ? [] : ineligibleReasons(property, photos[propertyId]);
  const inApp = !!property.app_property_id && !property.is_sample;

  let line: { text: string; color: string };
  if (property.is_sample) line = { text: "Es de ejemplo: no se publica", color: "#9CA3AF" };
  else if (!access.agencyId) line = { text: NOT_LINKED_TEXT, color: "#9CA3AF" };
  else if (working) line = { text: "Publicando en la app…", color: "#B45309" };
  else if (result && !result.ok) line = { text: `Error: ${result.reason ?? "no se pudo publicar"}`, color: "#BE123C" };
  else if (property.sync_status === "error") line = { text: "Error al sincronizar con la app", color: "#BE123C" };
  else if (inApp) line = { text: "Publicada en la app", color: "#15803D" };
  else if (reasons.length > 0)
    line = { text: `No va a la app: ${reasons.map((r: IneligibleReason) => INELIGIBLE_LABEL[r].toLowerCase()).join(", ")}`, color: "#9CA3AF" };
  else line = { text: "Sin publicar · lista para subir", color: "#9CA3AF" };

  const canAct = access.allowed && !property.is_sample && reasons.length === 0 && !working && !otherJobRunning;
  const disabledReason = !access.allowed
    ? access.reason
    : otherJobRunning
      ? "Hay una publicación en tanda en curso: esperá a que termine"
      : null;

  return (
    <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b" style={{ borderColor: "#F0EDE6" }}>
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-sm text-white"
        style={{ background: "var(--gradient-brand)", fontWeight: 800 }}
        aria-hidden="true"
      >
        PM
      </div>
      <div className="min-w-0 flex-1" style={{ minWidth: 160 }}>
        <p className="text-sm truncate" style={{ color: INK, fontWeight: 700 }}>App PropMatch</p>
        <p className="text-xs mt-0.5" style={{ color: line.color, fontWeight: 600 }}>{line.text}</p>
        {property.app_photo_notice && (
          <p className="text-xs mt-0.5" style={{ color: "#B45309" }}>{property.app_photo_notice}</p>
        )}
        {!canAct && disabledReason && !property.is_sample && (
          <p className="text-xs mt-0.5" style={{ color: MUTED }}>{disabledReason}</p>
        )}
      </div>
      {access.agencyId && !property.is_sample && reasons.length === 0 && (
        <button
          type="button"
          disabled={!canAct}
          onClick={() => startJob(access.agencyId!, [{ id: property.id, title: property.title || "(sin título)" }])}
          className="px-3 py-1.5 rounded-lg text-xs border hover:bg-violet-50 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ borderColor: "#E9E5DE", color: "#9B21FF", fontWeight: 700 }}
        >
          {working ? "Publicando…" : inApp ? "Actualizar en la app" : "Publicar en la app"}
        </button>
      )}
    </div>
  );
}
