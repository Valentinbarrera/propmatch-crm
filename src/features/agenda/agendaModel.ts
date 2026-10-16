/**
 * Modelo de la Agenda: une eventos locales del CRM y visitas reales de la app
 * en una sola lista (`AgendaItem`), y calcula todo lo que la pantalla muestra
 * (rangos, semana ISO, KPIs, primer hueco libre, hoja de ruta, .ics).
 *
 * Puro: sin React ni DOM, para poder razonarlo y probarlo aparte.
 */

import type {
  AppOffer,
  CalendarEvent,
  Contact,
  ContactSource,
  CurrencyCode,
  EventType,
  Opportunity,
  Property,
  PropertyType,
  VisitChecklist,
  VisitFeedback,
  VisitInterest,
  VisitNextAction,
  VisitStatus,
} from "@/types/db";
import type { AppVisitRow, AppVisitStatus } from "@/lib/agendaVisits";
import type { IcsEvent } from "@/lib/ics";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/* ── Estados ──────────────────────────────────────────────────────────────── */

export interface StatusMeta {
  label: string;
  bg: string;
  text: string;
  border: string;
}

export const STATUS_ORDER: VisitStatus[] = [
  "por_confirmar",
  "confirmada",
  "realizada",
  "reprogramada",
  "no_show",
  "cancelada",
];

export const STATUS_META: Record<VisitStatus, StatusMeta> = {
  por_confirmar: {
    label: "Por confirmar",
    bg: "var(--color-state-amber-bg)",
    text: "var(--color-state-amber-text)",
    border: "var(--color-state-amber-border)",
  },
  confirmada: {
    label: "Confirmada",
    bg: "var(--color-state-green-bg)",
    text: "var(--color-state-green-text)",
    border: "var(--color-state-green-border)",
  },
  realizada: {
    label: "Realizada",
    bg: "var(--color-state-blue-bg)",
    text: "var(--color-state-blue-text)",
    border: "var(--color-state-blue-border)",
  },
  reprogramada: {
    label: "Reprogramada",
    bg: "var(--color-lavender)",
    text: "var(--color-lilac-text)",
    border: "#DDD8CF",
  },
  no_show: {
    label: "No vino",
    bg: "var(--color-state-red-bg)",
    text: "var(--color-state-red-text)",
    border: "var(--color-state-red-border)",
  },
  cancelada: {
    label: "Cancelada",
    bg: "var(--color-state-red-bg)",
    text: "var(--color-state-red-text)",
    border: "var(--color-state-red-border)",
  },
};

/** Estados de la app -> mismos chips que los eventos locales. */
export const APP_STATUS_MAP: Record<AppVisitStatus, VisitStatus> = {
  proposed: "por_confirmar",
  confirmed: "confirmada",
  completed: "realizada",
  no_show: "no_show",
  cancelled: "cancelada",
};

/** Estados en los que la visita ya está resuelta y no pide feedback. */
const CLOSED_WITHOUT_FEEDBACK: VisitStatus[] = ["no_show", "cancelada", "reprogramada"];

export const TYPE_COLOR: Record<EventType, string> = {
  visita: "#9B21FF",
  llamada: "#3B82F6",
  reunion: "#FF5ECA",
  seguimiento: "#F59E0B",
  publicacion: "#CB1093",
};

export const TYPE_LABEL: Record<EventType, string> = {
  visita: "Visita",
  llamada: "Llamada",
  reunion: "Reunión",
  seguimiento: "Seguimiento",
  publicacion: "Publicación",
};

export const SOURCE_LABEL: Record<ContactSource, string> = {
  manual: "Cargado a mano",
  web: "Web",
  portal: "Portal",
  referido: "Referido",
  consumer_app: "App PropMatch",
};

export const INTEREST_LABEL: Record<VisitInterest, string> = {
  alto: "Alto",
  medio: "Medio",
  descarto: "Descartó",
};

export const NEXT_ACTION_LABEL: Record<VisitNextAction, string> = {
  carta_oferta: "Carta oferta",
  segunda_visita: "Segunda visita",
  enviar_alternativas: "Enviar alternativas",
  tasacion_parte_pago: "Tasación en parte de pago",
  otra: "Otra",
};

/* ── Ítem unificado ───────────────────────────────────────────────────────── */

