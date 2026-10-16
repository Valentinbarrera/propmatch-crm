import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, DownloadIcon, MapPinIcon } from "@/components/ui/icons";
import { WhatsAppModal, type Template } from "@/components/share/WhatsAppModal";
import { useStore } from "@/data/store";
import { buildIcsCalendar } from "@/lib/ics";
import type { CalendarEvent, Contact, Property } from "@/types/db";
import { EventFormModal } from "./EventFormModal";
import { AgendaKpis } from "./AgendaKpis";
import { ListView, MonthGrid, TimeGrid, useNow } from "./AgendaCalendar";
import { RouteSheetModal } from "./RouteSheetModal";
import { TasksCard } from "./TasksCard";
import { VisitPanel, type ScheduleDefaults } from "./VisitPanel";
import { useAppVisits } from "./useAppVisits";
import { GoogleCalendarDialog, GcalPrefsToggles, ago, useGcalReturnNotice } from "./GoogleCalendarDialog";
import { useGoogleCalendar } from "@/lib/gcal/GoogleCalendarProvider";
import { appVisitItems } from "@/lib/gcal/items";
import {
  STATUS_META,
  STATUS_ORDER,
  computeKpis,
  firstFreeSlot,
  fmtHour,
  fromAppVisit,
  fromEvent,
  isVisit,
  isoWeek,
  mondayOf,
  rangeFor,
  rangeLabel,
  shiftAnchor,
  startOfDay,
  toBusyBlocks,
  BUSY_COLORS,
  toIcsEvents,
  type AgendaItem,
  type AgendaView,
} from "./agendaModel";

const VIEWS: { value: AgendaView; label: string }[] = [
  { value: "dia", label: "Día" },
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mes" },
  { value: "lista", label: "Lista" },
];

const PREV_LABEL: Record<AgendaView, string> = { dia: "Día anterior", semana: "Semana anterior", mes: "Mes anterior", lista: "Semana anterior" };
const NEXT_LABEL: Record<AgendaView, string> = { dia: "Día siguiente", semana: "Semana siguiente", mes: "Mes siguiente", lista: "Semana siguiente" };
const PERIOD_LABEL: Record<AgendaView, string> = { dia: "hoy", semana: "esta semana", mes: "este mes", lista: "esta semana" };

/** Valor del filtro de asesor para lo que no tiene a nadie asignado. */
const UNASSIGNED = "__sin_asignar";

