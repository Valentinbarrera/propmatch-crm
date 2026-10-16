import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "@/data/store";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, Badge } from "@/components/ui/Card";
import {
    HomeIcon,
    PlusIcon,
    SearchIcon,
    AlertTriangleIcon,
    ChevronDownIcon,
    ArrowRightIcon,
    MapPinIcon,
    PropertiesIcon,
    CheckCircleIcon,
} from "@/components/ui/icons";
import { money } from "@/lib/format";
import type { Property, PublicationChannel } from "@/types/db";
import { EXTERNAL_CHANNELS, WEB_CHANNEL, usePublications, type ChannelInfo, type ChannelState } from "./usePublications";
import { INTEGRATION_GUIDES } from "./integrationGuides";
import { useMeliConnection } from "./useIntegrations";
import { PlatformPublishPicker } from "./PlatformPublishPicker";
import { useMetaConnection, type MetaConnection } from "./useMetaConnection";
import { MetaConnectButton } from "./MetaConnectButton";
import { WebPlatformCard } from "./WebPlatformCard";

type ConnectionStatus = "not_connected" | "connected" | "error" | "approval";

type MeliConnection = ReturnType<typeof useMeliConnection>;

const isMetaChannel = (c: PublicationChannel) => c === "facebook" || c === "instagram";

/** Mercado Libre y Meta (Facebook + Instagram, una sola conexión) tienen conector real; el resto sigue "sin conectar". */
function connectionOf(channel: PublicationChannel, meli: MeliConnection, meta: MetaConnection): ConnectionStatus {
    if (channel === "mercadolibre" && meli.connected) return "connected";
    if (channel === "mercadolibre" && meli.needsReauth) return "error";
    if (isMetaChannel(channel)) {
        if (meta.approvalPending) return "approval";
        // Instagram necesita además una cuenta profesional vinculada a la Página.
        if (meta.connected) return channel === "instagram" && !meta.hasInstagram ? "error" : "connected";
        if (meta.needsReauth) return "error";
    }
    return "not_connected";
}

const MELI_ERROR_REASONS: Record<string, string> = {
    denied: "Cancelaste la autorización en Mercado Libre.",
    expired: "La conexión tardó demasiado. Probá de nuevo.",
    state: "La respuesta de Mercado Libre no coincidió con tu pedido. Probá de nuevo.",
    invalid: "La respuesta de Mercado Libre llegó incompleta. Probá de nuevo.",
    token: "Mercado Libre no entregó la autorización. Revisá que la URL de redirección de la app coincida.",
    offline: "La app de Mercado Libre no tiene el permiso offline_access: sin él la conexión se corta a las 6 horas.",
    in_use: "Esa cuenta de Mercado Libre ya está conectada a otra inmobiliaria en PropMatch.",
    identity: "No pudimos leer los datos de la cuenta de Mercado Libre.",
    save: "No pudimos guardar la conexión. ¿Está aplicada la migración de agency_integrations?",
};

/** Aviso al volver del login de Mercado Libre (?meli=connected|error). Limpia el parámetro de la URL. */
function useMeliReturnNotice(onDone: () => void) {
    const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const result = params.get("meli");
        if (!result) return;
        if (result === "connected") {
            setNotice({ ok: true, text: "Mercado Libre quedó conectado." });
            onDone();
        } else if (result === "error") {
            const reason = MELI_ERROR_REASONS[params.get("reason") ?? ""];
            setNotice({ ok: false, text: `No pudimos conectar Mercado Libre. ${reason ?? "Probá de nuevo en un rato."}` });
        }
        params.delete("meli");
        params.delete("reason");
        const qs = params.toString();
        window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return notice;
}

const CONNECTION_LABEL: Record<ConnectionStatus, { text: string; bg: string; fg: string }> = {
    not_connected: { text: "Sin conectar", bg: "#F3F4F6", fg: "#4B5563" },
    connected: { text: "Conectado", bg: "#DCFCE7", fg: "#15803D" },
    error: { text: "Error de conexión", bg: "#FFE4E6", fg: "#BE123C" },
    approval: { text: "Requiere aprobación de Meta", bg: "#FEF3C7", fg: "#92400E" },
};

