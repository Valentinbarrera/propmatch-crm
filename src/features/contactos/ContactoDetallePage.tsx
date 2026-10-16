import { useMemo, useState } from "react";
import { isSample } from "@/lib/samples";
import { SampleBadge } from "@/components/ui/SampleBadge";
import { useNavigate, useParams } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, SectionHeader, Badge } from "@/components/ui/Card";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { EmptyState } from "@/components/ui/states";
import {
  ActivityIcon,
  ChevronLeftIcon,
  ContactsIcon,
  EditIcon,
  MailIcon,
  MapPinIcon,
  MatchesIcon,
  MatchesSolidIcon,
  PhoneIcon,
  PropertyTypeIcon,
} from "@/components/ui/icons";
import { useStore, STAGE_LABEL } from "@/data/store";
import { ContactFormModal } from "./ContactFormModal";
import { WhatsAppButton, WhatsAppModal } from "@/components/share/WhatsAppModal";
import { SendMyWebButton } from "@/features/branding/SendMyWeb";
import {
  CONTACT_STATUS_LABEL,
  CONTACT_STATUS_STYLE,
  PROPERTY_STATUS_LABEL,
  PROPERTY_TYPE_LABEL,
  avatarGradient,
  initials,
  money,
  relativeTime,
} from "@/lib/format";
import { AUTHORIZATION_TONE_STYLE, authorizationState } from "@/lib/authorization";
import { lastTouch, touchLabel } from "@/lib/followups";
import { useFollowUps } from "@/data/useFollowUps";
import { ChatPanel } from "./ChatPanel";
import { MarketingContactCard } from "@/features/marketing/MarketingContactCard";
import { ContactNoContactBadge } from "@/features/marketing/ContactNoContactBadge";

/**
 * Ficha del contacto: todo lo que el agente necesita ver antes de llamarlo.
 * Es la pantalla que el prototipo no tenía y que en un CRM es la más usada.
 */
