/**
 * Configuración → Integraciones (/configuracion/integraciones).
 *
 * Cada inmobiliaria conecta SUS cuentas de portales con el flujo oficial de
 * cada uno (login del portal cuando existe). Acá ve, por portal: estado,
 * cuenta conectada, desde cuándo y el último problema, en lenguaje llano.
 * Solo los administradores conectan/desconectan; el resto ve el estado.
 * Nunca se muestran tokens, ids ni claves.
 */
import { useEffect, useId, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, Badge } from "@/components/ui/Card";
import { ChevronDownIcon, ChevronLeftIcon } from "@/components/ui/icons";
import { PORTALS, type PortalMeta } from "@/lib/integrations/registry";
import { useMetaConnection, type MetaConnection } from "@/features/propiedades/useMetaConnection";
import { MetaConnectButton } from "@/features/propiedades/MetaConnectButton";
import { integrationsApi, type PortalStatus } from "./api";
import { usePortalConnections } from "./usePortalConnections";
import { ArgenpropCredentialsForm } from "./ArgenpropCredentialsForm";
import { PortalLogo } from "./PortalLogo";
import { MeliImportButton } from "./MeliImportDialog";
import { LABEL, stateLabel } from "./labels";
import { AppPropMatchCard } from "@/features/appSync/PublishAllToApp";
import { GoogleCalendarCard } from "./GoogleCalendarCard";

const INK = "#1A1A1A";
const MUTED = "#6B7280";

/** Motivos de vuelta del login de Mercado Libre (?meli=error&reason=…), en criollo. */
const MELI_REASONS: Record<string, string> = {
  denied: "Cancelaste la autorización en Mercado Libre.",
  expired: "La conexión tardó demasiado. Probá de nuevo.",
  state: "La respuesta de Mercado Libre no coincidió con tu pedido. Probá de nuevo.",
  invalid: "La respuesta de Mercado Libre llegó incompleta. Probá de nuevo.",
  token: "Mercado Libre no entregó la autorización. Probá de nuevo en un rato; si sigue, avisanos.",
  offline: "Mercado Libre no dio permiso para mantener la conexión abierta. Avisanos para revisarlo.",
  in_use: "Esa cuenta de Mercado Libre ya está conectada a otra inmobiliaria en PropMatch.",
  identity: "No pudimos leer los datos de la cuenta de Mercado Libre. Probá de nuevo.",
  save: "No pudimos guardar la conexión. Probá de nuevo en un rato.",
};

/** Aviso al volver del login de un portal. Limpia los parámetros de la URL. */
function useReturnNotice(onConnected: () => void) {
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("meli");
    if (!result) return;
    if (result === "connected") {
      setNotice({ ok: true, text: "¡Listo! Mercado Libre quedó conectado. Ya podés publicar." });
      onConnected();
    } else {
      setNotice({ ok: false, text: `No pudimos conectar Mercado Libre. ${MELI_REASONS[params.get("reason") ?? ""] ?? "Probá de nuevo en un rato."}` });
    }
    params.delete("meli");
    params.delete("reason");
    const qs = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return notice;
}

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" }) : null);