export default function AgendaPage() {
  const {
    events,
    contacts,
    properties,
    opportunities,
    appOffers,
    profiles,
    appVisitFeedback,
    appVisitChecklist,
    contactById,
    propertyById,
    currentUserId,
  } = useStore();
  const appVisits = useAppVisits();
  const gcal = useGoogleCalendar();
  const [gcalOpen, setGcalOpen] = useState(false);
  const now = useNow();

  const [view, setView] = useState<AgendaView>("semana");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [advisor, setAdvisor] = useState("");
  const [query, setQuery] = useState("");
  /** `null` = la próxima visita, elegida sola. */
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [feedbackRequest, setFeedbackRequest] = useState(0);
  const [form, setForm] = useState<{ event?: CalendarEvent; defaults?: ScheduleDefaults } | null>(null);
  const [routeOpen, setRouteOpen] = useState(false);
  const [whatsapp, setWhatsapp] = useState<{ contact: Contact; template: Template; property?: Property } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /* ── Datos ─────────────────────────────────────────────────────────────── */

  const allItems = useMemo<AgendaItem[]>(() => {
    const ctx = { properties, contacts, opportunities, feedback: appVisitFeedback, checklist: appVisitChecklist };
    return [...events.map(fromEvent), ...appVisits.visits.map((v) => fromAppVisit(v, ctx))];
  }, [events, appVisits.visits, properties, contacts, opportunities, appVisitFeedback, appVisitChecklist]);

  // Google Calendar: al abrir la Agenda se reenvía el link (.ics) y se le pasan
  // las visitas de la app del agente (las otras pantallas no las cargan).
  const { agendaOpened, reportAppVisits } = gcal;
  const feedState = gcal.feed.state;
  const sync = gcal.sync;
  const [gcalNotice, closeGcalNotice] = useGcalReturnNotice(sync.refreshStatus);
  useEffect(() => {
    if (feedState === "active") agendaOpened();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedState]);
  useEffect(() => {
    if (!currentUserId || !appVisits.loaded || appVisits.error) return;
    reportAppVisits(appVisitItems(allItems, { contacts, properties, userId: currentUserId }));
  }, [allItems, appVisits.loaded, appVisits.error, contacts, properties, currentUserId, reportAppVisits]);

  const contactName = useCallback(
    (i: AgendaItem) => contactById(i.contactId)?.full_name ?? i.contactFallback,
    [contactById],
  );
  const propertyTitle = useCallback((i: AgendaItem) => propertyById(i.propertyId)?.title ?? null, [propertyById]);

  const matchesAdvisor = useCallback(
    (ownerId: string | null) => !advisor || (advisor === UNASSIGNED ? !ownerId : ownerId === advisor),
    [advisor],
  );

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allItems.filter((i) => {
      if (!matchesAdvisor(i.ownerId)) return false;
      if (!q) return true;
      return [i.title, contactName(i), propertyTitle(i)].some((s) => s?.toLowerCase().includes(q));
    });
  }, [allItems, matchesAdvisor, query, contactName, propertyTitle]);

  const range = useMemo(() => rangeFor(view, anchor), [view, anchor]);

  // Google Calendar (opción A): con la Agenda abierta se traen los cambios y el «Ocupado» del rango visible.
  const { setAgendaRange } = sync;
  useEffect(() => {
    setAgendaRange({ start: range.start, end: range.end });
  }, [range, setAgendaRange]);
  useEffect(() => () => setAgendaRange(null), [setAgendaRange]);

  /** «Ocupado» de Google: son del agente conectado, se ocultan si se filtra por otro asesor. */
  const busy = useMemo(
    () => (sync.prefs.showBusy && (!advisor || advisor === currentUserId) ? toBusyBlocks(sync.busyBlocks) : []),
    [sync.prefs.showBusy, sync.busyBlocks, advisor, currentUserId],
  );
  const rangeItems = useMemo(
    () => items.filter((i) => i.start >= range.start && i.start < range.end),
    [items, range],
  );
  const weekStart = useMemo(() => mondayOf(anchor), [anchor]);

  const kpis = useMemo(() => {
    const opps = opportunities.filter((o) => matchesAdvisor(o.owner_id));
    const offers = appOffers.filter((of) => {
      if (!advisor) return true;
      const opp = opportunities.find((o) => o.contact_id === of.contact_id && o.property_id === of.property_id);
      return matchesAdvisor(opp?.owner_id ?? null);
    });
    return computeKpis({ items, weekStart, properties, opportunities: opps, appOffers: offers, range, now });
  }, [items, weekStart, properties, opportunities, appOffers, range, now, advisor, matchesAdvisor]);

  const nextItem = useMemo(() => {
    const upcoming = items
      .filter((i) => i.end > now && i.status !== "cancelada")
      .sort((a, b) => a.start.getTime() - b.start.getTime());
    return upcoming.find(isVisit) ?? upcoming[0] ?? null;
  }, [items, now]);

  const selected = (selectedKey && allItems.find((i) => i.key === selectedKey)) || null;
  const panelItem = selected ?? nextItem;

  const freeSlot = useMemo(
    () => firstFreeSlot(items, weekStart, now, 60, busy.filter((b) => !b.allDay)),
    [items, weekStart, now, busy],
  );

  /* ── Acciones ──────────────────────────────────────────────────────────── */

  const select = (i: AgendaItem) => setSelectedKey(i.key);

  const openPendingFeedback = () => {
    const first = kpis.pendingFeedback[0];
    if (!first) return;
    setSelectedKey(first.key);
    setFeedbackRequest((n) => n + 1);
    setAnchor(startOfDay(first.start));
    document.getElementById("agenda-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const exportIcs = () => {
    const icsEvents = toIcsEvents(rangeItems, { property: (id) => propertyById(id), contactName });
    if (icsEvents.length === 0) {
      setNotice("No hay eventos en el período visible para exportar.");
      return;
    }
    const blob = new Blob([buildIcsCalendar(icsEvents, { product: "Agenda" })], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agenda-${range.start.toISOString().slice(0, 10)}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(
      `Descargamos ${icsEvents.length} ${icsEvents.length === 1 ? "evento" : "eventos"} en un .ics: abrilo para sumarlos a tu calendario. Es una copia: los cambios posteriores no se sincronizan.`,
    );
  };

  const advisorName = advisor === UNASSIGNED ? "Sin asignar" : profiles.find((p) => p.id === advisor)?.full_name;

  return (
    <>
      <AppHeader
        title="Agenda y visitas"
        subtitle="Tus visitas y las que piden desde la app, en un solo lugar."
        search={{ placeholder: "Buscar visita, contacto o propiedad...", value: query, onChange: setQuery }}
        action={{ label: "Agendar visita", onClick: () => setForm({ defaults: { type: "visita" } }) }}
      >
        <label className="flex items-center">
          <span className="sr-only">Asesor</span>
          <select
            value={advisor}
            onChange={(e) => {
              setAdvisor(e.target.value);
              setSelectedKey(null);
            }}
            className="h-10 min-h-11 md:min-h-10 px-3 rounded-xl text-sm border outline-none bg-white text-[#1A1A1A] border-[#E9E5DE] focus:border-[#9B21FF] focus:ring-4 focus:ring-[#E9E5DE]"
          >
            <option value="">Todos los asesores</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
            <option value={UNASSIGNED}>Sin asignar</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => setRouteOpen(true)}
          className="h-10 min-h-11 md:min-h-10 px-4 rounded-xl text-sm border flex items-center gap-1.5 hover:bg-violet-50"
          style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 600, background: "white" }}
        >
          <MapPinIcon size={13} color="#7C0BD8" />
          Hoja de ruta
        </button>
      </AppHeader>

      <div className="flex-1 overflow-y-auto" style={{ background: "#FAF8F5" }}>
        {/* Barra del calendario */}
        <div className="flex items-center gap-3 flex-wrap px-4 md:px-6 py-3 border-b bg-white" style={{ borderColor: "#F0EDE6" }}>
          <div className="flex rounded-xl p-1" style={{ background: "#F7F0FF" }} role="group" aria-label="Vista del calendario">
            {VIEWS.map((v) => (
              <button
                key={v.value}
                type="button"
                aria-pressed={view === v.value}
                onClick={() => setView(v.value)}
                className="min-h-11 md:min-h-9 px-3 rounded-lg text-sm transition-all"
                style={
                  view === v.value
                    ? { background: "white", color: "#7C0BD8", fontWeight: 700, boxShadow: "0 1px 4px rgba(168, 85, 255,0.15)" }
                    : { color: "#6B7280", fontWeight: 600 }
                }
              >
                {v.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setAnchor((a) => shiftAnchor(view, a, -1))}
              aria-label={PREV_LABEL[view]}
              className="w-11 h-11 md:w-9 md:h-9 flex items-center justify-center rounded-lg hover:bg-violet-50"
            >
              <ChevronLeftIcon color="#7C0BD8" />
            </button>
            <h2 className="text-sm md:text-base px-1" style={{ color: "#1A1A1A", fontWeight: 800 }} aria-live="polite">
              {rangeLabel(view, range)}
            </h2>
            {view !== "mes" && (
              <span className="px-2 py-0.5 rounded-full text-xs whitespace-nowrap" style={{ background: "#E9E5DE", color: "#7C0BD8", fontWeight: 700 }}>
                Semana {isoWeek(range.start)}
              </span>
            )}
            <button
              type="button"
              onClick={() => setAnchor((a) => shiftAnchor(view, a, 1))}
              aria-label={NEXT_LABEL[view]}
              className="w-11 h-11 md:w-9 md:h-9 flex items-center justify-center rounded-lg hover:bg-violet-50"
            >
              <ChevronRightIcon color="#7C0BD8" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setAnchor(startOfDay(new Date()))}
            className="min-h-11 md:min-h-9 px-3.5 rounded-xl text-sm"
            style={{ background: "var(--gradient-brand)", color: "white", fontWeight: 600 }}
          >
            Hoy
          </button>

          <ul className="flex items-center gap-x-3 gap-y-1 flex-wrap xl:ml-auto" aria-label="Estados de las visitas">
            {STATUS_ORDER.map((s) => (
              <li key={s} className="flex items-center gap-1.5 text-xs" style={{ color: "#6B7280" }}>
                <span className="w-2.5 h-2.5 rounded-full border" style={{ background: STATUS_META[s].text, borderColor: STATUS_META[s].border }} aria-hidden />
                {STATUS_META[s].label}
              </li>
            ))}
            {busy.length > 0 && (
              <li className="flex items-center gap-1.5 text-xs" style={{ color: "#6B7280" }}>
                <span className="w-2.5 h-2.5 rounded-full border" style={{ background: BUSY_COLORS.stripes, borderColor: BUSY_COLORS.border }} aria-hidden />
                Ocupado en Google
              </li>
            )}
          </ul>
        </div>

        <GcalStrip sync={sync} notice={gcalNotice} onCloseNotice={closeGcalNotice} onOpen={() => setGcalOpen(true)} />

        {(appVisits.error || notice) && (
          <div className="px-4 md:px-6 pt-3 space-y-2">
            {appVisits.error && (
              <p role="alert" className="text-xs px-3 py-2 rounded-xl border" style={{ background: "var(--color-state-amber-bg)", color: "var(--color-state-amber-text)", borderColor: "var(--color-state-amber-border)", fontWeight: 600 }}>
                {appVisits.error}
              </p>
            )}
            {notice && (
              <p role="status" className="text-xs px-3 py-2 rounded-xl border flex items-start gap-2" style={{ background: "#F7F0FF", color: "#7C0BD8", borderColor: "#DDD8CF", fontWeight: 600 }}>
                <span className="flex-1">{notice}</span>
                <button type="button" onClick={() => setNotice(null)} aria-label="Cerrar aviso" className="w-6 h-6 rounded hover:bg-white" style={{ lineHeight: 1 }}>
                  ×
                </button>
              </p>
            )}
          </div>
        )}

        <AgendaKpis kpis={kpis} periodLabel={PERIOD_LABEL[view]} onOpenPendingFeedback={openPendingFeedback} />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 px-4 md:px-6 pb-6">
          {/* Calendario */}
          <section
            className="lg:col-span-8 rounded-2xl border bg-white overflow-hidden flex flex-col min-w-0"
            style={{ borderColor: "#E9E5DE", boxShadow: "var(--shadow-card)" }}
            aria-label="Calendario"
          >
            {/* Celular: siempre lista, del período elegido. */}
            <div className="md:hidden">
              <ListView
                days={range.days}
                items={rangeItems}
                selectedKey={panelItem?.key ?? null}
                onSelect={(i) => {
                  select(i);
                  document.getElementById("agenda-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                contactName={contactName}
                propertyTitle={propertyTitle}
                now={now}
                hideEmptyDays={view === "mes"}
                busy={busy}
              />
            </div>

            <div className="hidden md:block overflow-auto max-h-[680px]">
              {(view === "semana" || view === "dia") && (
                <TimeGrid
                  days={range.days}
                  items={rangeItems}
                  selectedKey={panelItem?.key ?? null}
                  onSelect={select}
                  contactName={contactName}
                  now={now}
                  busy={busy}
                />
              )}
              {view === "mes" && (
                <MonthGrid
                  monthStart={range.start}
                  items={items}
                  selectedKey={panelItem?.key ?? null}
                  onSelect={select}
                  onPickDay={(d) => {
                    setAnchor(startOfDay(d));
                    setView("dia");
                  }}
                  now={now}
                  busy={busy}
                />
              )}
              {view === "lista" && (
                <ListView
                  days={range.days}
                  items={rangeItems}
                  selectedKey={panelItem?.key ?? null}
                  onSelect={select}
                  contactName={contactName}
                  propertyTitle={propertyTitle}
                  now={now}
                  busy={busy}
                />
              )}
            </div>

            <div className="flex items-center gap-3 flex-wrap px-4 py-3 border-t mt-auto" style={{ borderColor: "#F0EDE6", background: "#FAF8F5" }}>
              <p className="text-xs flex-1 min-w-0" style={{ color: "#6B7280" }}>
                {freeSlot ? (
                  <>
                    Primer hueco libre de 1 h:{" "}
                    <button
                      type="button"
                      onClick={() => setForm({ defaults: { type: "visita", start: freeSlot.start, ownerId: advisor && advisor !== UNASSIGNED ? advisor : undefined } })}
                      className="underline underline-offset-2 min-h-11 md:min-h-0"
                      style={{ color: "#7C0BD8", fontWeight: 700 }}
                      title="Agendar una visita en este horario"
                    >
                      {freeSlot.start.toLocaleDateString("es-AR", { weekday: "short", day: "numeric" })}, {fmtHour(freeSlot.start)} a {fmtHour(freeSlot.end)}
                    </button>
                    <span className="hidden sm:inline"> (lun a sáb, 9 a 19 h{advisorName ? `, ${advisorName}` : ""})</span>
                  </>
                ) : (
                  "Sin huecos libres de 1 h esta semana (lun a sáb, 9 a 19 h)."
                )}
                {appVisits.enabled && (
                  <span className="block mt-0.5">
                    {appVisits.visits.length} {appVisits.visits.length === 1 ? "visita viene" : "visitas vienen"} de la app (solo lectura).
                  </span>
                )}
              </p>
              <button
                type="button"
                onClick={exportIcs}
                className="min-h-11 md:min-h-9 px-3 rounded-lg text-xs border flex items-center gap-1.5 hover:bg-violet-50"
                style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 700, background: "white" }}
              >
                <DownloadIcon size={13} />
                Exportar agenda (.ics)
              </button>
              <button
                type="button"
                onClick={() => setGcalOpen(true)}
                className="min-h-11 md:min-h-9 px-3 rounded-lg text-xs border flex items-center gap-1.5 hover:bg-violet-50"
                style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 700, background: "white" }}
              >
                <CalendarIcon size={13} />
                Google Calendar
              </button>
            </div>
          </section>

          {/* Panel de la visita + tareas */}
          <div className="lg:col-span-4 space-y-4 min-w-0">
            <section
              id="agenda-panel"
              className="rounded-2xl border bg-white overflow-hidden scroll-mt-4"
              style={{ borderColor: "#E9E5DE", boxShadow: "var(--shadow-card)" }}
              aria-label="Detalle de la visita"
            >
              <VisitPanel
                key={panelItem?.key ?? "none"}
                item={panelItem}
                isNext={!selected}
                now={now}
                feedbackRequest={panelItem && panelItem.key === selectedKey ? feedbackRequest : 0}
                onEdit={(event) => setForm({ event })}
                onWhatsApp={(contact, template, property) => setWhatsapp({ contact, template, property })}
                onSchedule={(defaults) => setForm({ defaults })}
              />
            </section>
            <TasksCard />
          </div>
        </div>
      </div>

      {form && (
        <EventFormModal
          key={form.event?.id ?? "new"}
          event={form.event}
          defaults={form.defaults}
          onClose={() => setForm(null)}
        />
      )}
      {gcalOpen && <GoogleCalendarDialog onClose={() => setGcalOpen(false)} />}
      {routeOpen && (
        <RouteSheetModal
          items={items}
          initialDay={view === "dia" || range.days.some((d) => d.toDateString() === now.toDateString()) ? (view === "dia" ? anchor : now) : range.start}
          contactName={contactName}
          onClose={() => setRouteOpen(false)}
        />
      )}
      {whatsapp && (
        <WhatsAppModal
          contact={whatsapp.contact}
          property={whatsapp.property}
          template={whatsapp.template}
          onClose={() => setWhatsapp(null)}
        />
      )}
    </>
  );
}

