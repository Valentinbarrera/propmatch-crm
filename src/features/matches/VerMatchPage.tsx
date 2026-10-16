import { useMemo, useState } from "react";
import { SampleBadge } from "@/components/ui/SampleBadge";
import { useNavigate, useParams } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, SectionHeader, Badge } from "@/components/ui/Card";
import { ScoreRing, FactorBar, MATCH_FACTORS } from "@/components/ui/ScoreRing";
import { EmptyState } from "@/components/ui/states";
import {
  ActivityIcon,
  CheckIcon,
  ChevronLeftIcon,
  MailIcon,
  MapPinIcon,
  MatchesIcon,
  MatchesSolidIcon,
  PhoneIcon,
} from "@/components/ui/icons";
import { useStore } from "@/data/store";
import { WhatsAppModal } from "@/components/share/WhatsAppModal";
import { WhatsAppIcon } from "@/components/ui/icons";
import { useHydratedMatches, type HydratedMatch } from "./MatchesPage";
import {
  PROPERTY_TYPE_LABEL,
  avatarGradient,
  initials,
  matchQuality,
  matchState,
  money,
  relativeTime,
} from "@/lib/format";
import type { ContactRequirement, Property } from "@/types/db";

export default function VerMatchPage() {
  const navigate = useNavigate();
  const { matchId } = useParams();
  const { createOpportunityFromMatch, activities, contactById, propertyById } = useStore();
  const [whatsapp, setWhatsapp] = useState(false);
  const all = useHydratedMatches();

  const item = all.find((m) => m.match.id === matchId);

  const timeline = useMemo(
    () =>
      activities
        .filter(
          (a) =>
            (item && a.contact_id === item.contact.id) ||
            (item && a.property_id === item.property.id),
        )
        .slice(0, 5),
    [activities, item],
  );

  if (!item) {
    return (
      <>
        <AppHeader title="Detalle del match" breadcrumb={["Matches", "Detalle"]} compact />
        <div className="flex-1 overflow-y-auto px-4 md:px-8">
          <EmptyState
            icon={<MatchesIcon size={24} color="#9B21FF" />}
            title="Este match ya no existe"
            description="Puede que la propiedad haya cambiado de estado o que el contacto ya no tenga esa búsqueda activa."
            action={{ label: "Volver a Matches", onClick: () => navigate("/matches") }}
          />
        </div>
      </>
    );
  }

  const { match, contact, requirement, property, photo, hasOpportunity } = item;
  const fullContact = contactById(contact.id);
  const fullProperty = propertyById(property.id);
  const state = matchState(match.score);

  return (
    <>
      <AppHeader
        title="Detalle del match"
        breadcrumb={["Matches", contact.full_name]}
        subtitle={`${contact.full_name} · ${property.title}`}
        compact
      >
        <button
          onClick={() => navigate("/matches")}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm border transition-all hover:border-violet-300"
          style={{ borderColor: "#E9E5DE", color: "#9B21FF", fontWeight: 600, background: "white" }}
        >
          <ChevronLeftIcon size={14} color="#9B21FF" />
          Volver
        </button>
      </AppHeader>

      {whatsapp && fullContact && fullProperty && (
        <WhatsAppModal contact={fullContact} property={fullProperty} onClose={() => setWhatsapp(false)} />
      )}

      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-10">
        {/* Hero */}
        <div
          className="mt-8 rounded-2xl border overflow-hidden relative"
          style={{ borderColor: "#E9E5DE", boxShadow: "var(--shadow-card-lg)" }}
        >
          <div className="px-6 py-6 relative overflow-hidden" style={{ background: "var(--gradient-soft)" }}>
            <div
              className="absolute -right-10 -top-10 w-40 h-40 rounded-full opacity-20 pointer-events-none"
              style={{ background: "var(--gradient-brand)", filter: "blur(30px)" }}
            />
            <div className="relative z-10 flex items-center gap-8 flex-wrap">
              <ScoreRing score={match.score} size={132} strokeWidth={10} />

              <div className="flex-1 min-w-[240px]">
                <Badge bg={state.bg} text={state.text} border={state.border}>
                  {state.label}
                </Badge>
                <p className="text-2xl tracking-tight mt-2" style={{ color: "#1A1A1A", fontWeight: 800 }}>
                  {matchQuality(match.score)} <SampleBadge record={match} size="sm" className="bg-white" />
                </p>
                <p className="text-sm mt-1" style={{ color: "#6B7280" }}>
                  {contact.full_name} y {property.title} coinciden en {match.reasons.length}{" "}
                  {match.reasons.length === 1 ? "criterio clave" : "criterios clave"}.
                </p>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {match.reasons.map((r) => (
                    <span
                      key={r}
                      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
                      style={{ background: "white", color: "#9B21FF", fontWeight: 600, border: "1px solid #E9E5DE" }}
                    >
                      <CheckIcon size={9} color="#9B21FF" />
                      {r}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => createOpportunityFromMatch(match.id)}
                  disabled={hasOpportunity}
                  className="px-5 py-2.5 rounded-xl text-sm text-white transition-all hover:opacity-90 active:scale-95 disabled:active:scale-100 whitespace-nowrap"
                  style={
                    hasOpportunity
                      ? { background: "#F0FDF4", color: "#15803D", fontWeight: 700, border: "1px solid #BBF7D0" }
                      : { background: "var(--gradient-brand)", fontWeight: 600, boxShadow: "var(--shadow-cta)" }
                  }
                >
                  {hasOpportunity ? "✓ Oportunidad creada" : "Crear oportunidad"}
                </button>
                {fullContact && fullProperty && (
                  <button
                    onClick={() => setWhatsapp(true)}
                    className="px-5 py-2.5 rounded-xl text-sm text-[#063B2A] transition-all hover:opacity-90 active:scale-95 flex items-center justify-center gap-2 whitespace-nowrap"
                    style={{ background: "#25D366", fontWeight: 600 }}
                  >
                    <WhatsAppIcon size={14} color="#063B2A" />
                    Enviar por WhatsApp
                  </button>
                )}
                {contact.phone && (
                  <a
                    href={`tel:${contact.phone}`}
                    className="px-5 py-2.5 rounded-xl text-sm border transition-all hover:border-violet-300 flex items-center justify-center gap-2 whitespace-nowrap"
                    style={{ borderColor: "#E9E5DE", color: "#9B21FF", fontWeight: 600, background: "white" }}
                  >
                    <PhoneIcon size={13} />
                    Contactar
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Criterios + desglose */}
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Card>
            <SectionHeader
              inCard
              title="Criterio por criterio"
              subtitle="Lo que busca el cliente contra lo que ofrece la propiedad"
            />
            <div className="p-5 space-y-2">
              {buildCriteria(requirement, property).map((c) => (
                <div
                  key={c.label}
                  className="grid items-center gap-3 py-2.5 px-3 rounded-xl"
                  style={{
                    gridTemplateColumns: "120px minmax(0,1fr) 24px minmax(0,1fr)",
                    background: c.match ? "#FAF8F5" : "#FFFBEB",
                    border: `1px solid ${c.match ? "#F0EDE6" : "#FDE68A"}`,
                  }}
                >
                  <span className="text-xs" style={{ color: "#6B7280", fontWeight: 600 }}>
                    {c.label}
                  </span>
                  <span className="text-xs truncate" style={{ color: "#374151" }}>
                    {c.clientValue}
                  </span>
                  <span className="flex items-center justify-center">
                    {c.match ? (
                      <span
                        className="w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: "#F0FDF4" }}
                      >
                        <CheckIcon size={10} color="#16A34A" />
                      </span>
                    ) : (
                      <span
                        className="w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: "#FEF3C7", color: "#B45309", fontSize: 11, fontWeight: 700 }}
                      >
                        !
                      </span>
                    )}
                  </span>
                  <span
                    className="text-xs truncate text-right"
                    style={{ color: "#1A1A1A", fontWeight: 600 }}
                  >
                    {c.propertyValue}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <SectionHeader inCard title="Desglose del score" subtitle="Cinco factores ponderados" />
            <div className="p-5 space-y-4">
              {MATCH_FACTORS.map((f) => (
                <FactorBar key={f.key} label={f.label} pct={match[f.key]} color={f.color} />
              ))}
            </div>
            <div
              className="mx-5 mb-5 p-4 rounded-xl flex items-center gap-4"
              style={{ background: "var(--gradient-soft)", border: "1px solid #E9E5DE" }}
            >
              <ScoreRing score={match.score} size={80} />
              <div>
                <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                  Compatibilidad total
                </p>
                <p className="text-xs mt-1" style={{ color: "#6B7280" }}>
                  Pesos: presupuesto 30% · ubicación 25% · tipo 20% · ambientes 15% · extras 10%
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Cliente y propiedad */}
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Card>
            <SectionHeader inCard title="El cliente" subtitle="Datos de contacto y qué busca" />
            <div className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div
                  className={`w-12 h-12 rounded-full bg-gradient-to-br ${avatarGradient(contact.full_name)} flex items-center justify-center text-white flex-shrink-0`}
                  style={{ fontWeight: 800 }}
                >
                  {initials(contact.full_name)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                    {contact.full_name}
                  </p>
                  <p className="text-xs" style={{ color: "#6B7280" }}>
                    {requirement.label ?? "Búsqueda activa"}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {contact.phone && (
                  <a
                    href={`tel:${contact.phone}`}
                    className="flex items-center gap-2.5 p-2.5 rounded-xl transition-all hover:bg-violet-50"
                    style={{ border: "1px solid #F0EDE6" }}
                  >
                    <PhoneIcon size={13} color="#9B21FF" />
                    <span className="text-xs" style={{ color: "#374151" }}>
                      {contact.phone}
                    </span>
                  </a>
                )}
                {contact.email && (
                  <a
                    href={`mailto:${contact.email}`}
                    className="flex items-center gap-2.5 p-2.5 rounded-xl transition-all hover:bg-violet-50"
                    style={{ border: "1px solid #F0EDE6" }}
                  >
                    <MailIcon size={13} color="#FF5ECA" />
                    <span className="text-xs truncate" style={{ color: "#374151" }}>
                      {contact.email}
                    </span>
                  </a>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <SectionHeader inCard title="La propiedad" subtitle="Ficha resumida" />
            <div className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0" style={{ background: "#F7F0FF" }}>
                  {photo && <img src={photo} alt="" loading="lazy" className="w-full h-full object-cover" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                    {property.title}
                  </p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <MapPinIcon size={10} />
                    <span className="text-xs" style={{ color: "#6B7280" }}>
                      {property.zone}
                    </span>
                  </div>
                  <p className="text-sm mt-1" style={{ color: "#1A1A1A", fontWeight: 800 }}>
                    {money(property.price, property.currency)}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Ambientes", value: property.rooms },
                  { label: "Dormitorios", value: property.bedrooms },
                  { label: "Superficie", value: property.surface_total ? `${property.surface_total} m²` : null },
                ].map((spec) => (
                  <div
                    key={spec.label}
                    className="rounded-xl p-2.5 text-center"
                    style={{ background: "#FAF8F5", border: "1px solid #F0EDE6" }}
                  >
                    <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                      {spec.value ?? "—"}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "#6B7280", fontSize: 10 }}>
                      {spec.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* Historial */}
        {timeline.length > 0 && (
          <Card className="mt-6">
            <SectionHeader inCard title="Historial" subtitle="Actividad relacionada con este match" />
            <div className="p-5 space-y-4">
              {timeline.map((a, idx) => (
                <div key={a.id} className="flex gap-3 relative">
                  {idx < timeline.length - 1 && (
                    <div
                      className="absolute left-[18px] top-8 w-px"
                      style={{ height: "calc(100% + 8px)", background: "#E9E5DE" }}
                    />
                  )}
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 z-10"
                    style={{ background: "#F7F0FF", color: "#9B21FF" }}
                  >
                    <ActivityIcon type={activityIconType(a.type)} />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className="text-sm" style={{ color: "#374151", fontWeight: 500 }}>
                      {a.title}
                    </p>
                    {a.detail && (
                      <p className="text-xs truncate mt-0.5" style={{ color: "#1A1A1A", fontWeight: 600 }}>
                        {a.detail}
                      </p>
                    )}
                    <p className="text-xs mt-1" style={{ color: "#6B7280" }}>
                      {relativeTime(a.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Cierre */}
        <div
          className="mt-6 rounded-2xl px-6 py-5 flex items-center justify-between gap-4 flex-wrap"
          style={{ background: "var(--gradient-soft)", border: "1px solid #E9E5DE" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--gradient-brand)", boxShadow: "0 4px 16px rgba(168, 85, 255,0.35)" }}
            >
              <MatchesSolidIcon size={20} />
            </div>
            <div>
              <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                {hasOpportunity ? "Ya hay una oportunidad abierta" : "¿Lo convertimos en oportunidad?"}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
                {hasOpportunity
                  ? "Seguí el avance desde el pipeline."
                  : "Entra al pipeline en la etapa Nuevos y podés moverla desde ahí."}
              </p>
            </div>
          </div>
          <button
            onClick={() => (hasOpportunity ? navigate("/oportunidades") : createOpportunityFromMatch(match.id))}
            className="px-5 py-2.5 rounded-xl text-sm text-white transition-all hover:opacity-90 active:scale-95 whitespace-nowrap"
            style={{ background: "var(--gradient-brand)", fontWeight: 600, boxShadow: "var(--shadow-cta)" }}
          >
            {hasOpportunity ? "Ir al pipeline" : "Crear oportunidad"}
          </button>
        </div>
      </div>
    </>
  );
}

function activityIconType(type: string): string {
  if (type.startsWith("contacto")) return "contact";
  if (type === "propiedad_publicada") return "property";
  if (type === "visita_programada") return "calendar";
  if (type === "etapa_avanzada") return "arrow";
  return "match";
}

interface Criterion {
  label: string;
  clientValue: string;
  propertyValue: string;
  match: boolean;
}

/**
 * La comparación lado a lado. En el prototipo era un array `CRITERIA` fijo con
 * todo en `match: true`; acá se deriva del requerimiento y de la propiedad, así
 * que también muestra lo que NO coincide — que es justo lo que un agente
 * necesita ver antes de llamar al cliente.
 */
function buildCriteria(req: ContactRequirement, p: Property): Criterion[] {
  const out: Criterion[] = [];

  const budgetOk =
    (req.budget_min === null || (p.price ?? 0) >= req.budget_min) &&
    (req.budget_max === null || (p.price ?? 0) <= req.budget_max);
  out.push({
    label: "Presupuesto",
    clientValue: `${money(req.budget_min, req.currency)} – ${money(req.budget_max, req.currency)}`,
    propertyValue: money(p.price, p.currency),
    match: budgetOk,
  });

  out.push({
    label: "Zona",
    clientValue: req.zones.length ? req.zones.join(" / ") : "Sin preferencia",
    propertyValue: p.zone ?? "—",
    match: !req.zones.length || req.zones.some((z) => z.toLowerCase() === (p.zone ?? "").toLowerCase()),
  });

  out.push({
    label: "Tipo",
    clientValue: req.property_types.length
      ? req.property_types.map((t) => PROPERTY_TYPE_LABEL[t]).join(" / ")
      : "Sin preferencia",
    propertyValue: PROPERTY_TYPE_LABEL[p.type],
    match: !req.property_types.length || req.property_types.includes(p.type),
  });

  if (req.bedrooms_min !== null) {
    out.push({
      label: "Dormitorios",
      clientValue: `${req.bedrooms_min} o más`,
      propertyValue: `${p.bedrooms ?? 0} dormitorios`,
      match: (p.bedrooms ?? 0) >= req.bedrooms_min,
    });
  }
  if (req.bathrooms_min !== null) {
    out.push({
      label: "Baños",
      clientValue: `${req.bathrooms_min} o más`,
      propertyValue: `${p.bathrooms ?? 0} baños`,
      match: (p.bathrooms ?? 0) >= req.bathrooms_min,
    });
  }
  if (req.surface_min !== null || req.surface_max !== null) {
    const okMin = req.surface_min === null || (p.surface_total ?? 0) >= req.surface_min;
    const okMax = req.surface_max === null || (p.surface_total ?? 0) <= req.surface_max;
    out.push({
      label: "Superficie",
      clientValue: `${req.surface_min ?? "—"} – ${req.surface_max ?? "—"} m²`,
      propertyValue: p.surface_total ? `${p.surface_total} m²` : "—",
      match: okMin && okMax,
    });
  }
  if (req.features.length) {
    const missing = req.features.filter(
      (f) => !p.features.some((pf) => pf.toLowerCase() === f.toLowerCase()),
    );
    out.push({
      label: "Características",
      clientValue: req.features.join(", "),
      propertyValue: missing.length ? `Falta: ${missing.join(", ")}` : "Todas presentes",
      match: missing.length === 0,
    });
  }

  return out;
}

export type { HydratedMatch };
