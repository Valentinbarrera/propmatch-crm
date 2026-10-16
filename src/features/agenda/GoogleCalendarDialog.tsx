/**
 * «Google Calendar» en la Agenda: conectar la cuenta (sincronización al
 * instante, opción A) y/o suscribirse con un link (.ics, opción B).
 * Cada agente ve y maneja solo lo suyo.
 */
import { useEffect, useState } from "react";
import { useGoogleCalendar, type FeedController } from "@/lib/gcal/GoogleCalendarProvider";
import type { SyncController } from "@/lib/gcal/useGcalSync";

const INK = "#1A1A1A";
const MUTED = "#6B7280";

const fmtWhen = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;

export function GoogleCalendarDialog({ onClose }: { onClose: () => void }) {
  const { feed, sync } = useGoogleCalendar();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="pm-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      style={{ background: "rgba(8, 11, 31,0.35)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="gcal-dialog-title"
    >
      <div
        className="pm-modal rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden"
        style={{ background: "white", boxShadow: "var(--shadow-pop)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b flex items-center gap-3" style={{ borderColor: "#E9E5DE", background: "#FAF8F5" }}>
          <div className="flex-1 min-w-0">
            <h2 id="gcal-dialog-title" className="text-lg tracking-tight" style={{ color: INK, fontWeight: 800 }}>
              Google Calendar
            </h2>
            <p className="text-xs mt-0.5" style={{ color: MUTED }}>
              Tus visitas, eventos y tareas con fecha, en tu calendario de Google. Cada agente conecta el suyo.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="w-11 h-11 rounded-lg flex items-center justify-center transition-all hover:bg-violet-50"
            style={{ color: "#6B7280", fontSize: 22, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto space-y-6">
          <ConnectSection sync={sync} ret="agenda" />
          <hr style={{ borderColor: "#E9E5DE" }} />
          <FeedSection feed={feed} />
        </div>
      </div>
    </div>
  );
}

/** «hace 3 min», «hace 2 h», o la fecha. */
export function ago(iso: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const m = Math.round((now - Date.parse(iso)) / 60_000);
  if (m < 1) return "recién";
  if (m < 60) return `hace ${m} min`;
  if (m < 24 * 60) return `hace ${Math.round(m / 60)} h`;
  return fmtWhen(iso);
}

/** Motivos de vuelta del login de Google (?gcal=error&reason=…), en criollo. */
const RETURN_REASONS: Record<string, string> = {
  denied: "Cancelaste la autorización en Google.",
  expired: "La conexión tardó demasiado. Probá de nuevo.",
  state: "La respuesta de Google no coincidió con tu pedido. Probá de nuevo.",
  invalid: "La respuesta de Google llegó incompleta. Probá de nuevo.",
  token: "Google no entregó la autorización. Probá de nuevo en un rato.",
  scope: "No diste permiso para ver y editar los eventos del calendario. Volvé a conectar y dejá tildado ese permiso.",
  offline: "Google no dio permiso para mantener la conexión abierta. Probá de nuevo.",
  no_db: "Falta configurar la base del CRM.",
  save: "No pudimos guardar la conexión. Probá de nuevo en un rato.",
  google: "Google no pudo completar la autorización. Probá de nuevo.",
};

/** Aviso al volver del login de Google. Limpia los parámetros de la URL. */
export function useGcalReturnNotice(onConnected: () => void) {
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("gcal");
    if (!result) return;
    if (result === "ok") {
      setNotice({ ok: true, text: "¡Listo! Google Calendar quedó conectado. Tus visitas y tareas ya van a tu calendario." });
      onConnected();
    } else {
      setNotice({ ok: false, text: `No pudimos conectar Google Calendar. ${RETURN_REASONS[params.get("reason") ?? ""] ?? "Probá de nuevo en un rato."}` });
    }
    params.delete("gcal");
    params.delete("reason");
    const qs = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return [notice, () => setNotice(null)] as const;
}

/** Opción A: conexión directa. También se usa en Configuración → Integraciones. */
export function ConnectSection({ sync, ret }: { sync: SyncController; ret: "agenda" | "integraciones" }) {
  const primary = "min-h-11 px-4 rounded-xl text-sm text-white disabled:opacity-60";
  const outline = "min-h-11 px-4 rounded-xl text-sm border bg-white disabled:opacity-60 hover:bg-violet-50";
  const info = (text: string, warn = false) => (
    <p role="status" className="text-xs mt-3 px-3 py-2 rounded-lg" style={warn ? { background: "#FFFBEB", color: "#92400E" } : { background: "#F7F0FF", color: "#7C0BD8" }}>
      {text}
    </p>
  );
  const disconnect = () => {
    if (window.confirm("¿Desconectar Google Calendar? Lo que ya está en tu calendario queda ahí, pero deja de actualizarse.")) void sync.disconnect();
  };

  return (
    <section aria-labelledby={`gcal-connect-title-${ret}`}>
      <h3 id={`gcal-connect-title-${ret}`} className="text-sm" style={{ color: INK, fontWeight: 800 }}>
        Conectar Google Calendar
      </h3>
      <p className="text-xs mt-1" style={{ color: MUTED }}>
        Al instante y en los dos sentidos: lo que agendás acá aparece en tu Google Calendar, y si lo movés o lo borrás allá, cambia
        acá. Tus otros eventos de Google se ven en la Agenda como «Ocupado».
      </p>

      {sync.state === "loading" && <p className="text-xs mt-3" style={{ color: MUTED }}>Verificando…</p>}
      {sync.state === "demo" && info("En la demo no se conecta Google Calendar. Creá tu cuenta para usarlo.")}
      {sync.state === "hidden" && info("No está disponible en este entorno (o tu usuario todavía no está vinculado a una inmobiliaria).")}
      {sync.state === "no_db" && info("Falta configurar la base del CRM. Avisale al administrador (ver docs/google-calendar.md).", true)}
      {sync.state === "not_configured" &&
        info("Todavía no está disponible: falta dar de alta la app de Google (ver docs/google-calendar.md). Mientras, podés usar el link de suscripción.")}

      {sync.state === "not_connected" && (
        <button type="button" disabled={sync.syncing} onClick={() => void sync.connect(ret)} className={`${primary} mt-3`} style={{ background: "#9B21FF", fontWeight: 700 }}>
          {sync.syncing ? "Abriendo Google…" : "Conectar Google Calendar"}
        </button>
      )}

      {(sync.state === "needs_reauth" || sync.state === "error") && (
        <div className="mt-3 space-y-2">
          <p role="alert" className="text-xs px-3 py-2 rounded-lg" style={{ background: "#FFF1F2", color: "#BE123C", fontWeight: 600 }}>
            {sync.error ?? "Google desconectó PropMatch de tu cuenta. Volvé a conectar."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={sync.syncing} onClick={() => void sync.connect(ret)} className={primary} style={{ background: "#9B21FF", fontWeight: 700 }}>
              Volver a conectar
            </button>
            <button type="button" disabled={sync.syncing} onClick={disconnect} className={outline} style={{ borderColor: "#FECDD3", color: "#BE123C", fontWeight: 700 }}>
              Desconectar
            </button>
          </div>
        </div>
      )}

      {sync.state === "connected" && (
        <div className="mt-3 space-y-3">
          <dl className="text-xs grid gap-1" style={{ color: "#374151" }}>
            <div className="flex gap-1.5">
              <dt style={{ color: MUTED }}>Cuenta:</dt>
              <dd style={{ fontWeight: 700 }}>{sync.email ?? "conectada"}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt style={{ color: MUTED }}>Última sincronización:</dt>
              <dd>{sync.syncing ? "sincronizando…" : ago(sync.lastSyncAt) ?? "todavía no"}</dd>
            </div>
          </dl>
          {sync.error && (
            <p role="alert" className="text-xs px-3 py-2 rounded-lg" style={{ background: "#FFFBEB", color: "#92400E" }}>
              {sync.error}
            </p>
          )}
          <GcalPrefsToggles sync={sync} />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={sync.syncing} onClick={sync.syncNow} className={outline} style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 700 }}>
              Sincronizar ahora
            </button>
            <button type="button" disabled={sync.syncing} onClick={disconnect} className={outline} style={{ borderColor: "#FECDD3", color: "#BE123C", fontWeight: 700 }}>
              Desconectar
            </button>
          </div>
          <p className="text-[11px]" style={{ color: MUTED }}>
            Se escribe en tu calendario principal. Van tus visitas, eventos y tareas con fecha (no los datos de ejemplo). Sin precios ni
            notas internas.
          </p>
        </div>
      )}
    </section>
  );
}

export function GcalPrefsToggles({ sync }: { sync: SyncController }) {
  return (
    <div className="flex flex-col gap-1.5 text-xs" style={{ color: "#374151" }}>
      <label className="flex items-center gap-2 min-h-8">
        <input type="checkbox" checked={sync.prefs.showBusy} onChange={(e) => sync.setPrefs({ showBusy: e.target.checked })} className="w-4 h-4 accent-[#9B21FF]" />
        Mostrar mis otros eventos de Google
      </label>
      {sync.prefs.showBusy && (
        <label className="flex items-center gap-2 min-h-8 pl-6">
          <input type="checkbox" checked={sync.prefs.showTitles} onChange={(e) => sync.setPrefs({ showTitles: e.target.checked })} className="w-4 h-4 accent-[#9B21FF]" />
          Mostrar sus títulos (si no, solo «Ocupado»)
        </label>
      )}
    </div>
  );
}

/** Opción B: link de suscripción. También se usa en Configuración → Integraciones. */
export function FeedSection({ feed }: { feed: FeedController }) {
  const [copied, setCopied] = useState(false);
  const primary = "min-h-11 px-4 rounded-xl text-sm text-white disabled:opacity-60";
  const outline = "min-h-11 px-4 rounded-xl text-sm border bg-white disabled:opacity-60 hover:bg-violet-50";

  const copy = async () => {
    if (!feed.url) return;
    try {
      await navigator.clipboard.writeText(feed.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section aria-labelledby="gcal-feed-title">
      <h3 id="gcal-feed-title" className="text-sm" style={{ color: INK, fontWeight: 800 }}>
        Suscribir en Google Calendar
      </h3>
      <p className="text-xs mt-1" style={{ color: MUTED }}>
        Un link privado con tu agenda (30 días atrás y 6 meses adelante). Google lo actualiza cada varias horas; para que sea al
        instante, usá «Conectar Google Calendar» (cuando esté disponible). Va solo lo tuyo: título, horario, cliente, propiedad y
        dirección. Nada de precios ni notas internas.
      </p>

      {feed.state === "loading" && <p className="text-xs mt-3" style={{ color: MUTED }}>Verificando…</p>}
      {feed.state === "demo" && (
        <p className="text-xs mt-3 px-3 py-2 rounded-lg" style={{ background: "#F7F0FF", color: "#7C0BD8" }}>
          En la demo no se generan links. Creá tu cuenta para usarlo con tu agenda real.
        </p>
      )}
      {feed.state === "hidden" && (
        <p className="text-xs mt-3 px-3 py-2 rounded-lg" style={{ background: "#F7F0FF", color: "#7C0BD8" }}>
          No está disponible en este entorno (o tu usuario todavía no está vinculado a una inmobiliaria).
        </p>
      )}
      {feed.state === "no_db" && (
        <p role="status" className="text-xs mt-3 px-3 py-2 rounded-lg" style={{ background: "#FFFBEB", color: "#92400E" }}>
          Falta configurar la base del CRM. Avisale al administrador (ver docs/google-calendar.md).
        </p>
      )}

      {feed.state === "inactive" && (
        <button type="button" disabled={feed.busy} onClick={() => void feed.create()} className={`${primary} mt-3`} style={{ background: "#9B21FF", fontWeight: 700 }}>
          {feed.busy ? "Generando…" : "Generar mi link"}
        </button>
      )}

      {feed.state === "active" && (
        <div className="mt-3 space-y-3">
          {feed.url ? (
            <div className="flex gap-2">
              <input
                readOnly
                value={feed.url}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Link de suscripción"
                className="flex-1 min-w-0 min-h-11 px-3 rounded-xl text-xs border outline-none bg-white text-[#1A1A1A] border-[#E9E5DE] focus:border-[#9B21FF]"
              />
              <button type="button" onClick={() => void copy()} className={outline} style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 700 }}>
                {copied ? "¡Copiado!" : "Copiar"}
              </button>
            </div>
          ) : (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ background: "#F7F0FF", color: "#7C0BD8" }}>
              Tenés un link activo, pero lo generaste en otro navegador (lo mostramos una sola vez). Si no lo tenés a mano, generá uno
              nuevo.
            </p>
          )}
          <ol className="list-decimal pl-5 text-xs space-y-1" style={{ color: "#374151" }}>
            <li>Copiá el link. No lo compartas: quien lo tenga ve tu agenda.</li>
            <li>
              En Google Calendar (en la compu): <strong>Otros calendarios → + → Desde URL</strong> → pegá el link → «Agregar calendario».
            </li>
            <li>Listo. Aparece como «PropMatch — Mi agenda». En el celular se ve solo, con la misma cuenta.</li>
          </ol>
          <p className="text-xs" style={{ color: MUTED }}>
            {feed.eventCount} {feed.eventCount === 1 ? "evento" : "eventos"} en el link
            {feed.pushedAt ? ` · actualizado ${fmtWhen(feed.pushedAt)}` : ""}.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={feed.busy}
              onClick={() => {
                if (window.confirm("¿Generar un link nuevo? El anterior deja de andar y vas a tener que volver a suscribirte en Google Calendar.")) void feed.rotate();
              }}
              className={outline}
              style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 700 }}
            >
              Generar link nuevo
            </button>
            <button
              type="button"
              disabled={feed.busy}
              onClick={() => {
                if (window.confirm("¿Desactivar el link? Google deja de recibir tu agenda (lo ya suscripto queda sin actualizar).")) void feed.revoke();
              }}
              className={outline}
              style={{ borderColor: "#FECDD3", color: "#BE123C", fontWeight: 700 }}
            >
              Desactivar
            </button>
          </div>
        </div>
      )}

      {feed.error && (
        <p role="alert" className="text-xs mt-2" style={{ color: "#BE123C" }}>
          {feed.error}
        </p>
      )}
    </section>
  );
}