/**
 * Franja de Google Calendar arriba del calendario: aviso al volver del login,
 * estado de la conexión (cuenta, última sincronización, error) y los toggles
 * de «Ocupado». Si no está conectado, solo un acceso discreto al diálogo.
 */
function GcalStrip({
  sync,
  notice,
  onCloseNotice,
  onOpen,
}: {
  sync: ReturnType<typeof useGoogleCalendar>["sync"];
  notice: { ok: boolean; text: string } | null;
  onCloseNotice: () => void;
  onOpen: () => void;
}) {
  const box = "text-xs px-3 py-2 rounded-xl border flex items-start gap-2 flex-wrap";
  return (
    <div className="px-4 md:px-6 pt-3 space-y-2 empty:hidden">
      {notice && (
        <p
          role="status"
          className={box}
          style={notice.ok ? { background: "#F0FDF4", color: "#15803D", borderColor: "#BBF7D0", fontWeight: 600 } : { background: "#FFF1F2", color: "#BE123C", borderColor: "#FECDD3", fontWeight: 600 }}
        >
          <span className="flex-1">{notice.text}</span>
          <button type="button" onClick={onCloseNotice} aria-label="Cerrar aviso" className="w-6 h-6 rounded hover:bg-white" style={{ lineHeight: 1 }}>
            ×
          </button>
        </p>
      )}
      {sync.state === "needs_reauth" && (
        <p role="alert" className={box} style={{ background: "#FFF1F2", color: "#BE123C", borderColor: "#FECDD3", fontWeight: 600 }}>
          <span className="flex-1">{sync.error ?? "Google desconectó PropMatch de tu cuenta. Volvé a conectar."}</span>
          <button type="button" onClick={() => void sync.connect("agenda")} className="underline underline-offset-2" style={{ fontWeight: 700 }}>
            Volver a conectar
          </button>
        </p>
      )}
      {sync.state === "connected" && (
        <div className={box} style={{ background: "#F8FAFC", color: "#374151", borderColor: "#E2E8F0" }}>
          <span className="flex-1 min-w-0">
            <strong>Google Calendar</strong> conectado{sync.email ? ` (${sync.email})` : ""} ·{" "}
            {sync.syncing ? "sincronizando…" : `última sincronización ${ago(sync.lastSyncAt) ?? "pendiente"}`}
            {sync.error && (
              <span className="block mt-0.5" style={{ color: "#92400E", fontWeight: 600 }}>
                {sync.error}
              </span>
            )}
          </span>
          <GcalPrefsToggles sync={sync} />
          <button type="button" onClick={onOpen} className="underline underline-offset-2 self-center" style={{ color: "#7C0BD8", fontWeight: 700 }}>
            Opciones
          </button>
        </div>
      )}
    </div>
  );
}