export interface AgendaItem {
  /** `crm:<id>` o `app:<uuid>`: único entre las dos fuentes. */
  key: string;
  source: "crm" | "app";
  id: string;
  type: EventType;
  title: string;
  start: Date;
  end: Date;
  /** Solo visitas. */
  status: VisitStatus | null;
  contactId: string | null;
  /** Nombre a mostrar si el contacto todavía no existe en el CRM. */
  contactFallback: string | null;
  /** Id de la propiedad en el CRM. */
  propertyId: string | null;
  /** Asesor: dueño del evento, o de la oportunidad para visitas de la app. */
  ownerId: string | null;
  notes: string | null;
  feedback: VisitFeedback | null;
  checklist: VisitChecklist;
  event?: CalendarEvent;
  appVisit?: AppVisitRow;
}

export function fromEvent(e: CalendarEvent): AgendaItem {
  return {
    key: `crm:${e.id}`,
    source: "crm",
    id: e.id,
    type: e.type,
    title: e.title,
    start: new Date(e.starts_at),
    end: new Date(e.ends_at),
    status: e.type === "visita" ? (e.status ?? "por_confirmar") : null,
    contactId: e.contact_id,
    contactFallback: null,
    propertyId: e.property_id,
    ownerId: e.owner_id,
    notes: e.notes,
    feedback: e.feedback ?? null,
    checklist: e.checklist ?? {},
    event: e,
  };
}

export interface AppVisitContext {
  properties: Property[];
  contacts: Contact[];
  opportunities: Opportunity[];
  feedback: Record<string, VisitFeedback>;
  checklist: Record<string, VisitChecklist>;
}

export function fromAppVisit(v: AppVisitRow, ctx: AppVisitContext): AgendaItem {
  const property = ctx.properties.find((p) => p.app_property_id === v.property_id) ?? null;
  const contact = ctx.contacts.find((c) => c.app_user_id === v.demandante_id) ?? null;
  const opp =
    contact && property
      ? ctx.opportunities.find((o) => o.contact_id === contact.id && o.property_id === property.id)
      : undefined;
  const start = new Date(v.scheduled_at);
  const who = contact?.full_name ?? "Interesado desde la app";
  return {
    key: `app:${v.id}`,
    source: "app",
    id: v.id,
    type: "visita",
    title: `Visita — ${who}`,
    start,
    end: new Date(start.getTime() + (v.duration_min || 30) * MIN),
    status: APP_STATUS_MAP[v.status] ?? "por_confirmar",
    contactId: contact?.id ?? null,
    contactFallback: contact ? null : who,
    propertyId: property?.id ?? null,
    ownerId: opp?.owner_id ?? null,
    notes: v.note,
    feedback: ctx.feedback[v.id] ?? null,
    checklist: ctx.checklist[v.id] ?? {},
    appVisit: v,
  };
}

export const isVisit = (i: AgendaItem) => i.type === "visita";

/* ── Fechas ───────────────────────────────────────────────────────────────── */

export type AgendaView = "dia" | "semana" | "mes" | "lista";

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Lunes de la semana que contiene `date`. */
export function mondayOf(date: Date): Date {
  const d = startOfDay(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** Número de semana ISO 8601 (la semana 1 es la del primer jueves del año). */
export function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / DAY + 1) / 7);
}

export interface AgendaRange {
  start: Date;
  /** Exclusivo. */
  end: Date;
  /** Días que se dibujan como columnas (Día: 1; Semana: Lun–Sáb; Lista: Lun–Dom). */
  days: Date[];
}

/** Rango visible según la vista. La semana de la grilla es Lun–Sáb; la lista suma el domingo para no esconder nada. */
export function rangeFor(view: AgendaView, anchor: Date): AgendaRange {
  if (view === "dia") {
    const s = startOfDay(anchor);
    return { start: s, end: addDays(s, 1), days: [s] };
  }
  if (view === "mes") {
    const s = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const e = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
    const days: Date[] = [];
    for (let d = s; d < e; d = addDays(d, 1)) days.push(d);
    return { start: s, end: e, days };
  }
  const mon = mondayOf(anchor);
  const n = view === "semana" ? 6 : 7;
  return { start: mon, end: addDays(mon, n), days: Array.from({ length: n }, (_, i) => addDays(mon, i)) };
}