type StatusFilter = "all" | "unpublished" | "queued" | "error" | "published";

const FILTERS: { id: StatusFilter; label: string }[] = [
    { id: "all", label: "Todas" },
    { id: "unpublished", label: "Sin publicar" },
    { id: "queued", label: "En cola" },
    { id: "error", label: "Con error" },
    { id: "published", label: "Publicadas" },
];

const LILA = "#6B7280";
const INK = "#1A1A1A";

const CONNECTABLE_CHANNELS = new Set<string>([]);

function scrollToId(id: string, focus?: boolean) {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    if (focus) (el as HTMLElement).focus({ preventScroll: true });
}

function externalOf(channels: ChannelState[]) {
    return channels.filter(c => c.info.channel !== "web");
}

export default function MultipublicadorPage() {
    const { properties, photos } = useStore();
    const { channelsOf, loading, error: saveError } = usePublications();
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState<StatusFilter>("all");
    const searchRef = useRef<HTMLInputElement>(null);
    const meli = useMeliConnection();
    const meta = useMetaConnection();
    const meliNotice = useMeliReturnNotice(() => scrollToId("plataformas"));
    /** Plataforma desde la que se abrió «Publicar una propiedad». */
    const [picker, setPicker] = useState<ChannelInfo | null>(null);
    /** «Ver mis avisos» de una plataforma: la lista muestra solo lo que tiene algo en ese canal. */
    const [channelFilter, setChannelFilter] = useState<ChannelInfo | null>(null);
    const statusIn = (p: Property, ch: PublicationChannel) => channelsOf(p).find(c => c.info.channel === ch)?.status ?? null;
    const countsIn = (ch: PublicationChannel) => {
        const c = { published: 0, paused: 0, error: 0 };
        for (const p of properties) {
            const st = statusIn(p, ch);
            if (st === "published") c.published++;
            else if (st === "paused") c.paused++;
            else if (st === "error") c.error++;
        }
        return c;
    };

    const webCounts = useMemo(() => {
        const c = { visible: 0, hidden: 0, unavailable: 0, unsynced: 0 };
        for (const p of properties) {
            const st = statusIn(p, "web");
            if (st === "published") c.visible++;
            else if (st === "removed") c.hidden++;
            else if (st === "paused") c.unavailable++;
            else c.unsynced++;
        }
        return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [properties, channelsOf]);

    // La web es un canal propio: no cuenta para estos totales de portales.
    const rows = useMemo(
        () =>
            properties.map(p => {
                const ext = externalOf(channelsOf(p));
                return {
                    p,
                    published: ext.filter(c => c.status === "published"),
                    queued: ext.filter(c => c.status === "pending"),
                    errored: ext.filter(c => c.status === "error"),
                };
            }),
        [properties, channelsOf],
    );

    const stats = useMemo(
        () => ({
            withChannel: rows.filter(r => r.published.length + r.queued.length > 0).length,
            published: rows.reduce((n, r) => n + r.published.length, 0),
            errors: rows.reduce((n, r) => n + r.errored.length, 0),
        }),
        [rows],
    );

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return rows.filter(r => {
            if (q) {
                const hay = [r.p.title, r.p.zone, r.p.province, r.p.id].filter(Boolean).join(" ").toLowerCase();
                if (!hay.includes(q)) return false;
            }
            if (channelFilter && !statusIn(r.p, channelFilter.channel)) return false;
            switch (filter) {
                case "unpublished": return r.published.length + r.queued.length + r.errored.length === 0;
                case "queued": return r.queued.length > 0;
                case "error": return r.errored.length > 0;
                case "published": return r.published.length > 0;
                default: return true;
            }
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, query, filter, channelFilter]);

    function goToList(next?: StatusFilter) {
        if (next) setFilter(next);
        scrollToId("listado-propiedades");
        if (!next) searchRef.current?.focus({ preventScroll: true });
    }

    return (
        <>
            <AppHeader
                title="Multipublicador"
                subtitle="Publicá tus propiedades en los portales desde un solo lugar."
                breadcrumb={["Publicaciones"]}
            />

            <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-10">
                {saveError && (
                    <p role="alert" className="mt-6 text-sm px-4 py-3 rounded-xl" style={{ background: "#FFF1F2", color: "#BE123C" }}>
                        No se pudieron guardar las publicaciones: {saveError}
                    </p>
                )}

                {meliNotice && (
                    <p
                        role="status"
                        className="mt-6 text-sm px-4 py-3 rounded-xl"
                        style={meliNotice.ok ? { background: "#F0FDF4", color: "#15803D" } : { background: "#FFF1F2", color: "#BE123C" }}
                    >
                        {meliNotice.text}
                    </p>
                )}

                {/* Accesos directos */}
                <section aria-label="Accesos directos" className="mt-6 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                    <Link
                        to="/propiedades/nueva?publicar=1"
                        className="sm:col-span-2 lg:col-span-2 rounded-2xl p-5 flex items-center gap-4 text-white min-h-[88px] transition-all hover:opacity-95 active:scale-[0.99]"
                        style={{ background: "var(--gradient-brand)", boxShadow: "var(--shadow-cta)" }}
                    >
                        <span className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.2)" }} aria-hidden="true">
                            <PlusIcon size={24} color="white" />
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block text-lg" style={{ fontWeight: 800 }}>Subir y publicar propiedad nueva</span>
                            <span className="block text-sm mt-0.5" style={{ opacity: 0.95 }}>Cargala y elegí en qué portales sale, en dos pasos.</span>
                        </span>
                        <ArrowRightIcon size={20} color="white" />
                    </Link>

                    <ActionTile
                        icon={<SearchIcon size={20} color="#9B21FF" />}
                        title="Publicar una existente"
                        help="Buscala en tu cartera y elegí canales."
                        onClick={() => goToList()}
                    />
                    <div className="grid gap-3 grid-cols-1">
                        {stats.errors > 0 && (
                            <ActionTile
                                icon={<AlertTriangleIcon size={20} color="#BE123C" />}
                                title={`Resolver errores (${stats.errors})`}
                                help="Mostrá solo lo que falló."
                                tone="danger"
                                onClick={() => goToList("error")}
                            />
                        )}
                        <ActionTile
                            icon={<PropertiesIcon size={20} color="#9B21FF" />}
                            title="Conectar plataformas"
                            help="Mirá qué necesita cada portal."
                            onClick={() => scrollToId("plataformas")}
                        />
                    </div>
                </section>

                {/* Métricas reales */}
                <section aria-label="Resumen" className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Metric loading={loading} value={stats.withChannel} label="Propiedades en algún portal" sub={stats.withChannel === 0 ? "Todavía no publicaste ninguna." : `de ${properties.length} en tu cartera`} />
                    <Metric loading={loading} value={stats.published} label="Publicaciones activas" sub={stats.published === 0 ? "Sin canales conectados todavía." : "En portales externos"} />
                    <Metric loading={loading} value={stats.errors} label="Errores a resolver" sub={stats.errors === 0 ? "No hay errores." : "Requieren tu atención"} danger={stats.errors > 0} />
                </section>

                {/* Plataformas */}
                <section id="plataformas" aria-labelledby="plataformas-h" className="mt-8 scroll-mt-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 id="plataformas-h" className="text-xl tracking-tight" style={{ color: INK, fontWeight: 800 }}>Plataformas</h2>
                        <Link
                            to="/configuracion/integraciones"
                            className="inline-flex items-center min-h-[44px] px-4 rounded-xl text-sm border bg-white"
                            style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 700 }}
                        >
                            Administrar conexiones
                        </Link>
                    </div>
                    <p className="text-sm mt-1 mb-4" style={{ color: "#6B7280" }}>
                        Publicá tus propiedades en múltiples portales desde un solo lugar. Las integraciones están en proceso de certificación y aprobación.
                    </p>
                    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 items-start">
                        {EXTERNAL_CHANNELS.filter(info => CONNECTABLE_CHANNELS.has(info.channel)).map(info => (
                            <PlatformCard
                                key={info.channel}
                                info={info}
                                meli={meli}
                                meta={meta}
                                counts={countsIn(info.channel)}
                                onPublish={() => setPicker(info)}
                                onViewAds={() => {
                                    setChannelFilter(info);
                                    setFilter("all");
                                    scrollToId("listado-propiedades");
                                }}
                            />
                        ))}
                        <WebPlatformCard
                            counts={webCounts}
                            onViewAds={() => {
                                setChannelFilter(WEB_CHANNEL);
                                setFilter("all");
                                scrollToId("listado-propiedades");
                            }}
                        />
                    </div>

                    {/* Portales próximamente */}
                    <div className="mt-6">
                        <p className="text-sm mb-3" style={{ color: "#6B7280", fontWeight: 600 }}>Próximamente</p>
                        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 items-start">
                            {EXTERNAL_CHANNELS.filter(info => !CONNECTABLE_CHANNELS.has(info.channel)).map(info => (
                                <ComingSoonPortalCard key={info.channel} info={info} />
                            ))}
                        </div>
                    </div>
                </section>

                {/* Listado */}
                <section id="listado-propiedades" aria-labelledby="listado-h" className="mt-8 scroll-mt-4">
                    <Card>
                        <div className="px-4 md:px-6 py-5 border-b" style={{ borderColor: "#F0EDE6" }}>
                            <h2 id="listado-h" className="text-xl tracking-tight" style={{ color: INK, fontWeight: 800 }}>Tus propiedades</h2>
                            {channelFilter && (
                                <p className="mt-2 text-sm flex flex-wrap items-center gap-2" style={{ color: "#4B5563" }}>
                                    Mostrando solo lo publicado en <strong style={{ color: INK }}>{channelFilter.name}</strong>
                                    <button
                                        type="button"
                                        onClick={() => setChannelFilter(null)}
                                        className="min-h-[36px] px-3 rounded-full text-xs border"
                                        style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 700 }}
                                    >
                                        Ver todas ✕
                                    </button>
                                </p>
                            )}
                            <div className="mt-4 flex flex-col lg:flex-row gap-3 lg:items-center">
                                <label className="relative flex-1 min-w-0">
                                    <span className="sr-only">Buscar propiedad por título, zona o ID</span>
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"><SearchIcon size={16} color={LILA} /></span>
                                    <input
                                        ref={searchRef}
                                        type="search"
                                        value={query}
                                        onChange={e => setQuery(e.target.value)}
                                        placeholder="Buscar por título, zona o ID"
                                        className="w-full min-h-[44px] pl-9 pr-3 rounded-xl border text-sm bg-white"
                                        style={{ borderColor: "#DDD8CF", color: INK }}
                                    />
                                </label>
                                <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
                                    {FILTERS.map(f => (
                                        <button
                                            key={f.id}
                                            type="button"
                                            aria-pressed={filter === f.id}
                                            onClick={() => setFilter(f.id)}
                                            className="min-h-[44px] px-4 rounded-xl text-sm border transition-colors"
                                            style={
                                                filter === f.id
                                                    ? { background: "#9B21FF", borderColor: "#9B21FF", color: "white", fontWeight: 700 }
                                                    : { background: "white", borderColor: "#DDD8CF", color: "#374151", fontWeight: 600 }
                                            }
                                        >
                                            {f.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {loading ? (
                            <ul aria-busy="true" aria-label="Cargando propiedades">
                                {[0, 1, 2].map(i => (
                                    <li key={i} className="px-4 md:px-6 py-4 flex items-center gap-4 border-b last:border-b-0" style={{ borderColor: "#FAF8F5" }}>
                                        <div className="w-16 h-16 rounded-xl animate-pulse motion-reduce:animate-none" style={{ background: "#F7F0FF" }} />
                                        <div className="flex-1 space-y-2">
                                            <div className="h-4 w-2/3 rounded animate-pulse motion-reduce:animate-none" style={{ background: "#F7F0FF" }} />
                                            <div className="h-3 w-1/3 rounded animate-pulse motion-reduce:animate-none" style={{ background: "#F7F0FF" }} />
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : properties.length === 0 ? (
                            <ListEmpty
                                title="Todavía no cargaste propiedades"
                                description="Subí la primera y publicala en los portales en un solo flujo."
                                cta={<NewPropertyLink />}
                            />
                        ) : visible.length === 0 ? (
                            <ListEmpty
                                title="No hay propiedades con ese criterio"
                                description="Probá con otra búsqueda o mostrá todas."
                                cta={
                                    <button
                                        type="button"
                                        onClick={() => { setQuery(""); setFilter("all"); }}
                                        className="min-h-[44px] px-5 rounded-xl text-sm border"
                                        style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 700 }}
                                    >
                                        Limpiar filtros
                                    </button>
                                }
                            />
                        ) : (
                            <ul>
                                {visible.map(r => (
                                    <PropertyRow key={r.p.id} {...r} photo={(photos[r.p.id] || [])[0]} />
                                ))}
                            </ul>
                        )}
                    </Card>
                </section>
            </div>
            {picker && (
                <PlatformPublishPicker
                    info={picker}
                    statusOf={p => statusIn(p, picker.channel)}
                    onClose={() => setPicker(null)}
                />
            )}
        </>
    );
}

function NewPropertyLink() {
    return (
        <Link
            to="/propiedades/nueva?publicar=1"
            className="inline-flex items-center gap-2 min-h-[44px] px-5 rounded-xl text-sm text-white"
            style={{ background: "var(--gradient-brand)", fontWeight: 700, boxShadow: "var(--shadow-cta)" }}
        >
            <PlusIcon size={16} color="white" /> Subir y publicar propiedad nueva
        </Link>
    );
}

function ListEmpty({ title, description, cta }: { title: string; description: string; cta: ReactNode }) {
    return (
        <div className="flex flex-col items-center text-center px-6 py-12 gap-3">
            <span className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "#F7F0FF" }} aria-hidden="true">
                <HomeIcon size={24} color="#9B21FF" />
            </span>
            <p style={{ color: INK, fontWeight: 700 }}>{title}</p>
            <p className="text-sm max-w-sm" style={{ color: "#6B7280" }}>{description}</p>
            {cta}
        </div>
    );
}

function ActionTile({
    icon, title, help, onClick, tone,
}: { icon: ReactNode; title: string; help: string; onClick: () => void; tone?: "danger" }) {
    const danger = tone === "danger";
    return (
        <button
            type="button"
            onClick={onClick}
            className="w-full text-left rounded-2xl p-4 border flex items-center gap-3 min-h-[72px] bg-white transition-all hover:shadow-md active:scale-[0.99]"
            style={{ borderColor: danger ? "#FECDD3" : "#E9E5DE", boxShadow: "var(--shadow-card)" }}
        >
            <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: danger ? "#FFF1F2" : "#F7F0FF" }} aria-hidden="true">
                {icon}
            </span>
            <span className="min-w-0">
                <span className="block text-sm" style={{ color: danger ? "#BE123C" : INK, fontWeight: 700 }}>{title}</span>
                <span className="block text-xs mt-0.5" style={{ color: "#6B7280" }}>{help}</span>
            </span>
        </button>
    );
}

