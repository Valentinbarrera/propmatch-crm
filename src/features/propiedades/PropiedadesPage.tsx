import { useMemo, useState } from "react";
import { SampleBadge } from "@/components/ui/SampleBadge";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { StatCard } from "@/components/ui/StatCard";
import { FilterDropdown, FilterTabs } from "@/components/ui/FilterTabs";
import { EmptyState } from "@/components/ui/states";
import { Badge } from "@/components/ui/Card";
import {
  AgendaIcon,
  ContactsIcon,
  HomeIcon,
  MapPinIcon,
  MatchesIcon,
  MatchesSolidIcon,
  StarIcon,
} from "@/components/ui/icons";
import { useStore, isLinkedAgencyId } from "@/data/store";
import { MeliImportButton } from "@/features/integraciones/MeliImportDialog";
import { PublishAllToAppButton } from "@/features/appSync/PublishAllToApp";
import { ZONES } from "@/data/seed";
import { useAgencyBrand } from "@/lib/branding";
import { PhotoLogoOverlay } from "@/features/branding/PhotoLogoOverlay";
import {
  PROPERTY_STATUS_LABEL,
  PROPERTY_STATUS_STYLE,
  PROPERTY_TYPE_LABEL,
  money,
  relativeTime,
} from "@/lib/format";
import type { OperationType, Property, PropertyStatus, PropertyType } from "@/types/db";

const TYPE_OPTIONS = (Object.keys(PROPERTY_TYPE_LABEL) as PropertyType[]).map((t) => ({
  value: t,
  label: PROPERTY_TYPE_LABEL[t],
}));
const ZONE_OPTIONS = ZONES.map((z) => ({ value: z, label: z }));
const STATUS_OPTIONS = (Object.keys(PROPERTY_STATUS_LABEL) as PropertyStatus[]).map((s) => ({
  value: s,
  label: PROPERTY_STATUS_LABEL[s],
}));
const PRICE_OPTIONS = [
  { value: "0-100000", label: "Hasta USD 100.000" },
  { value: "100000-180000", label: "USD 100.000 – 180.000" },
  { value: "180000-250000", label: "USD 180.000 – 250.000" },
  { value: "250000-", label: "Más de USD 250.000" },
];
const ROOM_OPTIONS = [
  { value: "2", label: "2 o más" },
  { value: "3", label: "3 o más" },
  { value: "4", label: "4 o más" },
  { value: "5", label: "5 o más" },
];