export function shiftAnchor(view: AgendaView, anchor: Date, dir: -1 | 1): Date {
  if (view === "dia") return addDays(anchor, dir);
  if (view === "mes") return new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
  return addDays(anchor, 7 * dir);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const monthName = (d: Date) => d.toLocaleDateString("es-AR", { month: "long" });

/** "19 al 24 de octubre" · "28 de septiembre al 3 de octubre" · "Lunes 5 de octubre" · "Octubre 2026". */
export function rangeLabel(view: AgendaView, range: AgendaRange): string {
  if (view === "mes") return cap(`${monthName(range.start)} ${range.start.getFullYear()}`);
  if (view === "dia") {
    return cap(range.start.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" }));
  }
  const a = range.start;
  const b = addDays(range.end, -1);
  const yearSuffix = a.getFullYear() !== b.getFullYear() ? ` de ${b.getFullYear()}` : "";
  if (a.getMonth() === b.getMonth()) return `${a.getDate()} al ${b.getDate()} de ${monthName(b)}${yearSuffix}`;
  return `${a.getDate()} de ${monthName(a)} al ${b.getDate()} de ${monthName(b)}${yearSuffix}`;
}

export const fmtHour = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** "en 45 min" · "en 2 h 10 min" · "mañana 10:00" · "en curso" · "hace 3 h" · "lun 12, 10:00". */
export function countdown(start: Date, end: Date, now = new Date()): string {
  const t = now.getTime();
  if (t >= start.getTime() && t < end.getTime()) return "en curso";
  const diff = start.getTime() - t;
  const abs = Math.abs(diff);
  const hm = (ms: number) => {
    const h = Math.floor(ms / HOUR);
    const m = Math.round((ms % HOUR) / MIN);
    if (h === 0) return `${Math.max(1, m)} min`;
    return m ? `${h} h ${m} min` : `${h} h`;
  };
  if (diff > 0) {
    if (sameDay(start, now)) return `en ${hm(abs)}`;
    if (sameDay(start, addDays(now, 1))) return `mañana ${fmtHour(start)}`;
    if (abs < 7 * DAY) return `${start.toLocaleDateString("es-AR", { weekday: "long", day: "numeric" })}, ${fmtHour(start)}`;
    return `${start.toLocaleDateString("es-AR", { day: "numeric", month: "short" })}, ${fmtHour(start)}`;
  }
  const since = t - end.getTime();
  if (since < DAY && sameDay(end, now)) return `terminó hace ${hm(since)}`;
  const days = Math.max(1, Math.round(since / DAY));
  return days === 1 ? "fue ayer" : `fue hace ${days} días`;
}

/* ── Primer hueco libre ───────────────────────────────────────────────────── */

export const SLOT_DAY_START = 9;
export const SLOT_DAY_END = 19;

/**
 * Primer hueco de al menos `minMinutes` entre lun y sáb de la semana de
 * `weekStart`, de 9 a 19. Solo mira lo que hay agendado (no inventa
 * criterios de zona ni de ruta). Lo que ya pasó no cuenta como libre.
 */
export function firstFreeSlot(
  items: AgendaItem[],
  weekStart: Date,
  now = new Date(),
  minMinutes = 60,
  /** Ocupados de Google Calendar (con horario). */
  extraBusy: { start: Date; end: Date }[] = [],
): { start: Date; end: Date } | null {
  const busy = [
    ...items.filter((i) => i.status !== "cancelada").map((i) => [i.start.getTime(), i.end.getTime()] as const),
    ...extraBusy.map((b) => [b.start.getTime(), b.end.getTime()] as const),
  ];
  for (let d = 0; d < 6; d++) {
    const day = addDays(weekStart, d);
    const dayStart = new Date(day);
    dayStart.setHours(SLOT_DAY_START, 0, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setHours(SLOT_DAY_END, 0, 0, 0);
    let cursor = Math.max(dayStart.getTime(), roundUpQuarter(now.getTime()));
    if (cursor >= dayEnd.getTime()) continue;
    const today = busy
      .filter(([s, e]) => e > cursor && s < dayEnd.getTime())
      .sort((a, b) => a[0] - b[0]);
    for (const [s, e] of today) {
      if (s - cursor >= minMinutes * MIN) return { start: new Date(cursor), end: new Date(s) };
      cursor = Math.max(cursor, e);
    }
    if (dayEnd.getTime() - cursor >= minMinutes * MIN) return { start: new Date(cursor), end: dayEnd };
  }
  return null;
}

function roundUpQuarter(t: number): number {
  const q = 15 * MIN;
  return Math.ceil(t / q) * q;
}

/* ── «Ocupado» de Google Calendar ─────────────────────────────────────────── */

/** Evento del Google del agente que no es de PropMatch: solo horario (y título si lo eligió). No se guarda en el CRM. */
export interface BusyBlock {
  id: string;
  start: Date;
  end: Date;
  allDay: boolean;
  title: string | null;
}

const localDate = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, (m || 1) - 1, day || 1);
};

export function toBusyBlocks(rows: { id: string; allDay: boolean; start: string; end: string; title: string | null }[]): BusyBlock[] {
  return rows.map((r) => ({
    id: r.id,
    allDay: r.allDay,
    title: r.title,
    start: r.allDay ? localDate(r.start) : new Date(r.start),
    end: r.allDay ? localDate(r.end) : new Date(r.end),
  }));
}

/** ¿El bloque toca ese día? (Los de día completo tienen fin exclusivo.) */
export function busyOnDay(b: BusyBlock, day: Date): boolean {
  const s = startOfDay(day).getTime();
  const e = addDays(startOfDay(day), 1).getTime();
  return b.start.getTime() < e && b.end.getTime() > s;
}

export const BUSY_COLORS = { bg: "#F3F4F6", border: "#D1D5DB", text: "#4B5563", stripes: "repeating-linear-gradient(135deg, #F3F4F6 0 6px, #E5E7EB 6px 12px)" };

/* ── KPIs ─────────────────────────────────────────────────────────────────── */

export interface Kpis {
  week: {
    total: number;
    previous: number;
    byType: { type: PropertyType | "sin_propiedad"; count: number }[];
    /** Promedio por día de lun a sáb. */
    perDay: number;
  };
  confirmed: { confirmed: number; total: number; noShows: number };
  pendingFeedback: AgendaItem[];
  offers: { count: number; pipeline: { currency: CurrencyCode; total: number; count: number }[] };
  /** `null` = no hay visitas realizadas en la ventana: se muestra "—". */
  conversion: { pct: number; converted: number; done: number } | null;
}

export const CONVERSION_WINDOW_DAYS = 90;
export const FEEDBACK_WINDOW_DAYS = 30;

export const CONVERSION_CRITERIA =
  `Conversión = visitas realizadas en los últimos ${CONVERSION_WINDOW_DAYS} días en las que el mismo contacto, ` +
  `sobre la misma propiedad, después hizo una oferta desde la app o tiene la oportunidad en Negociación o Cierre, ` +
  `dividido el total de visitas realizadas en esa ventana. "Realizada" = estado Realizada o feedback "sí se hizo".`;

/** Se hizo de verdad: por estado o por feedback. */
export function wasDone(i: AgendaItem): boolean {
  if (i.feedback) return i.feedback.happened === "si";
  return i.status === "realizada";
}

export function needsFeedback(i: AgendaItem, now = new Date()): boolean {
  if (!isVisit(i) || i.feedback) return false;
  if (i.status && CLOSED_WITHOUT_FEEDBACK.includes(i.status)) return false;
  const t = now.getTime();
  return i.end.getTime() <= t && t - i.end.getTime() <= FEEDBACK_WINDOW_DAYS * DAY;
}

export function computeKpis(input: {
  items: AgendaItem[];
  weekStart: Date;
  properties: Property[];
  opportunities: Opportunity[];
  appOffers: AppOffer[];
  /** Rango visible, para contar ofertas del período. */
  range: AgendaRange;
  now?: Date;
}): Kpis {
  const now = input.now ?? new Date();
  const visits = input.items.filter(isVisit);
  const inRange = (i: AgendaItem, s: Date, e: Date) => i.start >= s && i.start < e;
  const weekEnd = addDays(input.weekStart, 7);
  const prevStart = addDays(input.weekStart, -7);
  const week = visits.filter((i) => inRange(i, input.weekStart, weekEnd) && i.status !== "cancelada");
  const previous = visits.filter((i) => inRange(i, prevStart, input.weekStart) && i.status !== "cancelada");

  const propertyIndex = new Map(input.properties.map((p) => [p.id, p]));
  const typeCount = new Map<PropertyType | "sin_propiedad", number>();
  for (const v of week) {
    const t = (v.propertyId && propertyIndex.get(v.propertyId)?.type) || "sin_propiedad";
    typeCount.set(t, (typeCount.get(t) ?? 0) + 1);
  }

  const pipelineMap = new Map<CurrencyCode, { total: number; count: number }>();
  for (const o of input.opportunities) {
    if (o.stage === "perdida" || o.stage === "cierre" || o.value === null) continue;
    const cur = pipelineMap.get(o.currency) ?? { total: 0, count: 0 };
    pipelineMap.set(o.currency, { total: cur.total + o.value, count: cur.count + 1 });
  }

  const windowStart = now.getTime() - CONVERSION_WINDOW_DAYS * DAY;
  const done = visits.filter((i) => wasDone(i) && i.start.getTime() >= windowStart && i.start <= now);
  const converted = done.filter((v) => {
    if (!v.contactId || !v.propertyId) return false;
    const offered = input.appOffers.some(
      (o) => o.contact_id === v.contactId && o.property_id === v.propertyId && new Date(o.created_at) >= v.start,
    );
    const advanced = input.opportunities.some(
      (o) =>
        o.contact_id === v.contactId &&
        o.property_id === v.propertyId &&
        (o.stage === "negociacion" || o.stage === "cierre") &&
        new Date(o.stage_since) >= v.start,
    );
    return offered || advanced;
  });

  return {
    week: {
      total: week.length,
      previous: previous.length,
      byType: [...typeCount.entries()]
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
      perDay: week.length / 6,
    },
    confirmed: {
      confirmed: week.filter((i) => i.status === "confirmada" || i.status === "realizada").length,
      total: week.length,
      noShows: visits.filter((i) => inRange(i, input.weekStart, weekEnd) && i.status === "no_show").length,
    },
    pendingFeedback: visits
      .filter((i) => needsFeedback(i, now))
      .sort((a, b) => b.start.getTime() - a.start.getTime()),
    offers: {
      count: input.appOffers.filter((o) => {
        const t = new Date(o.created_at);
        return t >= input.range.start && t < input.range.end;
      }).length,
      pipeline: [...pipelineMap.entries()].map(([currency, v]) => ({ currency, ...v })),
    },
    conversion: done.length
      ? { pct: Math.round((converted.length / done.length) * 100), converted: converted.length, done: done.length }
      : null,
  };
}

/* ── Direcciones, mapas y hoja de ruta ────────────────────────────────────── */

export function propertyAddress(p: Property | null | undefined): string | null {
  if (!p) return null;
  const street = [p.street, p.street_number].filter(Boolean).join(" ");
  const parts = [street, p.locality ?? p.zone, p.province].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** Punto para Google Maps: coordenadas si hay; si no, la dirección. */
export function mapsPoint(p: Property | null | undefined): string | null {
  if (!p) return null;
  if (p.lat !== null && p.lng !== null) return `${p.lat},${p.lng}`;
  return propertyAddress(p);
}

export function mapsSearchUrl(p: Property | null | undefined): string | null {
  const point = mapsPoint(p);
  return point ? `https://www.google.com/maps?q=${encodeURIComponent(point)}` : null;
}

/** Recorrido con varias paradas, en el orden dado. Google calcula el trayecto; acá no se estima nada. */
export function mapsDirectionsUrl(points: string[]): string | null {
  if (points.length === 0) return null;
  return `https://www.google.com/maps/dir/${points.map((p) => encodeURIComponent(p)).join("/")}`;
}

/* ── .ics ─────────────────────────────────────────────────────────────────── */

export function toIcsEvents(
  items: AgendaItem[],
  lookups: { property: (id: string | null) => Property | undefined; contactName: (i: AgendaItem) => string | null },
): IcsEvent[] {
  return items
    .filter((i) => i.status !== "cancelada")
    .map((i) => {
      const property = lookups.property(i.propertyId);
      const who = lookups.contactName(i);
      const description = [
        i.status ? `Estado: ${STATUS_META[i.status].label}` : TYPE_LABEL[i.type],
        who ? `Contacto: ${who}` : null,
        property ? `Propiedad: ${property.title}` : null,
        i.source === "app" ? "Visita pedida desde la app PropMatch" : null,
        i.notes ? `Notas: ${i.notes}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      return {
        uid: `${i.source}-${i.id}`,
        title: i.title,
        description,
        location: propertyAddress(property) ?? undefined,
        startIso: i.start.toISOString(),
        endIso: i.end.toISOString(),
      };
    });
}