function Metric({ value, label, sub, loading, danger }: { value: number; label: string; sub: string; loading: boolean; danger?: boolean }) {
    // Un cero no se muestra como logro: se atenúa y el texto aclara el motivo.
    const empty = value === 0;
    return (
        <div className="rounded-2xl border p-4 bg-white" style={{ borderColor: "#E9E5DE", boxShadow: "var(--shadow-card)" }}>
            {loading ? (
                <div className="h-8 w-16 rounded-lg animate-pulse motion-reduce:animate-none" style={{ background: "#F7F0FF" }} />
            ) : (
                <p style={{ fontWeight: 800, fontSize: "1.5rem", color: danger ? "#BE123C" : empty ? "#6B7280" : INK }}>{value}</p>
            )}
            <p className="text-sm" style={{ color: "#4B5563", fontWeight: 600 }}>{label}</p>
            {!loading && <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>{sub}</p>}
        </div>
    );
}

type ChannelCounts = { published: number; paused: number; error: number };

const PORTAL_NOTES: Partial<Record<string, string>> = {
    mercadolibre: "Certificación de la app en proceso con MercadoLibre.",
    argenprop: "Solicitud de integración enviada · en análisis.",
    zonaprop: "Integración en negociación con el portal.",
    cabaprop: "Integración en gestión con el Colegio.",
    facebook: "App Review de Meta pendiente de aprobación.",
    instagram: "App Review de Meta pendiente de aprobación.",
};

