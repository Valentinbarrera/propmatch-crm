import { useMemo, useState } from "react";
import { SampleBadge } from "@/components/ui/SampleBadge";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { FilterDropdown, FilterTabs } from "@/components/ui/FilterTabs";
import { ScoreRing, FactorBar, MATCH_FACTORS } from "@/components/ui/ScoreRing";
import { EmptyState } from "@/components/ui/states";
import {
  CheckIcon,
  MailIcon,
  MapPinIcon,
  MatchesIcon,
  MatchesSolidIcon,
  OpportunitiesIcon,
  PhoneIcon,
  StarOutlineIcon,
} from "@/components/ui/icons";
import { useStore } from "@/data/store";
import { AppLeadsSection, useAppLeads } from "./AppLeadsSection";
import { ZONES } from "@/data/seed";
import { PROPERTY_TYPE_LABEL, avatarGradient, initials, matchQuality, money, relativeTime } from "@/lib/format";
import type { Contact, ContactRequirement, Match, Property, PropertyType } from "@/types/db";

type FilterTab = "todos" | "alta" | "nuevos" | "sin_revisar";

const TABS = [
  { value: "todos" as const, label: "Todos" },
  { value: "alta" as const, label: "Alta compatibilidad" },
  { value: "nuevos" as const, label: "Nuevos" },
  { value: "sin_revisar" as const, label: "Sin revisar" },
];

const TYPE_OPTIONS = (Object.keys(PROPERTY_TYPE_LABEL) as PropertyType[]).map((t) => ({
  value: t,
  label: PROPERTY_TYPE_LABEL[t],
}));
const ZONE_OPTIONS = ZONES.map((z) => ({ value: z, label: z }));
const SCORE_OPTIONS = [
  { value: "90", label: "90% o más" },
  { value: "80", label: "80% o más" },
  { value: "70", label: "70% o más" },
];

/** Un match con todo lo que la pantalla necesita mostrar, ya resuelto. */
export interface HydratedMatch {
  match: Match;
  contact: Contact;
  requirement: ContactRequirement;
  property: Property;
  photo: string | null;
  hasOpportunity: boolean;
}

/** Se comparte con la pantalla de detalle. */
export function useHydratedMatches(): HydratedMatch[] {
  const { matches, contactById, propertyById, requirements, coverPhoto, opportunities } = useStore();

  return useMemo(() => {
    const reqIndex = new Map(requirements.map((r) => [r.id, r]));
    const oppKeys = new Set(opportunities.map((o) => `${o.contact_id}:${o.property_id}`));

    return matches.flatMap((match) => {
      const contact = contactById(match.contact_id);
      const property = propertyById(match.property_id);
      const requirement = reqIndex.get(match.requirement_id);
      if (!contact || !property || !requirement) return [];
      return [
        {
          match,
          contact,
          requirement,
          property,
          photo: coverPhoto(property.id),
          hasOpportunity: oppKeys.has(`${contact.id}:${property.id}`),
        },
      ];
    });
  }, [matches, contactById, propertyById, requirements, coverPhoto, opportunities]);
}

