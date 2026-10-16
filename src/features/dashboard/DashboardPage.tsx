import { isSample } from "@/lib/samples";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OnboardingChecklist } from "./OnboardingChecklist";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, SectionHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/states";
import {
  ActivityIcon,
  AgendaIcon,
  AlertTriangleIcon,
  ContactsIcon,
  HomeIcon,
  InboxIcon,
  MatchesSolidIcon,
  OpportunitiesIcon,
  PropertiesIcon,
  WhatsAppIcon,
} from "@/components/ui/icons";
import { useStore, STAGE_LABEL } from "@/data/store";
import { useFollowUps } from "@/data/useFollowUps";
import { WhatsAppButton, WhatsAppModal } from "@/components/share/WhatsAppModal";
import { authorizationState, AUTHORIZATION_WARNING_DAYS } from "@/lib/authorization";
import {
  avatarGradient,
  greeting,
  initials,
  money,
  moneyCompact,
  relativeTime,
} from "@/lib/format";
import { firstName } from "@/lib/whatsapp";
import type { FollowUp } from "@/lib/followups";
import type { OpportunityStage } from "@/types/db";

const STAGE_BADGE: Record<OpportunityStage, { bg: string; text: string; border: string }> = {
  nuevos: { bg: "#F7F0FF", text: "#9B21FF", border: "#DDD8CF" },
  contactados: { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE" },
  visita: { bg: "#ECFEFF", text: "#0E7490", border: "#CFFAFE" },
  negociacion: { bg: "#FFFBEB", text: "#B45309", border: "#FDE68A" },
  cierre: { bg: "#F0FDF4", text: "#047857", border: "#D1FAE5" },
  perdida: { bg: "#FFF1F2", text: "#E11D48", border: "#FECDD3" },
};

const STAGES: OpportunityStage[] = ["nuevos", "contactados", "visita", "negociacion", "cierre"];

const ROADMAP_FEATURES = [
  { emoji: "🟡", bg: "#FEF3C7", title: "Mercado Libre", desc: "Publicá tus propiedades en ML Inmuebles desde el CRM.", note: "En certificación" },
  { emoji: "🏠", bg: "#ECFDF5", title: "Zonaprop", desc: "Publicá tus propiedades directo en el portal.", note: "Próximamente" },
  { emoji: "🏡", bg: "#F0F9FF", title: "Argenprop", desc: "Integración en análisis técnico con el portal.", note: "En negociación" },
  { emoji: "🏛️", bg: "#EFF6FF", title: "CABAPROP", desc: "Portal oficial del Colegio de Martilleros de CABA.", note: "Próximamente" },
  { emoji: "📘", bg: "#EFF6FF", title: "Facebook", desc: "Publicá propiedades en tu página de Facebook.", note: "App Review pendiente" },
  { emoji: "📸", bg: "#F7F0FF", title: "Instagram", desc: "Publicá propiedades en tu cuenta de Instagram.", note: "App Review pendiente" },
  { emoji: "💬", bg: "#F0FDF4", title: "WhatsApp Business API", desc: "Enviá campañas automáticas desde tu número oficial.", note: "Próximamente" },
  { emoji: "📅", bg: "#F7F0FF", title: "Google Calendar", desc: "Sincronizá tu agenda de visitas con Google.", note: "Próximamente" },
  { emoji: "✍️", bg: "#FFF7ED", title: "Firma digital", desc: "Boletos y reservas firmados online desde el CRM.", note: "Próximamente" },
  { emoji: "📊", bg: "#F7F0FF", title: "Reportes avanzados", desc: "Analytics de rendimiento, conversión y cartera.", note: "Próximamente" },
  { emoji: "👥", bg: "#F0F9FF", title: "Equipo y roles", desc: "Múltiples asesores con permisos diferenciados.", note: "Próximamente" },
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const {
    profile,
    properties,
    contacts,
    opportunities,
    activities,
    events,
    propertyById,
    coverPhoto,
    appOffers,
    logActivity,
    snoozeFollowUp,
  } = useStore();

  const followUps = useFollowUps();
  const [query, setQuery] = useState("");
  const [writing, setWriting] = useState<FollowUp | null>(null);
  const [doneFlash, setDoneFlash] = useState<string | null>(null);
  const [todayExpanded, setTodayExpanded] = useState(false);

  const userFirstName = profile.full_name.split(" ")[0];

  /* ── KPIs ─────────────────────────────────────────────────────────────── */
  const kpis = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86_400_000;
    const activeProps = properties.filter((p) => !isSample(p) && p.status === "disponible");
    const openOpps = opportunities.filter((o) => !isSample(o) && o.stage !== "perdida");
    const newContactsWeek = contacts.filter((c) => !isSample(c) && new Date(c.created_at).getTime() > weekAgo);
    const pendingOffers = appOffers.filter((o) => o.status === "pending");

    const pipelineUSD = openOpps.filter((o) => o.currency === "USD").reduce((s, o) => s + (o.value ?? 0), 0);
    const pipelineARS = openOpps.filter((o) => o.currency === "ARS").reduce((s, o) => s + (o.value ?? 0), 0);
    const hasUSD = openOpps.some((o) => o.currency === "USD");
    const hasARS = openOpps.some((o) => o.currency === "ARS");

    return { activeProps, openOpps, newContactsWeek, pendingOffers, pipelineUSD, pipelineARS, hasUSD, hasARS };
  }, [properties, opportunities, contacts, appOffers]);

  /* ── Sección Hoy ─────────────────────────────────────────────────────── */
  const todayItems = useMemo(() => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const offerItems = kpis.pendingOffers.map((o) => ({
      kind: "offer" as const,
      id: o.id,
      label: `Oferta de USD ${Math.round(o.amount_usd ?? 0).toLocaleString("es-AR")}`,
      detail: "Pendiente de revisión",
      priority: 0,
    }));

    const followUpItems = followUps.map((f) => ({
      kind: "followup" as const,
      id: f.contact.id,
      followUp: f,
      label: f.contact.full_name,
      detail: f.reason,
      priority: f.priority,
    }));

    const visitItems = events
      .filter((e) => e.type === "visita" && e.starts_at?.startsWith(todayStr))
      .map((e) => ({
        kind: "visit" as const,
        id: e.id,
        label: e.title,
        detail: e.starts_at
          ? new Date(e.starts_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
          : "Hoy",
        priority: 1,
      }));

    const authItems = properties
      .filter((p) => !isSample(p) && p.status === "disponible")
      .map((p) => {
        const state = authorizationState(p.authorization_type, p.authorization_expires_at);
        if (state.tone !== "warning" && state.tone !== "expired") return null;
        if (state.daysLeft !== null && state.daysLeft > AUTHORIZATION_WARNING_DAYS) return null;
        return {
          kind: "auth" as const,
          id: p.id,
          label: p.title,
          detail: state.label,
          priority: state.tone === "expired" ? 0 : 2,
        };
      })
      .filter(Boolean) as { kind: "auth"; id: string; label: string; detail: string; priority: number }[];

    return [...offerItems, ...followUpItems, ...visitItems, ...authItems].sort(
      (a, b) => a.priority - b.priority,
    );
  }, [kpis.pendingOffers, followUps, events, properties]);

  /* ── Pipeline por etapas ─────────────────────────────────────────────── */
  const pipelineByStage = useMemo(() => {
    const openOpps = opportunities.filter((o) => !isSample(o) && o.stage !== "perdida");
    return STAGES.map((stage) => ({
      stage,
      count: openOpps.filter((o) => o.stage === stage).length,
    }));
  }, [opportunities]);

  /* ── Propiedades que necesitan atención ──────────────────────────────── */
  const needsAttention = useMemo(() => {
    return properties
      .filter((p) => !isSample(p) && (coverPhoto(p.id) === null || p.status === "en_revision"))
      .slice(0, 3);
  }, [properties, coverPhoto]);

  /* ── Búsqueda global ─────────────────────────────────────────────────── */
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return {
      properties: properties.filter((p) => p.title.toLowerCase().includes(q)).slice(0, 5),
      contacts: contacts.filter((c) => c.full_name.toLowerCase().includes(q)).slice(0, 5),
    };
  }, [query, properties, contacts]);

  /* ── Actividad reciente ───────────────────────────────────────────────── */
  const recentActivity = activities.slice(0, 5);

  /* ── Estado vacío (onboarding) ───────────────────────────────────────── */
  const isEmpty = properties.filter((p) => !isSample(p)).length === 0 &&
    contacts.filter((c) => !isSample(c)).length === 0;

  /* ── Helpers ─────────────────────────────────────────────────────────── */
  function flash(name: string) {
    setDoneFlash(name);
    setTimeout(() => setDoneFlash(null), 2200);
  }

  function markFollowUpDone(f: FollowUp) {
    logActivity({
      type: "llamada",
      title: `Seguimiento a ${firstName(f.contact.full_name)}`,
      detail: f.reason,
      contact_id: f.contact.id,
      property_id: null,
    });
    flash(f.contact.full_name);
  }

  const QUICK_ACTIONS = [
    { label: "Nueva propiedad", icon: <HomeIcon size={18} color="#9B21FF" />, path: "/propiedades/nueva", bg: "#F7F0FF" },
    { label: "Subir y publicar", icon: <PropertiesIcon size={18} color="#FF5ECA" />, path: "/publicador", bg: "#FFF1FA" },
    { label: "Nuevo contacto", icon: <ContactsIcon size={18} color="#0E7490" />, path: "/contactos/nuevo", bg: "#ECFEFF" },
    { label: "Registrar visita", icon: <AgendaIcon size={18} color="#B45309" />, path: "/agenda", bg: "#FFFBEB" },
    { label: "Nueva operación", icon: <OpportunitiesIcon size={18} color="#047857" />, path: "/operaciones/nueva", bg: "#F0FDF4" },
    { label: "Abrir Inbox", icon: <InboxIcon size={18} color="#1D4ED8" />, path: "/inbox", bg: "#EFF6FF" },
    { label: "Agenda de hoy", icon: <AgendaIcon size={18} color="#9B21FF" />, path: "/agenda", bg: "#F7F0FF" },
    { label: "Multipublicador", icon: <MatchesSolidIcon size={18} color="#FF5ECA" />, path: "/publicador", bg: "#FFF1FA" },
  ];

  const COLLAPSED_TODAY = 6;
  const visibleToday = todayExpanded ? todayItems : todayItems.slice(0, COLLAPSED_TODAY);

  return (
    <>
      <AppHeader
        title={`${greeting()}, ${userFirstName}`}
        titleAccent={<span className="text-gradient-brand-h"> ✦</span>}
        subtitle={`${todayItems.length > 0 ? `${todayItems.length} ${todayItems.length === 1 ? "cosa" : "cosas"} para hoy` : "Al día con todo."}`}
        search={{ placeholder: "Buscar...", value: query, onChange: setQuery }}
        action={{ label: "Agregar", onClick: () => navigate("/propiedades/nueva") }}
      />

      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-8">
        {searchResults ? (
          <SearchResults
            results={searchResults}
            coverPhoto={coverPhoto}
            onClear={() => setQuery("")}
            onProperty={(id) => navigate(`/propiedades/${id}`)}
            onContact={(id) => navigate(`/contactos/${id}`)}
          />
        ) : (
          <>
            {/* Accesos directos */}
            <div className="mt-5 md:mt-6 -mx-1">
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide px-1">
                {QUICK_ACTIONS.map((a) => (
                  <button
                    key={a.label}
                    onClick={() => navigate(a.path)}
                    className="flex-shrink-0 flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl border transition-all hover:shadow-sm hover:border-violet-200"
                    style={{ borderColor: "#E9E5DE", background: "white", minWidth: 80, height: 64 }}
                  >
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: a.bg }}
                    >
                      {a.icon}
                    </div>
                    <span className="text-[10px] text-center leading-tight whitespace-nowrap" style={{ color: "#374151", fontWeight: 600 }}>
                      {a.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {isEmpty ? (
              /* Estado vacío: checklist de onboarding */
              <OnboardingChecklist
                hasProperties={false}
                hasContacts={false}
                hasMeli={false}
                hasAppPublications={false}
              />
            ) : (
              <>
                {/* KPIs compactos */}
                <div
                  className="mt-4 rounded-2xl border flex flex-wrap gap-0 overflow-hidden"
                  style={{ borderColor: "#E9E5DE", background: "white" }}
                >
                  <MiniStat
                    value={String(kpis.activeProps.length)}
                    label="Propiedades activas"
                    icon={<HomeIcon size={14} color="#9B21FF" />}
                  />
                  <MiniStat
                    value={String(kpis.openOpps.length)}
                    label="Oportunidades abiertas"
                    icon={<OpportunitiesIcon size={14} color="#FF5ECA" />}
                  />
                  <MiniStat
                    value={`+${kpis.newContactsWeek.length}`}
                    label="Contactos esta semana"
                    icon={<ContactsIcon size={14} color="#0E7490" />}
                  />
                  {kpis.pendingOffers.length > 0 && (
                    <MiniStat
                      value={String(kpis.pendingOffers.length)}
                      label="Ofertas pendientes"
                      icon={<AlertTriangleIcon size={14} color="#B45309" />}
                      highlight
                      onClick={() => navigate("/ofertas")}
                    />
                  )}
                  {kpis.hasUSD && (
                    <MiniStat
                      value={moneyCompact(kpis.pipelineUSD, "USD")}
                      label="Pipeline USD"
                      icon={<span style={{ fontSize: 11, fontWeight: 700, color: "#047857" }}>$</span>}
                    />
                  )}
                  {kpis.hasARS && (
                    <MiniStat
                      value={moneyCompact(kpis.pipelineARS, "ARS")}
                      label="Pipeline ARS"
                      icon={<span style={{ fontSize: 11, fontWeight: 700, color: "#047857" }}>$</span>}
                    />
                  )}
                </div>

                {/* Cuerpo principal */}
                <div className="mt-6 grid grid-cols-1 xl:grid-cols-3 gap-6">
                  {/* Hoy (2/3) */}
                  <div className="xl:col-span-2 min-w-0">
                    <Card>
                      <div
                        className="px-5 py-4 border-b flex items-center justify-between gap-3"
                        style={{ borderColor: "#F0EDE6" }}
                      >
                        <div>
                          <h2 className="text-base" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                            Hoy
                          </h2>
                          <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
                            {todayItems.length === 0
                              ? "Sin pendientes — estás al día"
                              : `${todayItems.length} ${todayItems.length === 1 ? "acción pendiente" : "acciones pendientes"}`}
                          </p>
                        </div>
                        {doneFlash && (
                          <span
                            className="text-xs px-3 py-1.5 rounded-lg"
                            style={{ background: "#F0FDF4", color: "#15803D", fontWeight: 600 }}
                          >
                            ✓ {firstName(doneFlash)} listo
                          </span>
                        )}
                      </div>

                      {todayItems.length === 0 ? (
                        <div className="px-5 py-10 text-center">
                          <p className="text-sm" style={{ color: "#6B7280" }}>
                            No hay seguimientos, visitas ni autorizaciones por vencer hoy.
                          </p>
                          <button
                            onClick={() => navigate("/propiedades/nueva")}
                            className="mt-4 text-xs px-4 py-2 rounded-xl border transition-all hover:bg-violet-50"
                            style={{ borderColor: "#E9E5DE", color: "#9B21FF", fontWeight: 600 }}
                          >
                            Cargar una propiedad
                          </button>
                        </div>
                      ) : (
                        <div className="p-2">
                          {visibleToday.map((item) => (
                            <TodayRow
                              key={`${item.kind}-${item.id}`}
                              item={item}
                              onNavigate={navigate}
                              onWrite={setWriting}
                              onMarkDone={markFollowUpDone}
                              onSnooze={(id) => snoozeFollowUp(id, 3)}
                            />
                          ))}
                          {todayItems.length > COLLAPSED_TODAY && (
                            <button
                              onClick={() => setTodayExpanded((v) => !v)}
                              className="w-full mt-1 py-2 rounded-xl text-xs transition-all hover:bg-violet-50"
                              style={{ color: "#9B21FF", fontWeight: 600 }}
                            >
                              {todayExpanded
                                ? "Ver menos"
                                : `Ver los ${todayItems.length - COLLAPSED_TODAY} restantes`}
                            </button>
                          )}
                        </div>
                      )}
                    </Card>
                  </div>

                  {/* Columna lateral (1/3) */}
                  <div className="xl:col-span-1 min-w-0 flex flex-col gap-6">
                    {/* Pipeline por etapas */}
                    <Card>
                      <SectionHeader
                        inCard
                        title="Pipeline"
                        subtitle={`${kpis.openOpps.length} oportunidades abiertas`}
                        action={{ label: "Ver todas", onClick: () => navigate("/oportunidades") }}
                      />
                      <div className="px-5 pb-4">
                        {pipelineByStage.every((s) => s.count === 0) ? (
                          <p className="text-xs py-4 text-center" style={{ color: "#6B7280" }}>
                            Sin oportunidades activas todavía
                          </p>
                        ) : (
                          <>
                            {/* Barra segmentada */}
                            <div className="flex h-2.5 rounded-full overflow-hidden mb-3">
                              {pipelineByStage
                                .filter((s) => s.count > 0)
                                .map((s, _i, arr) => {
                                  const total = arr.reduce((sum, x) => sum + x.count, 0);
                                  return (
                                    <button
                                      key={s.stage}
                                      onClick={() => navigate("/oportunidades")}
                                      title={`${STAGE_LABEL[s.stage]}: ${s.count}`}
                                      className="h-full transition-opacity hover:opacity-80"
                                      style={{
                                        width: `${(s.count / total) * 100}%`,
                                        background: STAGE_BADGE[s.stage].text,
                                        minWidth: 4,
                                      }}
                                    />
                                  );
                                })}
                            </div>
                            {/* Conteos por etapa */}
                            <div className="space-y-1.5">
                              {pipelineByStage.map((s) => (
                                <button
                                  key={s.stage}
                                  onClick={() => navigate("/oportunidades")}
                                  className="w-full flex items-center justify-between py-1.5 px-2 rounded-lg transition-all hover:bg-violet-50 text-left"
                                >
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="w-2 h-2 rounded-full flex-shrink-0"
                                      style={{ background: STAGE_BADGE[s.stage].text }}
                                    />
                                    <span className="text-xs" style={{ color: "#374151", fontWeight: 500 }}>
                                      {STAGE_LABEL[s.stage]}
                                    </span>
                                  </div>
                                  <span
                                    className="text-xs px-2 py-0.5 rounded-full"
                                    style={{
                                      background: STAGE_BADGE[s.stage].bg,
                                      color: STAGE_BADGE[s.stage].text,
                                      fontWeight: 600,
                                    }}
                                  >
                                    {s.count}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </Card>

                    {/* Propiedades que necesitan atención */}
                    {needsAttention.length > 0 && (
                      <Card>
                        <SectionHeader
                          inCard
                          title="Necesitan atención"
                          subtitle="Sin fotos o en revisión"
                        />
                        <div className="px-3 pb-3 space-y-1">
                          {needsAttention.map((p) => (
                            <button
                              key={p.id}
                              onClick={() => navigate(`/propiedades/${p.id}`)}
                              className="w-full flex items-center gap-3 p-2.5 rounded-xl transition-all hover:bg-violet-50 text-left"
                            >
                              <div
                                className="w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center"
                                style={{ background: "#F7F0FF" }}
                              >
                                <HomeIcon size={16} color="#BF7FFF" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs truncate" style={{ color: "#1A1A1A", fontWeight: 600 }}>
                                  {p.title}
                                </p>
                                <p className="text-[11px]" style={{ color: coverPhoto(p.id) === null ? "#B45309" : "#2563EB" }}>
                                  {coverPhoto(p.id) === null ? "Sin fotos" : "En revisión"}
                                </p>
                              </div>
                              <span className="text-[11px]" style={{ color: "#9B21FF", fontWeight: 600 }}>
                                Ver →
                              </span>
                            </button>
                          ))}
                        </div>
                      </Card>
                    )}
                  </div>
                </div>

                {/* Actividad reciente */}
                {recentActivity.length > 0 && (
                  <div className="mt-6">
                    <Card>
                      <SectionHeader
                        inCard
                        title="Actividad reciente"
                        subtitle="Últimas acciones del equipo"
                      />
                      <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                        {recentActivity.map((a) => (
                          <div key={a.id} className="flex items-start gap-3 py-1">
                            <div
                              className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                              style={{ background: "#F7F0FF", color: "#9B21FF" }}
                            >
                              <ActivityIcon type={iconFor(a.type)} size={13} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs truncate" style={{ color: "#374151", fontWeight: 500 }}>
                                {a.title}
                              </p>
                              {a.detail && (
                                <p className="text-[11px] truncate mt-0.5" style={{ color: "#1A1A1A", fontWeight: 600 }}>
                                  {a.detail}
                                </p>
                              )}
                              <p className="text-[11px] mt-0.5" style={{ color: "#9CA3AF" }}>
                                {relativeTime(a.created_at)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* Lo que viene */}
        <section className="mt-10 pb-2">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xl tracking-tight" style={{ color: "#1A1A1A", fontWeight: 800 }}>Lo que viene</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs" style={{ background: "#F7F0FF", color: "#9B21FF", fontWeight: 700 }}>
              En desarrollo
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {ROADMAP_FEATURES.map((f) => (
              <div
                key={f.title}
                className="flex items-start gap-3 p-4 rounded-2xl border"
                style={{ borderColor: "#E9E5DE", background: "white" }}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base"
                  style={{ background: f.bg, fontSize: 18 }}
                >
                  {f.emoji}
                </div>
                <div className="min-w-0">
                  <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>{f.title}</p>
                  <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "#6B7280" }}>{f.desc}</p>
                  {f.note && (
                    <span className="inline-block mt-1.5 text-[11px] px-2 py-0.5 rounded-full" style={{ background: "#F7F0FF", color: "#9B21FF", fontWeight: 600 }}>
                      {f.note}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {writing && (
        <WhatsAppModal
          key={writing.contact.id}
          contact={writing.contact}
          property={propertyById(writing.propertyId)}
          template={writing.template}
          onClose={() => setWriting(null)}
          onSent={() => flash(writing.contact.full_name)}
        />
      )}
    </>
  );
}

/* ── Fila de "Hoy" ───────────────────────────────────────────────────────── */

type TodayItemBase = { kind: string; id: string; label: string; detail: string; priority: number };
type TodayItem =
  | (TodayItemBase & { kind: "offer" })
  | (TodayItemBase & { kind: "followup"; followUp: FollowUp })
  | (TodayItemBase & { kind: "visit" })
  | (TodayItemBase & { kind: "auth" });

function TodayRow({
  item,
  onNavigate,
  onWrite,
  onMarkDone,
  onSnooze,
}: {
  item: TodayItem;
  onNavigate: (path: string) => void;
  onWrite: (f: FollowUp) => void;
  onMarkDone: (f: FollowUp) => void;
  onSnooze: (id: string) => void;
}) {
  const PRIORITY_DOT: Record<number, string> = { 0: "#E11D48", 1: "#E11D48", 2: "#F59E0B", 3: "#BF7FFF" };
  const dot = PRIORITY_DOT[item.priority] ?? "#BF7FFF";

  const icon =
    item.kind === "offer" ? <span style={{ fontSize: 14 }}>💰</span>
    : item.kind === "visit" ? <span style={{ fontSize: 14 }}>🏠</span>
    : item.kind === "auth" ? <AlertTriangleIcon size={14} color="#B45309" />
    : <WhatsAppIcon size={14} color="#9B21FF" />;

  return (
    <div
      className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2 px-3 py-2.5 rounded-xl transition-all hover:bg-violet-50"
      style={{ minHeight: 44 }}
    >
      {/* Ícono con dot de prioridad */}
      <div className="relative flex-shrink-0">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: "#F7F0FF" }}
        >
          {icon}
        </div>
        {item.priority <= 1 && (
          <span
            className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white"
            style={{ background: dot }}
          />
        )}
      </div>

      {/* Texto */}
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate" style={{ color: "#1A1A1A", fontWeight: 600 }}>
          {item.label}
        </p>
        <p className="text-xs truncate" style={{ color: item.priority <= 1 ? "#BE123C" : "#6B7280", fontWeight: item.priority <= 1 ? 600 : 400 }}>
          {item.detail}
        </p>
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-1 flex-shrink-0 pl-11 sm:pl-0">
        {item.kind === "offer" && (
          <button
            onClick={() => onNavigate("/ofertas")}
            className="h-9 px-3 rounded-xl text-xs border transition-all hover:bg-violet-50"
            style={{ borderColor: "#E9E5DE", color: "#9B21FF", fontWeight: 600, background: "#FAF8F5" }}
          >
            Revisar
          </button>
        )}
        {item.kind === "followup" && (
          <>
            <WhatsAppButton compact label={`WhatsApp a ${item.followUp.contact.full_name}`} onClick={() => onWrite(item.followUp)} />
            <button
              onClick={() => onMarkDone(item.followUp)}
              className="h-9 px-2.5 rounded-xl text-xs border transition-all hover:bg-white"
              style={{ borderColor: "#E9E5DE", color: "#9B21FF", fontWeight: 600, background: "#FAF8F5" }}
            >
              ✓ Hecho
            </button>
            <button
              onClick={() => onSnooze(item.followUp.contact.id)}
              className="h-9 px-2.5 rounded-xl text-xs transition-all hover:bg-white"
              style={{ color: "#6B7280", fontWeight: 600 }}
            >
              Posponer
            </button>
          </>
        )}
        {item.kind === "visit" && (
          <button
            onClick={() => onNavigate("/agenda")}
            className="h-9 px-3 rounded-xl text-xs border transition-all hover:bg-violet-50"
            style={{ borderColor: "#E9E5DE", color: "#9B21FF", fontWeight: 600, background: "#FAF8F5" }}
          >
            Agenda
          </button>
        )}
        {item.kind === "auth" && (
          <button
            onClick={() => onNavigate(`/propiedades/${item.id}`)}
            className="h-9 px-3 rounded-xl text-xs border transition-all hover:bg-amber-50"
            style={{ borderColor: "#FDE68A", color: "#B45309", fontWeight: 600, background: "#FFFBEB" }}
          >
            Abrir
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Mini stat (fila de KPIs) ────────────────────────────────────────────── */

function MiniStat({
  value,
  label,
  icon,
  highlight,
  onClick,
}: {
  value: string;
  label: string;
  icon: React.ReactNode;
  highlight?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`flex items-center gap-2.5 px-4 py-3 border-r last:border-r-0 flex-1 min-w-0 transition-all ${onClick ? "hover:bg-violet-50 cursor-pointer" : "cursor-default"}`}
      style={{
        borderColor: "#F0EDE6",
        background: highlight ? "#FFFBEB" : "transparent",
      }}
    >
      <div
        className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
        style={{ background: highlight ? "#FDE68A" : "#F7F0FF" }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm leading-none" style={{ color: "#1A1A1A", fontWeight: 700 }}>
          {value}
        </p>
        <p className="text-[10px] mt-0.5 truncate" style={{ color: "#6B7280" }}>
          {label}
        </p>
      </div>
    </button>
  );
}

/* ── Búsqueda global ─────────────────────────────────────────────────────── */

function SearchResults({
  results,
  coverPhoto,
  onClear,
  onProperty,
  onContact,
}: {
  results: {
    properties: { id: string; title: string; zone: string | null; price: number | null }[];
    contacts: { id: string; full_name: string; email: string | null }[];
  };
  coverPhoto: (id: string) => string | null;
  onClear: () => void;
  onProperty: (id: string) => void;
  onContact: (id: string) => void;
}) {
  const empty = results.properties.length === 0 && results.contacts.length === 0;

  return (
    <div className="mt-8">
      <SectionHeader
        title="Resultados de la búsqueda"
        subtitle={`${results.properties.length} propiedades · ${results.contacts.length} contactos`}
        action={{ label: "Limpiar", onClick: onClear }}
      />
      {empty ? (
        <Card>
          <EmptyState compact title="Sin resultados" description="Probá con otro nombre o dirección." />
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {results.properties.length > 0 && (
            <Card>
              <SectionHeader inCard title="Propiedades" />
              <div className="p-3">
                {results.properties.map((p) => {
                  const photo = coverPhoto(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => onProperty(p.id)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl transition-all hover:bg-violet-50 text-left"
                    >
                      <div className="w-11 h-11 rounded-lg overflow-hidden flex-shrink-0" style={{ background: "#F7F0FF" }}>
                        {photo && <img src={photo} alt="" className="w-full h-full object-cover" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate" style={{ color: "#1A1A1A", fontWeight: 600 }}>{p.title}</p>
                        <p className="text-xs" style={{ color: "#6B7280" }}>{p.zone}</p>
                      </div>
                      <span className="text-sm whitespace-nowrap" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                        {money(p.price)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Card>
          )}
          {results.contacts.length > 0 && (
            <Card>
              <SectionHeader inCard title="Contactos" />
              <div className="p-3">
                {results.contacts.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => onContact(c.id)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl transition-all hover:bg-violet-50 text-left"
                  >
                    <div
                      className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarGradient(c.full_name)} flex items-center justify-center text-xs text-white flex-shrink-0`}
                      style={{ fontWeight: 700 }}
                    >
                      {initials(c.full_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate" style={{ color: "#1A1A1A", fontWeight: 600 }}>{c.full_name}</p>
                      <p className="text-xs truncate" style={{ color: "#6B7280" }}>{c.email}</p>
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function iconFor(type: string): string {
  if (type.startsWith("contacto")) return "contact";
  if (type === "propiedad_publicada") return "property";
  if (type === "visita_programada") return "calendar";
  if (type === "etapa_avanzada") return "arrow";
  if (type === "llamada") return "eye";
  return "match";
}