export default function ContactoDetallePage() {
  const navigate = useNavigate();
  const { contactId } = useParams();
  const {
    contactById,
    requirementOf,
    profileById,
    propertyById,
    coverPhoto,
    matches,
    opportunities,
    events,
    activities,
    properties,
    createOpportunityFromMatch,
    respondOffer,
    appOffers,
    respondSwipe,
    currentUserId,
  } = useStore();

  const [editing, setEditing] = useState(false);
  const [whatsapp, setWhatsapp] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [respondError, setRespondError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function handleRespondOffer(activityId: string, appOfferId: string, action: "accept" | "reject") {
    setRespondingId(activityId);
    setRespondError(null);
    const error = await respondOffer(appOfferId, action);
    const sample = isSample(appOffers.find((o) => o.app_offer_id === appOfferId));
    if (error) setRespondError(error);
    else setToast(`${action === "accept" ? "Oferta aceptada." : "Oferta rechazada."}${sample ? " Oferta de ejemplo: no se envía a la app." : ""}`);
    setRespondingId(null);
    setTimeout(() => setToast(null), 3500);
  }

  async function handleRespondSwipe(activityId: string, action: "accepted" | "rejected") {
    setRespondingId(activityId);
    setRespondError(null);
    const error = await respondSwipe(activityId, action);
    if (error) setRespondError(error);
    else setToast(action === "accepted" ? "Interés aceptado." : "Interés descartado.");
    setRespondingId(null);
    setTimeout(() => setToast(null), 3500);
  }
  const allFollowUps = useFollowUps(false);

  const contact = contactById(contactId);
  const requirement = contact ? requirementOf(contact.id) : undefined;
  const ownedProperties = useMemo(
    () => (contact ? properties.filter((p) => p.owner_contact_id === contact.id) : []),
    [properties, contact],
  );

  const contactMatches = useMemo(
    () => (contact ? matches.filter((m) => m.contact_id === contact.id) : []),
    [matches, contact],
  );

  const contactOpps = useMemo(
    () => (contact ? opportunities.filter((o) => o.contact_id === contact.id) : []),
    [opportunities, contact],
  );

  /** Oportunidades con match real (de la app): ahí hay un chat de verdad para mostrar. */
  const contactChats = useMemo(
    () => contactOpps.filter((o): o is typeof o & { match_id: string } => Boolean(o.match_id)),
    [contactOpps],
  );

  const timeline = useMemo(
    () => (contact ? activities.filter((a) => a.contact_id === contact.id).slice(0, 8) : []),
    [activities, contact],
  );

  const upcoming = useMemo(
    () =>
      contact
        ? events
            .filter((e) => e.contact_id === contact.id && new Date(e.starts_at).getTime() >= Date.now())
            .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
        : [],
    [events, contact],
  );

  if (!contact) {
    return (
      <>
        <AppHeader title="Contacto" breadcrumb={["Contactos"]} compact />
        <div className="flex-1 overflow-y-auto px-4 md:px-8">
          <EmptyState
            icon={<ContactsIcon size={24} color="#9B21FF" />}
            title="Este contacto no existe"
            description="Puede que lo hayas eliminado o que el link esté desactualizado."
            action={{ label: "Volver a Contactos", onClick: () => navigate("/contactos") }}
          />
        </div>
      </>
    );
  }

  const statusStyle = CONTACT_STATUS_STYLE[contact.status];
  const owner = profileById(contact.owner_id);
  const bestScore = contactMatches[0]?.score ?? 0;

  /**
   * Resumen de la búsqueda para el subtítulo. El `label` es opcional, así que
   * si no lo cargaron se arma con los criterios en vez de decir "sin búsqueda"
   * cuando sí la hay.
   */
  const searchSummary = (() => {
    if (!requirement) return "Sin búsqueda cargada";
    if (requirement.label) return requirement.label;

    const parts = [
      requirement.property_types.map((t) => PROPERTY_TYPE_LABEL[t]).join(" / "),
      requirement.zones.length ? `en ${requirement.zones.join(" / ")}` : "",
      requirement.budget_max ? `hasta ${money(requirement.budget_max, requirement.currency)}` : "",
    ].filter(Boolean);

    return parts.length ? parts.join(" · ") : "Búsqueda cargada";
  })();

  return (
    <>
      <AppHeader
        title={contact.full_name}
        breadcrumb={["Contactos", contact.full_name]}
        subtitle={searchSummary}
        compact
      >
        <button
          onClick={() => navigate("/contactos")}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm border transition-all hover:border-violet-300"
          style={{ borderColor: "#E9E5DE", color: "#9B21FF", fontWeight: 600, background: "white" }}
        >
          <ChevronLeftIcon size={14} color="#9B21FF" />
          Volver
        </button>
        <button
          onClick={() => setEditing(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm text-white transition-all hover:opacity-90 active:scale-95"
          style={{ background: "var(--gradient-brand)", fontWeight: 600, boxShadow: "var(--shadow-cta)" }}
        >
          <EditIcon size={13} color="white" />
          Editar
        </button>
      </AppHeader>

      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-10">
        {/* Encabezado */}
        <div
          className="mt-8 rounded-2xl border overflow-hidden"
          style={{ borderColor: "#E9E5DE", boxShadow: "var(--shadow-card-lg)" }}
        >
          <div className="px-6 py-6 flex items-center gap-6 flex-wrap" style={{ background: "var(--gradient-soft)" }}>
            <div
              className={`w-20 h-20 rounded-full bg-gradient-to-br ${avatarGradient(contact.full_name)} flex items-center justify-center text-white flex-shrink-0`}
              style={{ fontWeight: 800, fontSize: 24 }}
            >
              {initials(contact.full_name)}
            </div>

            <div className="flex-1 min-w-[220px]">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-2xl tracking-tight" style={{ color: "#1A1A1A", fontWeight: 800 }}>
                  {contact.full_name}
                </h2>
                <SampleBadge record={contact} size="sm" />
                <ContactNoContactBadge contact={contact} />
                <Badge bg={statusStyle.bg} text={statusStyle.text} border={statusStyle.border}>
                  {CONTACT_STATUS_LABEL[contact.status]}
                </Badge>
              </div>
              {(() => {
                const pending = allFollowUps.find((f) => f.contact.id === contact.id);
                const touch = lastTouch(contact.id, { activities, events }, Date.now());
                return (
                  <p className="text-xs mt-1.5 flex flex-wrap items-center gap-2">
                    <span style={{ color: "#6B7280" }}>
                      Último contacto: <strong style={{ color: "#1A1A1A" }}>{touchLabel(touch)}</strong>
                    </span>
                    {pending && (
                      <span
                        className="px-2 py-0.5 rounded-md"
                        style={{
                          background: pending.priority === 1 ? "#FFF1F2" : "#FFFBEB",
                          color: pending.priority === 1 ? "#BE123C" : "#B45309",
                          fontWeight: 600,
                        }}
                      >
                        {pending.reason}
                      </span>
                    )}
                  </p>
                );
              })()}
              <p className="text-sm mt-1" style={{ color: "#6B7280" }}>
                {KIND_LABEL[contact.kind]}
                {owner && ` · a cargo de ${owner.full_name}`}
                {` · alta ${relativeTime(contact.created_at).toLowerCase()}`}
              </p>

              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <WhatsAppButton onClick={() => setWhatsapp(true)} />
                <SendMyWebButton contact={contact} />
                {contact.phone && (
                  <a
                    href={`tel:${contact.phone}`}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm border transition-all hover:border-violet-300"
                    style={{ borderColor: "#E9E5DE", background: "white", color: "#9B21FF", fontWeight: 600 }}
                  >
                    <PhoneIcon size={13} />
                    {contact.phone}
                  </a>
                )}
                {contact.email && (
                  <a
                    href={`mailto:${contact.email}`}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm border transition-all hover:border-pink-200"
                    style={{ borderColor: "#FFF1FA", background: "white", color: "#FF5ECA", fontWeight: 600 }}
                  >
                    <MailIcon size={13} />
                    {contact.email}
                  </a>
                )}
              </div>
            </div>

            {contactMatches.length > 0 && (
              <div className="flex items-center gap-4 flex-shrink-0">
                <ScoreRing score={bestScore} size={92} />
                <div>
                  <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                    Mejor coincidencia
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
                    {contactMatches.length}{" "}
                    {contactMatches.length === 1 ? "propiedad compatible" : "propiedades compatibles"}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
          <div className="space-y-6 min-w-0">
            {/* Qué busca */}
            <Card>
              <SectionHeader
                inCard
                title="Qué busca"
                subtitle={requirement ? "Criterios que alimentan el matching" : undefined}
                action={{ label: requirement ? "Editar" : "Cargar búsqueda", onClick: () => setEditing(true) }}
              />
              {!requirement ? (
                <EmptyState
                  compact
                  icon={<MatchesIcon size={22} color="#9B21FF" />}
                  title="Sin búsqueda cargada"
                  description="Sin esto el sistema no puede buscarle propiedades compatibles."
                  action={{ label: "Cargar qué busca", onClick: () => setEditing(true) }}
                />
              ) : (
                <div className="p-5 grid gap-4 sm:grid-cols-2">
                  <Detail label="Operación" value={OPERATION_LABEL[requirement.operation]} />
                  <Detail
                    label="Presupuesto"
                    value={`${money(requirement.budget_min, requirement.currency)} – ${money(requirement.budget_max, requirement.currency)}`}
                  />
                  <Detail
                    label="Tipo de propiedad"
                    value={
                      requirement.property_types.length
                        ? requirement.property_types.map((t) => PROPERTY_TYPE_LABEL[t]).join(", ")
                        : "Sin preferencia"
                    }
                  />
                  <Detail
                    label="Zonas"
                    value={requirement.zones.length ? requirement.zones.join(" · ") : "Sin preferencia"}
                  />
                  <Detail
                    label="Mínimos"
                    value={
                      [
                        requirement.bedrooms_min && `${requirement.bedrooms_min} dorm.`,
                        requirement.bathrooms_min && `${requirement.bathrooms_min} baños`,
                        requirement.surface_min && `${requirement.surface_min} m²`,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Sin mínimos"
                    }
                  />
                  <Detail
                    label="Características"
                    value={requirement.features.length ? requirement.features.join(", ") : "Ninguna en particular"}
                  />
                </div>
              )}
            </Card>

            {/* Matches */}
            <Card>
              <SectionHeader
                inCard
                title="Propiedades compatibles"
                subtitle={`${contactMatches.length} según sus criterios`}
                action={
                  contactMatches.length > 0
                    ? { label: "Ver todos", onClick: () => navigate("/matches") }
                    : undefined
                }
              />
              {contactMatches.length === 0 ? (
                <EmptyState
                  compact
                  title="Todavía no hay coincidencias"
                  description={
                    requirement
                      ? "Ninguna propiedad de la cartera llega al 50% con estos criterios."
                      : "Cargá qué busca para que el sistema empiece a cruzarlo."
                  }
                />
              ) : (
                <div className="p-4 space-y-3">
                  {contactMatches.slice(0, 5).map((match) => {
                    const property = propertyById(match.property_id);
                    if (!property) return null;
                    const photo = coverPhoto(property.id);
                    const hasOpp = contactOpps.some((o) => o.property_id === property.id);
                    return (
                      <div
                        key={match.id}
                        className="flex flex-wrap sm:flex-nowrap items-center gap-3 p-3 rounded-xl transition-all hover:bg-violet-50 cursor-pointer"
                        style={{ border: "1px solid #F0EDE6" }}
                        onClick={() => navigate(`/matches/${match.id}`)}
                      >
                        <div
                          className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0"
                          style={{ background: "#F7F0FF" }}
                        >
                          {photo && <img src={photo} alt="" loading="lazy" className="w-full h-full object-cover" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate" style={{ color: "#1A1A1A", fontWeight: 600 }}>
                            {property.title}
                          </p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <MapPinIcon size={10} />
                            <span className="text-xs" style={{ color: "#6B7280" }}>
                              {property.zone}
                            </span>
                          </div>
                          <p className="text-sm mt-0.5" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                            {money(property.price, property.currency)}
                          </p>
                        </div>
                        <div className="flex items-center justify-between sm:justify-start gap-3 w-full sm:w-auto sm:flex-shrink-0">
                          <div
                            className="text-xs px-2.5 py-1 rounded-full"
                            style={{
                              background: "var(--gradient-soft)",
                              border: "1px solid #E9E5DE",
                              color: "#9B21FF",
                              fontWeight: 700,
                            }}
                          >
                            {match.score}%
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              createOpportunityFromMatch(match.id);
                            }}
                            disabled={hasOpp}
                            className="text-xs px-3 py-1.5 rounded-lg text-white transition-all hover:opacity-90"
                            style={
                              hasOpp
                                ? { background: "#F0FDF4", color: "#15803D", fontWeight: 700, border: "1px solid #BBF7D0" }
                                : { background: "var(--gradient-brand)", fontWeight: 600 }
                            }
                          >
                            {hasOpp ? "✓ En pipeline" : "Crear oportunidad"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* Oportunidades */}
            {contactOpps.length > 0 && (
              <Card>
                <SectionHeader
                  inCard
                  title="Oportunidades"
                  subtitle={`${contactOpps.length} en el pipeline`}
                  action={{ label: "Ver pipeline", onClick: () => navigate("/oportunidades") }}
                />
                <div className="p-4 space-y-2">
                  {contactOpps.map((opp) => {
                    const property = propertyById(opp.property_id);
                    return (
                      <div
                        key={opp.id}
                        className="flex items-center gap-3 p-3 rounded-xl"
                        style={{ border: "1px solid #F0EDE6" }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate" style={{ color: "#1A1A1A", fontWeight: 600 }}>
                            {property?.title ?? "Sin propiedad"}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
                            Actualizada {relativeTime(opp.updated_at).toLowerCase()}
                          </p>
                        </div>
                        <span className="text-sm whitespace-nowrap" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                          {money(opp.value, opp.currency)}
                        </span>
                        <Badge bg="#F7F0FF" text="#9B21FF" border="#DDD8CF">
                          {STAGE_LABEL[opp.stage]}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>

          {/* Columna derecha */}
          <div className="space-y-6">
            {/* Marketing: No contactar, consentimiento y etiquetas. */}
            <MarketingContactCard contact={contact} />
            {ownedProperties.length > 0 && (
              <Card>
                <SectionHeader
                  inCard
                  title="Sus propiedades"
                  subtitle={`Es propietario de ${ownedProperties.length}`}
                  action={{ label: "Mandar informe", onClick: () => setWhatsapp(true) }}
                />
                <div className="p-3 space-y-1">
                  {ownedProperties.map((p) => {
                    const auth = authorizationState(p.authorization_type, p.authorization_expires_at);
                    const st = AUTHORIZATION_TONE_STYLE[auth.tone];
                    return (
                      <button
                        key={p.id}
                        onClick={() => navigate(`/propiedades/${p.id}`)}
                        className="w-full text-left p-2.5 rounded-xl transition-all hover:bg-violet-50"
                      >
                        <p className="text-sm truncate" style={{ color: "#1A1A1A", fontWeight: 600 }}>
                          {p.title}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
                          {PROPERTY_STATUS_LABEL[p.status]} · {money(p.price, p.currency)}
                        </p>
                        <span
                          className="inline-block text-xs mt-1.5 px-2 py-0.5 rounded-md"
                          style={{ background: st.bg, color: st.text, border: `1px solid ${st.border}`, fontWeight: 600 }}
                        >
                          {auth.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Card>
            )}

            {contact.notes && (
              <Card padded>
                <p
                  className="text-xs uppercase mb-2"
                  style={{ color: "#6B7280", fontWeight: 700, letterSpacing: "0.1em" }}
                >
                  Notas
                </p>
                <p className="text-sm leading-relaxed" style={{ color: "#374151" }}>
                  {contact.notes}
                </p>
              </Card>
            )}

            {currentUserId &&
              contactChats.map((o) => (
                <ChatPanel
                  key={o.id}
                  matchId={o.match_id}
                  propertyTitle={propertyById(o.property_id)?.title ?? "Propiedad"}
                  currentUserId={currentUserId}
                />
              ))}

            {upcoming.length > 0 && (
              <Card>
                <SectionHeader inCard title="Próximas actividades" />
                <div className="p-4 space-y-2">
                  {upcoming.map((ev) => (
                    <div
                      key={ev.id}
                      className="flex items-center gap-3 p-2.5 rounded-xl"
                      style={{ border: "1px solid #F0EDE6" }}
                    >
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: "#F7F0FF", color: "#9B21FF" }}
                      >
                        <PropertyTypeIcon type="casa" size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs truncate" style={{ color: "#1A1A1A", fontWeight: 600 }}>
                          {ev.title}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: "#6B7280", fontSize: 10 }}>
                          {new Date(ev.starts_at).toLocaleDateString("es-AR", {
                            weekday: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <Card>
              <SectionHeader inCard title="Historial" subtitle="Actividad de este contacto" />
              {timeline.length === 0 ? (
                <EmptyState compact title="Sin actividad todavía" />
              ) : (
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
                        <ActivityIcon type={iconFor(a.type)} />
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
                        {a.app_swipe_id && (
                          <div className="mt-2">
                            {a.swipe_status === "accepted" ? (
                              <span className="text-xs px-2.5 py-1 rounded-full inline-block" style={{ background: "#F0FDF4", color: "#15803D", fontWeight: 600 }}>
                                Aceptaste este interés
                              </span>
                            ) : a.swipe_status === "rejected" ? (
                              <span className="text-xs px-2.5 py-1 rounded-full inline-block" style={{ background: "#FFF1F2", color: "#BE123C", fontWeight: 600 }}>
                                Descartaste este interés
                              </span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <button
                                  disabled={respondingId === a.id}
                                  onClick={() => handleRespondSwipe(a.id, "accepted")}
                                  className="text-xs px-3 py-1.5 rounded-lg text-white disabled:opacity-50"
                                  style={{ background: "var(--gradient-brand)", fontWeight: 600 }}
                                >
                                  {respondingId === a.id ? "..." : "Aceptar interés"}
                                </button>
                                <button
                                  disabled={respondingId === a.id}
                                  onClick={() => handleRespondSwipe(a.id, "rejected")}
                                  className="text-xs px-3 py-1.5 rounded-lg border disabled:opacity-50"
                                  style={{ borderColor: "#E9E5DE", color: "#6B7280", fontWeight: 600 }}
                                >
                                  Descartar
                                </button>
                              </div>
                            )}
                            {respondError && respondingId === null && (
                              <p className="text-xs mt-1.5" style={{ color: "#E11D48" }}>
                                {respondError}
                              </p>
                            )}
                          </div>
                        )}
                        {a.app_offer_id && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <SampleBadge record={a} />
                            {a.offer_status === "accepted" ? (
                              <span className="text-xs px-2.5 py-1 rounded-full inline-block" style={{ background: "#F0FDF4", color: "#15803D", fontWeight: 600 }}>
                                Aceptaste esta oferta
                              </span>
                            ) : a.offer_status === "rejected" ? (
                              <span className="text-xs px-2.5 py-1 rounded-full inline-block" style={{ background: "#FFF1F2", color: "#BE123C", fontWeight: 600 }}>
                                Rechazaste esta oferta
                              </span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <button
                                  disabled={respondingId === a.id}
                                  onClick={() => handleRespondOffer(a.id, a.app_offer_id!, "accept")}
                                  className="text-xs px-3 py-1.5 rounded-lg text-white disabled:opacity-50"
                                  style={{ background: "var(--gradient-brand)", fontWeight: 600 }}
                                >
                                  {respondingId === a.id ? "..." : "Aceptar"}
                                </button>
                                <button
                                  disabled={respondingId === a.id}
                                  onClick={() => handleRespondOffer(a.id, a.app_offer_id!, "reject")}
                                  className="text-xs px-3 py-1.5 rounded-lg border disabled:opacity-50"
                                  style={{ borderColor: "#E9E5DE", color: "#6B7280", fontWeight: 600 }}
                                >
                                  Rechazar
                                </button>
                              </div>
                            )}
                            {respondError && respondingId === null && (
                              <p className="text-xs mt-1.5" style={{ color: "#E11D48" }}>
                                {respondError}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {contactMatches.length > 0 && (
              <div
                className="rounded-2xl p-4 flex items-start gap-3"
                style={{ background: "var(--gradient-soft)", border: "1px solid #E9E5DE" }}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "var(--gradient-brand)" }}
                >
                  <MatchesSolidIcon size={16} />
                </div>
                <div>
                  <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                    {contactMatches.length} coincidencias activas
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
                    Se recalculan solas cuando cambia la cartera o sus criterios.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {editing && <ContactFormModal contact={contact} onClose={() => setEditing(false)} />}
      {whatsapp && (() => {
        const pending = allFollowUps.find((f) => f.contact.id === contact.id);
        return (
          <WhatsAppModal
            contact={contact}
            template={pending?.template}
            property={pending?.propertyId ? properties.find((p) => p.id === pending.propertyId) : undefined}
            onClose={() => setWhatsapp(false)}
          />
        );
      })()}
      {toast && (
        <div
          className="pm-toast fixed bottom-6 right-6 z-50 rounded-2xl px-5 py-4 max-w-sm"
          style={{ background: "white", border: "1px solid #BBF7D0", boxShadow: "var(--shadow-pop)" }}
          role="status"
        >
          <p className="text-sm" style={{ color: "#15803D", fontWeight: 700 }}>
            {toast}
          </p>
        </div>
      )}
    </>
  );
}

const KIND_LABEL: Record<string, string> = {
  comprador: "Comprador",
  inquilino: "Inquilino",
  propietario: "Propietario",
  inversor: "Inversor",
  otro: "Otro",
};

const OPERATION_LABEL: Record<string, string> = {
  venta: "Compra",
  alquiler: "Alquiler",
  alquiler_temporal: "Alquiler temporal",
};

function iconFor(type: string): string {
  if (type.startsWith("contacto")) return "contact";
  if (type === "propiedad_publicada") return "property";
  if (type === "visita_programada") return "calendar";
  if (type === "etapa_avanzada") return "arrow";
  if (type === "llamada") return "eye";
  return "match";
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs mb-1" style={{ color: "#6B7280", fontWeight: 600 }}>
        {label}
      </p>
      <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 600 }}>
        {value}
      </p>
    </div>
  );
}