function ComingSoonPortalCard({ info }: { info: ChannelInfo }) {
    const guide = INTEGRATION_GUIDES[info.channel];
    const logoText = info.color === "#FFE600" ? "#1F2937" : "white";
    return (
        <Card padded>
            <div className="flex items-start gap-3">
                <span
                    className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-sm opacity-70"
                    style={{ background: info.color, color: logoText, fontWeight: 800 }}
                    aria-hidden="true"
                >
                    {info.short}
                </span>
                <div className="min-w-0 flex-1">
                    <h3 className="text-sm" style={{ color: INK, fontWeight: 700 }}>{info.name}</h3>
                    <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>{guide.tagline}</p>
                </div>
            </div>
            <div className="mt-3">
                <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs"
                    style={{ background: "#F7F0FF", color: "#9B21FF", fontWeight: 700 }}
                >
                    <span style={{ fontSize: 10 }}>⏳</span> Próximamente
                </span>
            </div>
            {PORTAL_NOTES[info.channel] && (
                <p className="text-xs mt-2" style={{ color: "#9CA3AF" }}>
                    {PORTAL_NOTES[info.channel]}
                </p>
            )}
        </Card>
    );
}

function PlatformCard({
    info,
    meli,
    meta,
    counts,
    onPublish,
    onViewAds,
}: {
    info: ChannelInfo;
    meli: MeliConnection;
    meta: MetaConnection;
    counts: ChannelCounts;
    onPublish: () => void;
    onViewAds: () => void;
}) {
    const isConnected = connectionOf(info.channel, meli, meta) === "connected";
    const [open, setOpen] = useState(false);
    const panelId = useId();
    const guide = INTEGRATION_GUIDES[info.channel];
    const conn = CONNECTION_LABEL[connectionOf(info.channel, meli, meta)];
    // Texto oscuro sobre amarillo (ML) para mantener contraste en el logo.
    const logoText = info.color === "#FFE600" ? "#1F2937" : "white";

    return (
        <Card padded>
            <div className="flex items-start gap-3">
                <span
                    className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-sm"
                    style={{ background: info.color, color: logoText, fontWeight: 800 }}
                    aria-hidden="true"
                >
                    {info.short}
                </span>
                <div className="min-w-0 flex-1">
                    <h3 className="text-sm" style={{ color: INK, fontWeight: 700 }}>{info.name}</h3>
                    <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>{guide.tagline}</p>
                </div>
            </div>

            <div className="flex flex-wrap gap-1.5 mt-3">
                <Badge bg={conn.bg} text={conn.fg}>{conn.text}</Badge>
                {/* Sin "dificultad" ni "en validación": son notas internas, no para la inmobiliaria. */}
            </div>
            {info.channel === "instagram" && meta.connected && !meta.hasInstagram && (
                <p className="text-xs mt-2" style={{ color: "#BE123C" }}>
                    Tu Página no tiene una cuenta de Instagram profesional vinculada. Vinculala desde Instagram (Configuración → Cuenta → Compartir en otras apps) y volvé a conectar.
                </p>
            )}
            {info.channel === "instagram" && isConnected && (
                <p className="text-xs mt-2" style={{ color: "#4B5563" }}>
                    Instagram no permite borrar publicaciones por API: si querés sacar una, borrala desde la app.
                </p>
            )}
            {guide.recommendation && !isConnected && <p className="text-xs mt-2" style={{ color: "#4B5563" }}>{guide.recommendation}</p>}
            {isConnected && (
                <>
                    <p className="text-xs mt-2" style={{ color: "#4B5563" }}>
                        {counts.published} publicadas · {counts.paused} pausadas · {counts.error} con error
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2 mt-3">
                        <button
                            type="button"
                            onClick={onPublish}
                            className="flex-1 min-h-[44px] px-4 rounded-xl text-sm text-white"
                            style={{ background: "var(--gradient-brand)", fontWeight: 700 }}
                        >
                            + Publicar una propiedad
                        </button>
                        <button
                            type="button"
                            onClick={onViewAds}
                            className="flex-1 min-h-[44px] px-4 rounded-xl text-sm border bg-white"
                            style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 700 }}
                        >
                            Ver mis avisos
                        </button>
                    </div>
                </>
            )}

            <div className="flex flex-col sm:flex-row gap-2 mt-4">
                <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => setOpen(o => !o)}
                    className="flex-1 min-h-[44px] px-4 rounded-xl text-sm border flex items-center justify-center gap-2"
                    style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 700, background: "white" }}
                >
                    Cómo conectar
                    <span style={{ transform: open ? "rotate(180deg)" : undefined, display: "inline-flex" }} aria-hidden="true">
                        <ChevronDownIcon size={16} color="#7C0BD8" />
                    </span>
                </button>
                {isMetaChannel(info.channel) ? <MetaConnectButton meta={meta} /> : <ConnectButton info={info} meli={meli} />}
            </div>

            <div id={panelId} hidden={!open} className="mt-4 text-sm" style={{ color: "#374151" }}>
                {guide.estimatedTime && <p className="text-xs mb-2" style={{ color: LILA, fontWeight: 600 }}>Tiempo estimado: {guide.estimatedTime}</p>}
                {guide.needs.length > 0 && (
                    <>
                        <p style={{ fontWeight: 700, color: INK }}>Qué necesitás</p>
                        <ul className="list-disc pl-5 mb-3 space-y-1">{guide.needs.map((n, i) => <li key={i}>{n}</li>)}</ul>
                    </>
                )}
                <p style={{ fontWeight: 700, color: INK }}>Pasos</p>
                <ol className="list-decimal pl-5 space-y-1">{guide.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
                {guide.warning && (
                    <p className="mt-3 text-xs px-3 py-2 rounded-lg" style={{ background: "#FFFBEB", color: "#92400E" }}>{guide.warning}</p>
                )}
            </div>
        </Card>
    );
}