export default function IntegracionesPage() {
  const navigate = useNavigate();
  const { loading, isAdmin, serverError, refresh, statusOf } = usePortalConnections();
  const meta = useMetaConnection();
  const notice = useReturnNotice(() => void refresh());

  return (
    <>
      <AppHeader title="Integraciones" subtitle="Conectá las cuentas de tu inmobiliaria en los portales." breadcrumb={["Configuración"]}>
        <button
          type="button"
          onClick={() => navigate("/configuracion")}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm border hover:bg-violet-50"
          style={{ borderColor: "#E9E5DE", color: "#9B21FF", fontWeight: 600, background: "white" }}
        >
          <ChevronLeftIcon size={14} color="#9B21FF" /> Configuración
        </button>
      </AppHeader>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-8 py-8 max-w-5xl flex flex-col gap-4">
          {notice && (
            <p role="status" className="text-sm px-4 py-3 rounded-xl" style={notice.ok ? { background: "#F0FDF4", color: "#15803D" } : { background: "#FFF1F2", color: "#BE123C" }}>
              {notice.text}
            </p>
          )}

          <Card padded>
            <p className="text-sm" style={{ color: INK, fontWeight: 700 }}>Cómo funciona</p>
            <ul className="mt-2 text-sm space-y-1.5 list-disc pl-5" style={{ color: "#374151" }}>
              <li>Cada portal se conecta una sola vez, con la cuenta de tu inmobiliaria. Tu contraseña la escribís en el portal, no acá.</li>
              <li>Después publicás cualquier propiedad en varios portales a la vez desde su ficha («Publicar en portales»).</li>
              <li>Podés desconectar cuando quieras: lo que ya está publicado sigue en el portal.</li>
            </ul>
            {!loading && !serverError && !isAdmin && (
              <p className="mt-3 text-xs px-3 py-2 rounded-lg" style={{ background: "#F7F0FF", color: "#7C0BD8" }}>
                Solo los administradores de la inmobiliaria pueden conectar o desconectar portales. Vos ves el estado.
              </p>
            )}
            {serverError && (
              <p role="alert" className="mt-3 text-xs px-3 py-2 rounded-lg" style={{ background: "#FFFBEB", color: "#92400E" }}>
                {serverError} Mostramos los portales, pero por ahora no se pueden conectar desde acá.
              </p>
            )}
          </Card>

          <AppPropMatchCard />

          <GoogleCalendarCard />

          <ul className="grid gap-4 grid-cols-1 lg:grid-cols-2 items-start" aria-busy={loading}>
            {PORTALS.map((p) => {
              const s = statusOf(p.id);
              if (!s) return null;
              return (
                <li key={p.id}>
                  <PortalCard meta={p} status={s} loading={loading} canManage={isAdmin && !serverError} metaConn={meta} onChanged={refresh} />
                </li>
              );
            })}
          </ul>

          <p className="text-xs" style={{ color: MUTED }}>
            ¿Querés publicar? Andá a <Link to="/publicador" className="underline" style={{ color: "#9B21FF", fontWeight: 700 }}>Publicaciones</Link> o
            abrí una propiedad y tocá «Publicar en portales».
          </p>
        </div>
      </div>
    </>
  );
}