export default function PropiedadesPage() {
  const navigate = useNavigate();
  const { properties, matches, coverPhoto, updateProperty, agency, isDemo } = useStore();

  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [operation, setOperation] = useState<OperationType>("venta");
  const [type, setType] = useState<PropertyType | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  const [price, setPrice] = useState<string | null>(null);
  const [rooms, setRooms] = useState<string | null>(null);
  const [status, setStatus] = useState<PropertyStatus | null>(null);

  /** Cuántas personas compatibles tiene cada propiedad, y el mejor score. */
  const matchStats = useMemo(() => {
    const map = new Map<string, { count: number; best: number }>();
    for (const m of matches) {
      const cur = map.get(m.property_id) ?? { count: 0, best: 0 };
      map.set(m.property_id, { count: cur.count + 1, best: Math.max(cur.best, m.score) });
    }
    return map;
  }, [matches]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const [minStr, maxStr] = price?.split("-") ?? [];
    const priceMin = minStr ? Number(minStr) : null;
    const priceMax = maxStr ? Number(maxStr) : null;

    return properties.filter((p) => {
      if (p.operation !== operation) return false;
      if (type && p.type !== type) return false;
      if (zone && p.zone !== zone) return false;
      if (status && p.status !== status) return false;
      if (rooms && (p.rooms ?? 0) < Number(rooms)) return false;
      if (priceMin !== null && (p.price ?? 0) < priceMin) return false;
      if (priceMax !== null && (p.price ?? 0) > priceMax) return false;
      if (q) {
        const haystack = `${p.title} ${p.zone ?? ""} ${p.locality ?? ""} ${p.features.join(" ")}`;
        if (!haystack.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [properties, operation, type, zone, status, rooms, price, query]);

  const stats = useMemo(() => {
    const active = properties.filter((p) => p.status === "disponible");
    const monthAgo = Date.now() - 30 * 86_400_000;
    const newThisMonth = properties.filter((p) => new Date(p.created_at).getTime() > monthAgo);
    const withInterest = properties.filter((p) => (matchStats.get(p.id)?.count ?? 0) > 0);
    return { active, newThisMonth, withInterest, totalMatches: matches.length };
  }, [properties, matchStats, matches]);

  const total = Math.max(1, properties.length);

  return (
    <>
      <AppHeader
        title="Propiedades"
        subtitle="Gestioná todas tus propiedades desde un solo lugar."
        search={{ placeholder: "Buscar propiedad...", value: query, onChange: setQuery }}
        action={{ label: "Nueva propiedad", onClick: () => navigate("/propiedades/nueva") }}
      >
        <button
          onClick={() => navigate("/importar?tipo=propiedades")}
          className="px-4 py-2.5 rounded-xl text-sm border transition-all hover:bg-violet-50 whitespace-nowrap"
          style={{ borderColor: "#E9E5DE", color: "#9B21FF", fontWeight: 600, background: "white" }}
        >
          Importar Excel
        </button>
        {isLinkedAgencyId(agency.id) && (
          <MeliImportButton
            className="px-4 py-2.5 rounded-xl text-sm border transition-all hover:bg-violet-50 whitespace-nowrap"
            style={{ borderColor: "#E9E5DE", color: "#9B21FF", fontWeight: 600, background: "white" }}
          />
        )}
        {!isDemo && (
          <PublishAllToAppButton
            className="px-4 py-2.5 rounded-xl text-sm border transition-all hover:bg-violet-50 whitespace-nowrap"
            style={{ borderColor: "#E9E5DE", color: "#9B21FF", fontWeight: 600, background: "white" }}
          />
        )}
      </AppHeader>

      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-8">
        {/* KPIs — calculados sobre la cartera, no escritos a mano */}
        <div className="hidden md:grid mt-8 grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            value={String(stats.active.length)}
            label="Propiedades activas"
            sub={`${properties.length} en total`}
            icon={<HomeIcon size={22} color="#9B21FF" />}
            iconBg="#F7F0FF"
            badge={`${Math.round((stats.active.length / total) * 100)}%`}
            bar="var(--gradient-brand-h)"
            barWidth={(stats.active.length / total) * 100}
          />
          <StatCard
            value={String(stats.newThisMonth.length)}
            label="Nuevas este mes"
            sub="Últimos 30 días"
            icon={<HomeIcon size={22} color="#FF5ECA" />}
            iconBg="#FFF1FA"
            badge={`+${stats.newThisMonth.length}`}
            bar="linear-gradient(90deg, #FF5ECA, #FF7ED5)"
            barWidth={(stats.newThisMonth.length / total) * 100}
          />
          <StatCard
            value={String(stats.withInterest.length)}
            label="Con interesados"
            sub={`${stats.totalMatches} matches en total`}
            icon={<ContactsIcon size={22} color="#A855FF" />}
            iconBg="#F7F0FF"
            badge={String(stats.totalMatches)}
            badgeBg="#F7F0FF"
            badgeText="#9B21FF"
            bar="linear-gradient(90deg, #A855FF, #BF7FFF)"
            barWidth={(stats.withInterest.length / total) * 100}
          />
          <StatCard
            value={money(stats.active.reduce((sum, p) => sum + (p.price ?? 0), 0))}
            label="Valor de la cartera"
            sub="Propiedades disponibles"
            icon={<AgendaIcon size={22} color="#A855FF" />}
            iconBg="#F7F0FF"
            badge="Activo"
            badgeBg="#EFF6FF"
            badgeText="#2563EB"
            bar="linear-gradient(90deg, #A855FF, #FF5ECA)"
            barWidth={80}
          />
        </div>

        {/* Barra de filtros. En el prototipo estos desplegables no abrían nada. */}
        <div className="mt-7 flex items-center gap-3 flex-wrap">
          <FilterTabs
            size="lg"
            value={operation}
            onChange={setOperation}
            options={[
              { value: "venta", label: "Comprar" },
              { value: "alquiler", label: "Alquilar" },
            ]}
          />

          <div className="w-px h-6" style={{ background: "#E9E5DE" }} />

          <FilterDropdown label="Tipo" options={TYPE_OPTIONS} value={type} onChange={setType} />
          <FilterDropdown label="Zona" options={ZONE_OPTIONS} value={zone} onChange={setZone} />
          <FilterDropdown label="Precio" options={PRICE_OPTIONS} value={price} onChange={setPrice} />
          <FilterDropdown label="Ambientes" options={ROOM_OPTIONS} value={rooms} onChange={setRooms} />
          <FilterDropdown label="Estado" options={STATUS_OPTIONS} value={status} onChange={setStatus} />

          <div className="flex-1" />

          <span className="text-sm whitespace-nowrap" style={{ color: "#6B7280" }}>
            <span style={{ color: "#1A1A1A", fontWeight: 600 }}>{filtered.length}</span> propiedades
          </span>

          <div className="flex items-center gap-0.5 p-1 rounded-xl" style={{ background: "#F7F0FF" }}>
            <ViewToggle mode="grid" active={viewMode === "grid"} onClick={() => setViewMode("grid")} />
            <ViewToggle mode="list" active={viewMode === "list"} onClick={() => setViewMode("list")} />
          </div>
        </div>

        {stats.totalMatches > 0 && <MatchBanner total={stats.totalMatches} />}

        {filtered.length === 0 ? (
          <EmptyState
            icon={<HomeIcon size={24} color="#9B21FF" />}
            title={properties.length === 0 ? "Todavía no cargaste propiedades" : "Sin resultados"}
            description={
              properties.length === 0
                ? "Cargá la primera y el sistema le va a buscar interesados automáticamente."
                : "Probá aflojando los filtros o cambiando la búsqueda."
            }
            action={
              properties.length === 0
                ? { label: "Cargar una propiedad", onClick: () => navigate("/propiedades/nueva") }
                : undefined
            }
          />
        ) : viewMode === "grid" ? (
          <div className="pm-stagger mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filtered.map((p) => (
              <PropertyCard
                key={p.id}
                property={p}
                photo={coverPhoto(p.id)}
                stats={matchStats.get(p.id)}
                onOpen={() => navigate(`/propiedades/${p.id}`)}
                onToggleFeatured={() => updateProperty(p.id, { is_featured: !p.is_featured })}
              />
            ))}
          </div>
        ) : (
          <PropertyList
            properties={filtered}
            coverPhoto={coverPhoto}
            matchStats={matchStats}
            onOpen={(id) => navigate(`/propiedades/${id}`)}
            onToggleFeatured={(id, value) => updateProperty(id, { is_featured: value })}
          />
        )}
      </div>
    </>
  );
}

function ViewToggle({
  mode,
  active,
  onClick,
}: {
  mode: "grid" | "list";
  active: boolean;
  onClick: () => void;
}) {
  const color = active ? "#9B21FF" : "#BF7FFF";
  return (
    <button
      onClick={onClick}
      aria-label={mode === "grid" ? "Ver en grilla" : "Ver en lista"}
      className="w-8 h-8 flex items-center justify-center rounded-lg transition-all"
      style={active ? { background: "white", boxShadow: "0 1px 4px rgba(168, 85, 255,0.15)" } : {}}
    >
      {mode === "grid" ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="8" height="8" rx="1.5" stroke={color} strokeWidth="2" />
          <rect x="13" y="3" width="8" height="8" rx="1.5" stroke={color} strokeWidth="2" />
          <rect x="3" y="13" width="8" height="8" rx="1.5" stroke={color} strokeWidth="2" />
          <rect x="13" y="13" width="8" height="8" rx="1.5" stroke={color} strokeWidth="2" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path
            d="M8 6H21M8 12H21M8 18H21M3 6H3.01M3 12H3.01M3 18H3.01"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}

function MatchBanner({ total }: { total: number }) {
  const navigate = useNavigate();
  return (
    <div
      className="mt-5 rounded-2xl px-6 py-4 flex items-center justify-between gap-4 overflow-hidden relative flex-wrap"
      style={{
        background: "linear-gradient(135deg, #F7F0FF 0%, #F7F0FF 50%, #FFF1FA 100%)",
        border: "1px solid #E9E5DE",
      }}
    >
      <div
        className="absolute right-32 top-0 w-24 h-24 rounded-full opacity-20 pointer-events-none"
        style={{ background: "var(--gradient-brand)", filter: "blur(20px)" }}
      />
      <div
        className="absolute right-0 bottom-0 w-32 h-32 rounded-full opacity-10 pointer-events-none"
        style={{ background: "#FF5ECA", filter: "blur(24px)" }}
      />

      <div className="flex items-center gap-4 relative z-10">
        <div className="relative flex-shrink-0">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{
              background: "var(--gradient-brand)",
              boxShadow: "0 4px 16px rgba(168, 85, 255,0.35)",
            }}
          >
            <MatchesSolidIcon size={22} />
          </div>
          <span
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-white"
            style={{ background: "#FF5ECA", fontSize: "8px", fontWeight: 800 }}
          >
            ✦
          </span>
        </div>

        <div>
          <p className="text-base" style={{ color: "#1A1A1A", fontWeight: 700 }}>
            Encontramos personas compatibles
          </p>
          <p className="text-sm mt-0.5" style={{ color: "#6B7280" }}>
            <span className="text-gradient-brand-h" style={{ fontWeight: 800 }}>
              {total} matches
            </span>{" "}
            entre tu cartera y los contactos que ya tenés cargados
          </p>
        </div>
      </div>

      <button
        onClick={() => navigate("/matches")}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm text-white transition-all hover:opacity-90 active:scale-95 relative z-10 flex-shrink-0"
        style={{ background: "var(--gradient-brand)", fontWeight: 600, boxShadow: "var(--shadow-cta)" }}
      >
        <MatchesSolidIcon size={14} />
        Ver matches
      </button>
    </div>
  );
}

function PropertyCard({
  property: p,
  photo,
  stats,
  onOpen,
  onToggleFeatured,
}: {
  property: Property;
  photo: string | null;
  stats?: { count: number; best: number };
  onOpen: () => void;
  onToggleFeatured: () => void;
}) {
  const statusStyle = PROPERTY_STATUS_STYLE[p.status];
  const { photoLogo } = useAgencyBrand();

  return (
    <div
      onClick={onOpen}
      className="rounded-2xl border overflow-hidden flex flex-col cursor-pointer group transition-all hover:shadow-xl"
      style={{ background: "white", borderColor: "#E9E5DE", boxShadow: "var(--shadow-card-lg)" }}
    >
      <div className="relative h-48 overflow-hidden" style={{ background: "#F7F0FF" }}>
        {photo ? (
          <img
            src={photo}
            alt={p.title}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <HomeIcon size={36} color="#DDD8CF" />
          </div>
        )}
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to top, rgba(8, 11, 31,0.35) 0%, transparent 60%)" }}
        />
        {/* Solo visual (CSS): la foto no se toca. Arriba van estado y estrella; abajo a la izquierda, «Publicada…». */}
        {photo && <PhotoLogoOverlay logo={photoLogo} avoid={["top-left", "top-right", "bottom-left"]} />}

        <div className="absolute top-3 left-3">
          <span
            className="text-xs px-2.5 py-1 rounded-full border backdrop-blur-sm"
            style={{
              background: `${statusStyle.bg}CC`,
              color: statusStyle.text,
              borderColor: statusStyle.border,
              fontWeight: 600,
              fontSize: "11px",
            }}
          >
            {PROPERTY_STATUS_LABEL[p.status]}
          </span>
        </div>

        <div className="absolute top-3 right-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFeatured();
            }}
            aria-label={p.is_featured ? "Quitar de destacadas" : "Destacar propiedad"}
            className="w-7 h-7 rounded-lg flex items-center justify-center backdrop-blur-sm transition-all"
            style={{ background: p.is_featured ? "var(--gradient-brand)" : "rgba(255,255,255,0.85)" }}
          >
            <StarIcon size={12} color={p.is_featured ? "white" : "#9CA3AF"} />
          </button>
        </div>

        <div className="absolute bottom-3 left-3">
          <span
            className="text-xs backdrop-blur-sm rounded-lg px-2 py-1"
            style={{
              background: "rgba(255,255,255,0.85)",
              color: "#6B7280",
              fontWeight: 500,
              fontSize: "11px",
            }}
          >
            Publicada {relativeTime(p.published_at).toLowerCase()}
          </span>
        </div>
      </div>

      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-2 mb-2">
          <Badge bg="#F7F0FF" text="#9B21FF" size="xs">
            {PROPERTY_TYPE_LABEL[p.type]}
          </Badge>
          <span className="text-lg tracking-tight" style={{ color: "#1A1A1A", fontWeight: 800 }}>
            {money(p.price, p.currency)}
          </span>
        </div>

        <h3 className="text-sm leading-snug mb-1" style={{ color: "#1A1A1A", fontWeight: 700 }}>
          {p.title} <SampleBadge record={p} />
        </h3>

        <div className="flex items-center gap-1 mb-3">
          <MapPinIcon />
          <span className="text-xs" style={{ color: "#6B7280" }}>
            {[p.zone, p.province].filter(Boolean).join(", ")}
          </span>
        </div>

        <div className="flex flex-wrap gap-1 mb-3">
          {p.features.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: "#FAF8F5", color: "#9CA3AF", fontWeight: 500 }}
            >
              {tag}
            </span>
          ))}
        </div>

        <div
          className="flex items-center gap-3 pt-3 pb-3 border-t border-b mt-auto"
          style={{ borderColor: "#F0EDE6" }}
        >
          <Spec value={p.rooms} unit="amb." />
          <Spec value={p.bedrooms} unit="dorm." />
          <Spec value={p.surface_total} unit="m²" />
        </div>

        <div className="pt-3 flex items-center justify-between gap-2">
          {stats ? (
            <>
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: "var(--gradient-brand)" }}
                >
                  <MatchesSolidIcon size={11} />
                </div>
                <span className="text-xs truncate" style={{ color: "#6B7280" }}>
                  <span className="text-gradient-brand-h" style={{ fontWeight: 700 }}>
                    {stats.count} {stats.count === 1 ? "persona" : "personas"}
                  </span>{" "}
                  compatibles
                </span>
              </div>
              <div
                className="text-xs px-2.5 py-1 rounded-full flex-shrink-0"
                style={{
                  background: "var(--gradient-soft)",
                  border: "1px solid #E9E5DE",
                  color: "#9B21FF",
                  fontWeight: 700,
                }}
              >
                {stats.best}% MATCH
              </div>
            </>
          ) : (
            <span className="text-xs" style={{ color: "#6B7280" }}>
              Sin interesados compatibles todavía
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Spec({ value, unit }: { value: number | null; unit: string }) {
  if (value === null) return null;
  return (
    <span className="text-xs" style={{ color: "#374151" }}>
      <strong style={{ color: "#1A1A1A", fontWeight: 700 }}>{value}</strong> {unit}
    </span>
  );
}

function PropertyList({
  properties,
  coverPhoto,
  matchStats,
  onOpen,
  onToggleFeatured,
}: {
  properties: Property[];
  coverPhoto: (id: string) => string | null;
  matchStats: Map<string, { count: number; best: number }>;
  onOpen: (id: string) => void;
  onToggleFeatured: (id: string, value: boolean) => void;
}) {
  return (
    <div
      className="mt-6 rounded-2xl border overflow-hidden overflow-x-auto"
      style={{ borderColor: "#E9E5DE", boxShadow: "var(--shadow-card)" }}
    >
      <table className="w-full bg-white" style={{ minWidth: 900 }}>
        <thead>
          <tr style={{ background: "#FAF8F5", borderBottom: "1px solid #F0EDE6" }}>
            {["Propiedad", "Tipo", "Precio", "Detalles", "Estado", "Matches", ""].map((h, i) => (
              <th
                key={h || `col-${i}`}
                className="text-left px-5 py-3.5 text-xs uppercase tracking-wide whitespace-nowrap"
                style={{ color: "#6B7280", letterSpacing: "0.06em", fontWeight: 600 }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {properties.map((p, idx) => {
            const stats = matchStats.get(p.id);
            const statusStyle = PROPERTY_STATUS_STYLE[p.status];
            const photo = coverPhoto(p.id);
            return (
              <tr
                key={p.id}
                onClick={() => onOpen(p.id)}
                className="transition-all hover:bg-violet-50 cursor-pointer"
                style={{ borderBottom: idx < properties.length - 1 ? "1px solid #FAF8F5" : undefined }}
              >
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0"
                      style={{ background: "#F7F0FF" }}
                    >
                      {photo && (
                        <img src={photo} alt="" loading="lazy" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm truncate" style={{ color: "#1A1A1A", fontWeight: 600 }}>
                        {p.title} <SampleBadge record={p} />
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <MapPinIcon size={10} />
                        <span className="text-xs" style={{ color: "#6B7280" }}>
                          {p.zone}
                        </span>
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <Badge bg="#F7F0FF" text="#9B21FF" size="xs">
                    {PROPERTY_TYPE_LABEL[p.type]}
                  </Badge>
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <span className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                    {money(p.price, p.currency)}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <div
                    className="flex items-center gap-3 text-xs whitespace-nowrap"
                    style={{ color: "#6B7280" }}
                  >
                    {p.rooms !== null && (
                      <span>
                        <strong style={{ color: "#1A1A1A" }}>{p.rooms}</strong> amb.
                      </span>
                    )}
                    {p.bedrooms !== null && (
                      <span>
                        <strong style={{ color: "#1A1A1A" }}>{p.bedrooms}</strong> dorm.
                      </span>
                    )}
                    {p.surface_total !== null && (
                      <span>
                        <strong style={{ color: "#1A1A1A" }}>{p.surface_total}</strong> m²
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <Badge bg={statusStyle.bg} text={statusStyle.text} border={statusStyle.border}>
                    {PROPERTY_STATUS_LABEL[p.status]}
                  </Badge>
                </td>
                <td className="px-5 py-3.5">
                  {stats ? (
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <span className="text-sm text-gradient-brand-h" style={{ fontWeight: 700 }}>
                        {stats.count}
                      </span>
                      <span className="text-xs" style={{ color: "#6B7280" }}>
                        personas
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs" style={{ color: "#DDD8CF" }}>
                      —
                    </span>
                  )}
                </td>
                <td className="px-5 py-3.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFeatured(p.id, !p.is_featured);
                    }}
                    aria-label="Destacar propiedad"
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-violet-100"
                    style={{ background: p.is_featured ? "var(--gradient-brand)" : "#F7F0FF" }}
                  >
                    <MatchesIcon size={12} color={p.is_featured ? "white" : "#BF7FFF"} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