function ConnectButton({ info, meli }: { info: ChannelInfo; meli: MeliConnection }) {
    const [busy, setBusy] = useState(false);
    const isMeli = info.channel === "mercadolibre";
    const disabledStyle = { background: "#F3F4F6", color: "#4B5563", fontWeight: 600 };

    if (!isMeli || (!meli.loading && !meli.configured)) {
        return (
            <button type="button" disabled className="flex-1 min-h-[44px] px-4 rounded-xl text-sm cursor-not-allowed" style={disabledStyle}>
                Conectar · Próximamente
            </button>
        );
    }
    if (meli.loading) {
        return (
            <button type="button" disabled className="flex-1 min-h-[44px] px-4 rounded-xl text-sm cursor-wait" style={disabledStyle}>
                Verificando…
            </button>
        );
    }

    const run = async (fn: () => Promise<void>) => {
        setBusy(true);
        try { await fn(); } finally { setBusy(false); }
    };

    return (
        <div className="flex-1 flex flex-col gap-1.5 min-w-0">
            {meli.needsReauth && !meli.connected && (
                <p className="text-xs" style={{ color: "#BE123C", fontWeight: 700 }}>
                    La conexión venció: volvé a conectar la cuenta.
                </p>
            )}
            {meli.connected ? (
                <>
                    <p className="text-xs" style={{ color: "#15803D", fontWeight: 700 }}>
                        Conectada{meli.nickname ? ` · ${meli.nickname}` : ""}
                    </p>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                            if (window.confirm("¿Desconectar Mercado Libre? Dejás de poder publicar desde PropMatch hasta volver a conectarla.")) {
                                void run(meli.disconnect);
                            }
                        }}
                        className="min-h-[44px] px-4 rounded-xl text-sm border disabled:opacity-60"
                        style={{ borderColor: "#FECDD3", color: "#BE123C", background: "white", fontWeight: 700 }}
                    >
                        Desconectar
                    </button>
                </>
            ) : (
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(meli.connect)}
                    className="min-h-[44px] px-4 rounded-xl text-sm text-white disabled:opacity-60"
                    style={{ background: "#9B21FF", fontWeight: 700 }}
                >
                    {meli.needsReauth ? "Reconectar Mercado Libre" : "Conectar Mercado Libre"}
                </button>
            )}
            {meli.error && <p role="alert" className="text-xs" style={{ color: "#BE123C" }}>{meli.error}</p>}
        </div>
    );
}