export default function MatchesPage() {
  const navigate = useNavigate();
  const { createOpportunityFromMatch, markMatchReviewed } = useStore();
  const all = useHydratedMatches();
  const appLeads = useAppLeads();

  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<FilterTab>("todos");
  const [type, setType] = useState<PropertyType | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  const [minScore, setMinScore] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const dayAgo = Date.now() - 86_400_000;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter(({ match, contact, property }) => {
      if (tab === "alta" && match.score < 85) return false;
      if (tab === "nuevos" && new Date(match.created_at).getTime() < dayAgo) return false;
      if (tab === "sin_revisar" && match.is_reviewed) return false;
      if (type && property.type !== type) return false;
      if (zone && property.zone !== zone) return false;
      if (minScore && match.score < Number(minScore)) return false;
      if (q && !`${contact.full_name} ${property.title}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [all, tab, type, zone, minScore, query, dayAgo]);

  const selected = useMemo(
    () => filtered.find((m) => m.match.id === selectedId) ?? filtered[0],
    [filtered, selectedId],
  );

  const stats = useMemo(
    () => ({
      // Los interesados reales de la app suman a «activos» y «nuevos hoy».
      total: all.length + appLeads.length,
      high: all.filter((m) => m.match.score >= 85).length,
      today:
        all.filter((m) => new Date(m.match.created_at).getTime() > dayAgo).length +
        appLeads.filter((l) => new Date(l.at).getTime() > dayAgo).length,
    }),
    [all, appLeads, dayAgo],
  );

  return (
    <>
      <AppHeader
        title="Matches"
        subtitle="Encontrá las mejores oportunidades entre tus contactos y propiedades."
        search={{ placeholder: "Buscar matches...", value: query, onChange: setQuery }}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-8">
          {/* Resumen */}
          <div className="pm-stagger hidden md:grid mt-8 grid-cols-3 gap-5">
            <OverviewCard
              value={String(stats.total)}
              label="Matches activos"
              sub={appLeads.length > 0 ? `${appLeads.length} desde la app · ${all.length} compatibles` : "Sobre tu cartera actual"}
              icon={<MatchesSolidIcon size={26} color="white" />}
              grad="var(--gradient-brand)"
              light="#F7F0FF"
              barWidth={100}
            />
            <OverviewCard
              value={String(stats.high)}
              label="Alta compatibilidad"
              sub="85% o más de coincidencia"
              icon={<StarOutlineIcon size={26} color="white" />}
              grad="var(--gradient-brand)"
              light="#FFF1FA"
              barWidth={(stats.high / Math.max(1, stats.total)) * 100}
            />
            <OverviewCard
              value={String(stats.today)}
              label="Nuevos matches hoy"
              sub="Últimas 24 horas"
              icon={<OpportunitiesIcon size={26} color="white" />}
              grad="linear-gradient(135deg,#FF5ECA,#FF7ED5)"
              light="#FFF1FA"
              barWidth={(stats.today / Math.max(1, stats.total)) * 100}
            />
          </div>

          {/* Filtros */}
          <div className="mt-6 flex items-center gap-3 flex-wrap">
            <FilterTabs options={TABS} value={tab} onChange={setTab} />
            <div className="flex-1" />
            <FilterDropdown label="Tipo" options={TYPE_OPTIONS} value={type} onChange={setType} />
            <FilterDropdown label="Zona" options={ZONE_OPTIONS} value={zone} onChange={setZone} />
            <FilterDropdown
              label="% de match"
              options={SCORE_OPTIONS}
              value={minScore}
              onChange={setMinScore}
            />
            <span className="text-sm whitespace-nowrap" style={{ color: "#6B7280" }}>
              <span style={{ color: "#1A1A1A", fontWeight: 700 }}>{filtered.length}</span> matches
            </span>
          </div>
        </div>

        {/* Interesados reales de la app, arriba de los compatibles que calcula el CRM. */}
        <AppLeadsSection query={query} />
        {appLeads.length > 0 && (
          <h2 className="mt-8 px-4 md:px-8 text-base" style={{ color: "#1A1A1A", fontWeight: 800 }}>
            Compatibles de tu cartera
          </h2>
        )}

        {filtered.length === 0 ? (
          <div className="px-4 md:px-8">
            <EmptyState
              icon={<MatchesIcon size={24} color="#9B21FF" />}
              title={all.length === 0 ? (appLeads.length > 0 ? "Todavía no hay compatibles calculados" : "Todavía no hay matches") : "Sin resultados"}
              description={
                all.length === 0
                  ? "Cargá propiedades y qué busca cada contacto: el sistema cruza ambos lados y calcula la compatibilidad solo."
                  : "Probá con otros filtros."
              }
              action={
                all.length === 0
                  ? { label: "Ir a Propiedades", onClick: () => navigate("/propiedades") }
                  : undefined
              }
            />
          </div>
        ) : (
          <div className="mt-5 px-4 md:px-8 pb-8 grid gap-5 items-start grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4 min-w-0">
              <div>
                <h2 className="text-base" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                  Mejores matches para revisar
                </h2>
                <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
                  Ordenados por compatibilidad · calculados sobre datos actuales
                </p>
              </div>

              {filtered.map((hm) => (
                <MatchCard
                  key={hm.match.id}
                  item={hm}
                  isSelected={selected?.match.id === hm.match.id}
                  onSelect={() => {
                    setSelectedId(hm.match.id);
                    markMatchReviewed(hm.match.id);
                  }}
                  onDetail={() => navigate(`/matches/${hm.match.id}`)}
                  onCreateOpp={() => createOpportunityFromMatch(hm.match.id)}
                />
              ))}
            </div>

            {/* En celular el análisis está en "Ver detalle": al costado no entra. */}
            {selected && (
              <div className="hidden lg:block">
                <WhyMatchPanel item={selected} onCreateOpp={() => createOpportunityFromMatch(selected.match.id)} />
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function OverviewCard({
  value,
  label,
  sub,
  icon,
  grad,
  light,
  barWidth,
}: {
  value: string;
  label: string;
  sub: string;
  icon: React.ReactNode;
  grad: string;
  light: string;
  barWidth: number;
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden border transition-all hover:shadow-lg"
      style={{ borderColor: "#E9E5DE", boxShadow: "var(--shadow-card-lg)" }}
    >
      <div className="px-5 pt-5 pb-4 relative overflow-hidden" style={{ background: light }}>
        <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full opacity-10" style={{ background: grad }} />
        <div className="flex items-start justify-between">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm"
            style={{ background: grad }}
          >
            {icon}
          </div>
          <p
            className="text-4xl tracking-tight leading-none"
            style={{
              fontWeight: 800,
              background: grad,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {value}
          </p>
        </div>
      </div>
      <div className="px-5 pb-4 bg-white">
        <p className="text-sm mt-2" style={{ color: "#1A1A1A", fontWeight: 700 }}>
          {label}
        </p>
        <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
          {sub}
        </p>
        <div className="h-1 rounded-full mt-3" style={{ background: "#F7F0FF" }}>
          <div className="h-full rounded-full" style={{ width: `${barWidth}%`, background: grad }} />
        </div>
      </div>
    </div>
  );
}

function MatchCard({
  item,
  isSelected,
  onSelect,
  onDetail,
  onCreateOpp,
}: {
  item: HydratedMatch;
  isSelected: boolean;
  onSelect: () => void;
  onDetail: () => void;
  onCreateOpp: () => void;
}) {
  const { match, contact, requirement, property, photo, hasOpportunity } = item;
  const isNew = Date.now() - new Date(match.created_at).getTime() < 86_400_000;

  return (
    <div
      onClick={onSelect}
      className="rounded-2xl border overflow-hidden cursor-pointer transition-all"
      style={{
        background: "white",
        borderColor: isSelected ? "#A855FF" : "#E9E5DE",
        boxShadow: isSelected
          ? "0 0 0 3px rgba(168, 85, 255,0.12), 0 4px 20px rgba(168, 85, 255,0.12)"
          : "0 2px 10px rgba(168, 85, 255,0.06)",
      }}
    >
      <div className="flex flex-col lg:flex-row">
        {/* Cliente */}
        <div
          className="lg:w-52 flex-shrink-0 p-5 flex flex-col justify-between border-b lg:border-b-0 lg:border-r"
          style={{ borderColor: "#F7F0FF" }}
        >
          <div>
            {isNew && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full mb-3"
                style={{
                  background: "var(--gradient-brand)",
                  color: "white",
                  fontWeight: 700,
                  fontSize: "9px",
                }}
              >
                ✦ NUEVO
              </span>
            )}
            <div
              className={`w-12 h-12 rounded-full bg-gradient-to-br ${avatarGradient(contact.full_name)} flex items-center justify-center text-white mb-3`}
              style={{ fontWeight: 800 }}
            >
              {initials(contact.full_name)}
            </div>
            <p className="text-sm leading-tight" style={{ color: "#1A1A1A", fontWeight: 700 }}>
              {contact.full_name} <SampleBadge record={match} />
            </p>
            <p className="text-xs mt-1" style={{ color: "#6B7280" }}>
              Busca: {requirement.property_types.map((t) => PROPERTY_TYPE_LABEL[t]).join(", ")}
            </p>
          </div>
          <div className="mt-3 space-y-1">
            <div className="flex items-center gap-1.5">
              <MapPinIcon size={11} color="#D4AAFF" />
              <span className="text-xs" style={{ color: "#6B7280" }}>
                {requirement.zones.join(" · ")}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span style={{ color: "#6B7280", fontSize: 11 }}>$</span>
              <span className="text-xs" style={{ color: "#6B7280" }}>
                {money(requirement.budget_min, requirement.currency)} –{" "}
                {money(requirement.budget_max, requirement.currency)}
              </span>
            </div>
          </div>
        </div>

        {/* Score */}
        <div
          className="flex-shrink-0 lg:w-44 flex flex-col items-center justify-center px-4 py-5"
          style={{ background: "linear-gradient(180deg, #FAF8F5 0%, #FAF8F5 100%)" }}
        >
          <ScoreRing score={match.score} size={100} />
          <div className="flex items-center gap-1 mt-3">
            <span className="text-xs" style={{ color: "#6B7280", fontSize: "10px" }}>
              {MATCH_FACTORS.length} factores evaluados
            </span>
          </div>
          <p
            className="text-xs mt-1.5 text-center leading-tight"
            style={{ color: "#6B7280", fontSize: "10px" }}
          >
            Compatibilidad calculada
          </p>
        </div>

        {/* Propiedad */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="relative h-32 overflow-hidden flex-shrink-0" style={{ background: "#F7F0FF" }}>
            {photo && <img src={photo} alt={property.title} loading="lazy" className="w-full h-full object-cover" />}
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(to top, rgba(8, 11, 31,0.45) 0%, transparent 55%)" }}
            />
            <div className="absolute bottom-2.5 left-3 right-3">
              <p className="text-white text-xs leading-tight" style={{ fontWeight: 700 }}>
                {property.title}
              </p>
              <div className="flex items-center gap-1 mt-0.5">
                <MapPinIcon size={9} color="white" />
                <span className="text-white text-xs" style={{ opacity: 0.85, fontSize: "10px" }}>
                  {property.zone}
                </span>
              </div>
            </div>
            <div className="absolute top-2.5 right-2.5">
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{
                  background: "rgba(255,255,255,0.9)",
                  color: "#9B21FF",
                  fontWeight: 700,
                  fontSize: "10px",
                }}
              >
                {PROPERTY_TYPE_LABEL[property.type]}
              </span>
            </div>
          </div>

          <div className="flex-1 p-4">
            <div className="flex items-center justify-between mb-2 gap-2">
              <span className="text-base" style={{ color: "#1A1A1A", fontWeight: 800 }}>
                {money(property.price, property.currency)}
              </span>
              <span className="text-xs whitespace-nowrap" style={{ color: "#6B7280" }}>
                {relativeTime(match.created_at)}
              </span>
            </div>

            <div className="flex items-center gap-3 mb-3 text-xs" style={{ color: "#6B7280" }}>
              {property.rooms !== null && (
                <span>
                  <strong style={{ color: "#374151" }}>{property.rooms} amb.</strong>
                </span>
              )}
              {property.surface_total !== null && (
                <span>
                  <strong style={{ color: "#374151" }}>{property.surface_total} m²</strong>
                </span>
              )}
            </div>

            {/* Motivos: los genera el motor, no están escritos a mano */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {match.reasons.map((reason) => (
                <span
                  key={reason}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
                  style={{ background: "#F7F0FF", color: "#9B21FF", fontWeight: 600, fontSize: "11px" }}
                >
                  <CheckIcon size={9} color="#9B21FF" />
                  {reason}
                </span>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDetail();
                }}
                className="flex-1 py-2 rounded-xl text-xs border transition-all hover:border-violet-300"
                style={{ borderColor: "#E9E5DE", color: "#9B21FF", fontWeight: 600, background: "#FAF8F5" }}
              >
                Ver detalle
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateOpp();
                }}
                disabled={hasOpportunity}
                className="flex-1 py-2 rounded-xl text-xs text-white transition-all hover:opacity-90 active:scale-95 disabled:active:scale-100"
                style={
                  hasOpportunity
                    ? { background: "#F0FDF4", color: "#15803D", fontWeight: 700, border: "1px solid #BBF7D0" }
                    : {
                        background: "var(--gradient-brand)",
                        fontWeight: 600,
                        boxShadow: "0 3px 10px rgba(168, 85, 255,0.3)",
                      }
                }
              >
                {hasOpportunity ? "✓ Oportunidad creada" : "Crear oportunidad"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WhyMatchPanel({ item, onCreateOpp }: { item: HydratedMatch; onCreateOpp: () => void }) {
  const { match, contact, property, photo, hasOpportunity } = item;

  return (
    <div className="space-y-4 sticky top-0">
      <div
        className="rounded-2xl overflow-hidden border"
        style={{ borderColor: "#E9E5DE", boxShadow: "0 2px 12px rgba(168, 85, 255,0.08)" }}
      >
        <div className="px-5 py-5 relative overflow-hidden" style={{ background: "var(--gradient-brand-wide)" }}>
          <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full opacity-20" style={{ background: "white" }} />
          <div className="absolute right-4 bottom-0 w-10 h-10 rounded-full opacity-10" style={{ background: "white" }} />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-1">
              <CheckIcon size={14} color="white" />
              <span
                className="text-white text-xs uppercase"
                style={{ fontWeight: 700, opacity: 0.85, letterSpacing: "0.1em" }}
              >
                Por qué hacen match
              </span>
            </div>
            <p className="text-white text-base" style={{ fontWeight: 800 }}>
              Análisis de compatibilidad
            </p>
            <p className="text-white text-xs mt-1" style={{ opacity: 0.75 }}>
              Cinco factores, ponderados sobre lo que busca el cliente
            </p>
          </div>
        </div>

        {/* Cliente ↔ Propiedad */}
        <div className="p-4 bg-white border-b" style={{ borderColor: "#F0EDE6" }}>
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-full bg-gradient-to-br ${avatarGradient(contact.full_name)} flex items-center justify-center text-white flex-shrink-0`}
              style={{ fontWeight: 800, fontSize: "12px" }}
            >
              {initials(contact.full_name)}
            </div>
            <div className="flex-1 flex items-center gap-1.5">
              <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, #E9E5DE, #7C3AED66)" }} />
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: "var(--gradient-brand)" }}
              >
                <MatchesSolidIcon size={11} />
              </div>
              <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, #EC489966, #E9E5DE)" }} />
            </div>
            <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0" style={{ background: "#F7F0FF" }}>
              {photo && <img src={photo} alt="" loading="lazy" className="w-full h-full object-cover" />}
            </div>
          </div>
          <div className="flex justify-between mt-2.5 gap-2">
            <div className="min-w-0">
              <p className="text-xs truncate" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                {contact.full_name} <SampleBadge record={match} />
              </p>
              <p className="text-xs" style={{ color: "#6B7280", fontSize: "10px" }}>
                Cliente
              </p>
            </div>
            <div className="text-right min-w-0">
              <p className="text-xs truncate" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                {property.title}
              </p>
              <p className="text-xs" style={{ color: "#6B7280", fontSize: "10px" }}>
                Propiedad
              </p>
            </div>
          </div>
        </div>

        {/* Los 5 factores */}
        <div className="p-4 bg-white space-y-3.5">
          {MATCH_FACTORS.map((f) => (
            <FactorBar key={f.key} label={f.label} pct={match[f.key]} color={f.color} />
          ))}
        </div>

        <div
          className="mx-4 mb-4 p-3.5 rounded-xl flex items-center gap-4"
          style={{ background: "var(--gradient-soft)", border: "1px solid #E9E5DE" }}
        >
          <ScoreRing score={match.score} size={84} />
          <div className="min-w-0">
            <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
              Compatibilidad total
            </p>
            <p className="text-xs mt-1" style={{ color: "#6B7280" }}>
              {matchQuality(match.score)}
            </p>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {match.reasons.slice(0, 2).map((r) => (
                <span
                  key={r}
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: "#E9E5DE", color: "#9B21FF", fontWeight: 600, fontSize: "9px" }}
                >
                  ✓ {r}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Acciones rápidas */}
      <div
        className="rounded-2xl border p-4"
        style={{ borderColor: "#E9E5DE", background: "white", boxShadow: "var(--shadow-card)" }}
      >
        <p
          className="text-xs uppercase mb-3"
          style={{ color: "#6B7280", fontWeight: 700, letterSpacing: "0.1em" }}
        >
          Acciones rápidas
        </p>
        <div className="space-y-2">
          <button
            onClick={onCreateOpp}
            disabled={hasOpportunity}
            className="w-full py-2.5 rounded-xl text-sm text-white transition-all hover:opacity-90"
            style={
              hasOpportunity
                ? { background: "#F0FDF4", color: "#15803D", fontWeight: 700, border: "1px solid #BBF7D0" }
                : {
                    background: "var(--gradient-brand)",
                    fontWeight: 600,
                    boxShadow: "0 3px 10px rgba(168, 85, 255,0.28)",
                  }
            }
          >
            {hasOpportunity ? "✓ Oportunidad creada" : "Crear oportunidad"}
          </button>

          {contact.phone && (
            <a
              href={`tel:${contact.phone}`}
              className="w-full py-2.5 rounded-xl text-sm border transition-all hover:border-violet-300 flex items-center justify-center gap-2"
              style={{ borderColor: "#E9E5DE", color: "#9B21FF", fontWeight: 600, background: "#FAF8F5" }}
            >
              <PhoneIcon size={13} />
              Llamar a {contact.full_name.split(" ")[0]}
            </a>
          )}

          {contact.email && (
            <a
              href={`mailto:${contact.email}?subject=${encodeURIComponent(property.title)}`}
              className="w-full py-2.5 rounded-xl text-sm border transition-all hover:border-pink-200 flex items-center justify-center gap-2"
              style={{ borderColor: "#FFF1FA", color: "#FF5ECA", fontWeight: 600, background: "#FFF1FA" }}
            >
              <MailIcon size={13} />
              Enviar propiedad por email
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