function PortalCard({
  meta: p,
  status: s,
  loading,
  canManage,
  metaConn,
  onChanged,
}: {
  meta: PortalMeta;
  status: PortalStatus;
  loading: boolean;
  canManage: boolean;
  metaConn: MetaConnection;
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(false);
  const helpId = useId();

  // Meta (Facebook + Instagram) usa su propio flujo de conexión (login de Facebook en el navegador).
  const isMeta = p.id === "meta";
  const label = isMeta && metaConn.approvalPending ? LABEL.needs_approval : stateLabel(s);
  const connected = isMeta ? metaConn.connected : s.state === "connected";
  const account = isMeta ? metaConn.pageName : s.accountLabel;
  const unavailable = s.availability.state === "coming_soon" || s.availability.state === "not_configured";
  const reconnect = s.state === "needs_reauth" || s.state === "error";

  const connect = async () => {
    setError(null);
    if (p.id === "argenprop") return setForm(true);
    setBusy(true);
    const r = await integrationsApi.connect(p.id, "integraciones");
    if (!r.ok) {
      setBusy(false);
      return setError(r.message);
    }
    if (r.data.form) {
      setBusy(false);
      return setForm(true);
    }
    if (r.data.url) window.location.href = r.data.url;
    else setBusy(false);
  };

  const disconnect = async () => {
    const text =
      p.id === "argenprop"
        ? `¿Desconectar ${p.name}? Borramos las credenciales guardadas. Lo que ya está publicado sigue publicado.`
        : `¿Desconectar ${p.name}? Lo que ya está publicado sigue publicado, pero no vas a poder publicar ni actualizar desde PropMatch hasta volver a conectar.`;
    if (!window.confirm(text)) return;
    setError(null);
    setBusy(true);
    const r = await integrationsApi.disconnect(p.id);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    await onChanged();
  };

  const primary = "min-h-[44px] px-4 rounded-xl text-sm text-white disabled:opacity-60";
  const outline = "min-h-[44px] px-4 rounded-xl text-sm border bg-white disabled:opacity-60";

  return (
    <Card padded>
      <div className="flex items-start gap-3">
        <PortalLogo meta={p} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm" style={{ color: INK, fontWeight: 700 }}>{p.name}</h2>
            {loading ? (
              <span className="text-xs" style={{ color: MUTED }}>Verificando…</span>
            ) : (
              <Badge bg={label.bg} text={label.fg} size="xs">{label.text}</Badge>
            )}
          </div>
          <p className="text-xs mt-0.5" style={{ color: MUTED }}>{p.description}</p>
        </div>
      </div>

      {!loading && (
        <dl className="mt-3 text-xs grid gap-1" style={{ color: "#374151" }}>
          {connected && account && (
            <div className="flex gap-1.5"><dt style={{ color: MUTED }}>Cuenta:</dt><dd style={{ fontWeight: 700 }}>{account}</dd></div>
          )}
          {!isMeta && s.connectedAt && s.state !== "not_connected" && (
            <div className="flex gap-1.5"><dt style={{ color: MUTED }}>Conectada el</dt><dd>{fmtDate(s.connectedAt)}</dd></div>
          )}
          {s.lastError && s.state !== "connected" && (
            <div className="px-3 py-2 rounded-lg mt-1" style={{ background: "#FFF1F2", color: "#BE123C" }}>
              <dt className="sr-only">Último problema</dt>
              <dd>{s.lastError}</dd>
            </div>
          )}
          {s.state === "needs_reauth" && !s.lastError && (
            <dd className="px-3 py-2 rounded-lg mt-1" style={{ background: "#FFFBEB", color: "#92400E" }}>
              La conexión venció. Un administrador tiene que volver a conectar la cuenta.
            </dd>
          )}
          {s.availability.state !== "available" && !isMeta && (
            <dd className="px-3 py-2 rounded-lg mt-1" style={{ background: "#F7F0FF", color: "#7C0BD8" }}>{s.availability.reason}</dd>
          )}
        </dl>
      )}

      <div className="flex flex-col sm:flex-row gap-2 mt-4">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={helpId}
          onClick={() => setOpen((o) => !o)}
          className={`${outline} flex-1 flex items-center justify-center gap-2`}
          style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 700 }}
        >
          Cómo conectar
          <span style={{ transform: open ? "rotate(180deg)" : undefined, display: "inline-flex" }} aria-hidden="true">
            <ChevronDownIcon size={16} color="#7C0BD8" />
          </span>
        </button>

        {isMeta ? (
          <MetaConnectButton meta={metaConn} />
        ) : unavailable ? (
          <button type="button" disabled className="flex-1 min-h-[44px] px-4 rounded-xl text-sm cursor-not-allowed" style={{ background: "#F3F4F6", color: "#4B5563", fontWeight: 600 }}>
            {s.availability.state === "coming_soon" ? "Próximamente" : "No disponible"}
          </button>
        ) : !canManage ? (
          <p className="flex-1 text-xs self-center" style={{ color: "#4B5563" }}>
            {connected ? "Conectado por un administrador." : "Pedile a un administrador que lo conecte."}
          </p>
        ) : connected && !reconnect ? (
          <button type="button" disabled={busy} onClick={() => void disconnect()} className={`${outline} flex-1`} style={{ borderColor: "#FECDD3", color: "#BE123C", fontWeight: 700 }}>
            {busy ? "Desconectando…" : "Desconectar"}
          </button>
        ) : (
          <div className="flex-1 flex gap-2">
            <button type="button" disabled={busy || loading} onClick={() => void connect()} className={`${primary} flex-1`} style={{ background: "#9B21FF", fontWeight: 700 }}>
              {busy ? "Abriendo…" : reconnect ? "Reconectar" : `Conectar ${p.id === "mercadolibre" ? "Mercado Libre" : p.name}`}
            </button>
            {reconnect && (
              <button type="button" disabled={busy} onClick={() => void disconnect()} className={outline} style={{ borderColor: "#FECDD3", color: "#BE123C", fontWeight: 700 }}>
                Desconectar
              </button>
            )}
          </div>
        )}
      </div>
      {error && <p role="alert" className="text-xs mt-2" style={{ color: "#BE123C" }}>{error}</p>}

      {p.id === "mercadolibre" && connected && !reconnect && !loading && (
        <MeliImportButton
          className="mt-2 w-full min-h-[44px] px-4 rounded-xl text-sm border bg-white hover:bg-violet-50"
          style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 700 }}
        />
      )}

      {form && p.id === "argenprop" && (
        <ArgenpropCredentialsForm
          onCancel={() => setForm(false)}
          onSaved={async () => {
            setForm(false);
            await onChanged();
          }}
        />
      )}

      <div id={helpId} hidden={!open} className="mt-4 text-sm" style={{ color: "#374151" }}>
        <ol className="list-decimal pl-5 space-y-1.5">{p.help.map((h, i) => <li key={i}>{h}</li>)}</ol>
        {p.warning && <p className="mt-3 text-xs px-3 py-2 rounded-lg" style={{ background: "#FFFBEB", color: "#92400E" }}>{p.warning}</p>}
      </div>
    </Card>
  );
}