function ChannelChip({ c }: { c: ChannelState }) {
    const style =
        c.status === "error"
            ? { background: "#FFF1F2", borderColor: "#FECDD3", color: "#BE123C" }
            : c.status === "pending"
              ? { background: "#FFFBEB", borderColor: "#FDE68A", color: "#92400E" }
              : { background: "#F0FDF4", borderColor: "#BBF7D0", color: "#15803D" };
    const state = c.status === "error" ? "con error" : c.status === "pending" ? "en cola" : "publicada";
    return (
        <span className="text-xs px-2 py-1 rounded-md border inline-flex items-center gap-1" style={{ ...style, fontWeight: 700 }}>
            {c.status === "error" ? <AlertTriangleIcon size={12} color="#BE123C" /> : c.status === "published" ? <CheckCircleIcon size={12} color="#15803D" /> : null}
            {c.info.name}
            <span className="sr-only"> ({state})</span>
            {c.status === "pending" && <span aria-hidden="true">· en cola</span>}
            {c.status === "error" && <span aria-hidden="true">· error</span>}
        </span>
    );
}

function PropertyRow({
    p, photo, published, queued, errored,
}: { p: Property; photo?: string; published: ChannelState[]; queued: ChannelState[]; errored: ChannelState[] }) {
    const navigate = useNavigate();
    const chips = [...errored, ...queued, ...published];
    const manage = chips.length > 0;
    return (
        <li
            className="px-4 md:px-6 py-4 border-b last:border-b-0 flex flex-col md:flex-row md:items-center gap-3 md:gap-5"
            style={{ borderColor: "#FAF8F5" }}
        >
            <div className="flex items-center gap-4 min-w-0 md:w-[38%]">
                <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0" style={{ background: "#F7F0FF" }}>
                    {photo ? (
                        <img src={photo} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center"><HomeIcon size={20} color="#BF7FFF" /></div>
                    )}
                </div>
                <div className="min-w-0">
                    <p className="text-sm truncate" style={{ color: INK, fontWeight: 700 }}>{p.title}</p>
                    <p className="text-xs mt-0.5 flex items-center gap-1 min-w-0" style={{ color: "#6B7280" }}>
                        <MapPinIcon size={12} color={LILA} />
                        <span className="truncate">{[p.zone, p.province].filter(Boolean).join(", ") || "Sin ubicación"}</span>
                    </p>
                    <p className="text-sm mt-0.5" style={{ color: INK, fontWeight: 700 }}>{money(p.price, p.currency)}</p>
                </div>
            </div>

            <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
                {chips.length === 0 ? (
                    <span className="text-xs" style={{ color: "#6B7280" }}>Sin publicar en portales</span>
                ) : (
                    chips.map(c => <ChannelChip key={c.info.channel} c={c} />)
                )}
            </div>

            <button
                type="button"
                onClick={() => navigate(`/publicador/${p.id}`)}
                aria-label={`${manage ? "Gestionar" : "Publicar"} ${p.title}`}
                className="min-h-[44px] px-5 rounded-xl text-sm border md:ml-auto transition-colors hover:bg-violet-50"
                style={
                    manage
                        ? { borderColor: "#DDD8CF", color: "#7C0BD8", background: "white", fontWeight: 700 }
                        : { borderColor: "#9B21FF", color: "white", background: "#9B21FF", fontWeight: 700 }
                }
            >
                {manage ? "Gestionar" : "Publicar"}
            </button>
        </li>
    );
}
