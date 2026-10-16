import { useEffect, useState } from "react";
import { SampleBadge } from "@/components/ui/SampleBadge";
import { EventTypeIcon } from "@/components/ui/icons";
import {
  BUSY_COLORS,
  STATUS_META,
  TYPE_COLOR,
  TYPE_LABEL,
  addDays,
  busyOnDay,
  fmtHour,
  mondayOf,
  sameDay,
  type AgendaItem,
  type BusyBlock,
} from "./agendaModel";

/**
 * Vistas del calendario: grilla horaria (Día y Semana), Mes y Lista. Todas
 * reciben los mismos `AgendaItem` ya filtrados; clic en una card la
 * selecciona y el panel de la derecha muestra el detalle.
 */

export const HOUR_HEIGHT = 64;
export const START_HOUR = 8;
export const END_HOUR = 20;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
const GUTTER = 56;

const decimalHour = (d: Date) => d.getHours() + d.getMinutes() / 60;

/** Hora actual que se refresca sola cada 30 s (línea del "ahora" y cuentas regresivas). */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** Colores de una card: por estado si es visita, por tipo si no. */
function itemColors(i: AgendaItem) {
  if (i.status) {
    const m = STATUS_META[i.status];
    return { bg: m.bg, border: m.border, accent: m.text, text: "#1A1A1A", sub: m.text };
  }
  const c = TYPE_COLOR[i.type];
  return { bg: `${c}12`, border: `${c}55`, accent: c, text: "#1A1A1A", sub: "#6B7280" };
}

export function StatusChip({ item, size = "sm" }: { item: AgendaItem; size?: "xs" | "sm" }) {
  if (!item.status) return null;
  const m = STATUS_META[item.status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border whitespace-nowrap ${
        size === "xs" ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-xs"
      }`}
      style={{ background: m.bg, color: m.text, borderColor: m.border, fontWeight: 700 }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.text }} aria-hidden />
      {m.label}
    </span>
  );
}

export function SourceBadge({ item }: { item: AgendaItem }) {
  if (item.source !== "app") return null;
  return (
    <span
      className="inline-flex items-center px-1.5 py-px rounded-md text-[10px] whitespace-nowrap"
      style={{ background: "#1A1A1A", color: "white", fontWeight: 700, letterSpacing: "0.03em" }}
      title="Visita pedida desde la app PropMatch"
    >
      APP
    </span>
  );
}

function itemAria(i: AgendaItem, who: string | null) {
  return [
    `${fmtHour(i.start)} a ${fmtHour(i.end)}`,
    i.title,
    who && !i.title.includes(who) ? who : null,
    i.status ? STATUS_META[i.status].label : TYPE_LABEL[i.type],
    i.source === "app" ? "desde la app" : null,
  ]
    .filter(Boolean)
    .join(", ");
}

/* ── Grilla horaria (Día / Semana) ────────────────────────────────────────── */

/** Reparte en columnas los eventos que se pisan, para que no queden uno arriba del otro. */
function layoutDay(items: AgendaItem[]): { item: AgendaItem; col: number; cols: number }[] {
  const sorted = [...items].sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime());
  const out: { item: AgendaItem; col: number; cols: number }[] = [];
  let cluster: { item: AgendaItem; col: number }[] = [];
  let clusterEnd = 0;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((c) => c.col + 1));
    for (const c of cluster) out.push({ ...c, cols });
    cluster = [];
  };
  for (const item of sorted) {
    if (cluster.length && item.start.getTime() >= clusterEnd) flush();
    const used = new Set(
      cluster.filter((c) => c.item.end.getTime() > item.start.getTime()).map((c) => c.col),
    );
    let col = 0;
    while (used.has(col)) col++;
    cluster.push({ item, col });
    clusterEnd = Math.max(clusterEnd, item.end.getTime());
  }
  if (cluster.length) flush();
  return out;
}

export function TimeGrid({
  days,
  items,
  selectedKey,
  onSelect,
  contactName,
  now,
  busy = [],
}: {
  days: Date[];
  items: AgendaItem[];
  selectedKey: string | null;
  onSelect: (item: AgendaItem) => void;
  contactName: (i: AgendaItem) => string | null;
  now: Date;
  /** «Ocupado» de Google Calendar (se dibuja de fondo, no se puede tocar). */
  busy?: BusyBlock[];
}) {
  const nowDecimal = decimalHour(now);
  const showNow = days.some((d) => sameDay(d, now)) && nowDecimal >= START_HOUR && nowDecimal <= END_HOUR;
  const nowTop = (nowDecimal - START_HOUR) * HOUR_HEIGHT;

  return (
    <div className="flex flex-col" style={{ background: "white", minWidth: days.length > 1 ? 760 : undefined }}>
      <div className="flex border-b sticky top-0 z-20" style={{ borderColor: "#F0EDE6", background: "white" }}>
        <div className="flex-shrink-0" style={{ width: GUTTER }} />
        {days.map((day) => {
          const isToday = sameDay(day, now);
          return (
            <div
              key={day.toISOString()}
              className="flex-1 py-2.5 flex flex-col items-center border-l"
              style={{ borderColor: "#F0EDE6", background: isToday ? "#F7F0FF" : undefined }}
            >
              <span
                className="text-xs uppercase"
                style={{ color: isToday ? "#7C0BD8" : "#6B7280", fontWeight: 700, letterSpacing: "0.08em" }}
              >
                {day.toLocaleDateString("es-AR", { weekday: "short" }).replace(".", "")}
              </span>
              <span
                className="w-9 h-9 rounded-full flex items-center justify-center mt-0.5 text-sm"
                style={
                  isToday
                    ? { background: "var(--gradient-brand)", color: "white", fontWeight: 800 }
                    : { color: "#1A1A1A", fontWeight: 600 }
                }
                aria-label={isToday ? "Hoy" : undefined}
              >
                {day.getDate()}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex relative" style={{ minHeight: HOURS.length * HOUR_HEIGHT }}>
        <div className="flex-shrink-0 relative" style={{ width: GUTTER }}>
          {HOURS.map((h) => (
            <div key={h} className="flex items-start justify-end pr-2.5 select-none" style={{ height: HOUR_HEIGHT, paddingTop: 2 }}>
              <span className="text-xs" style={{ color: "#6B7280", fontWeight: 500 }}>
                {String(h).padStart(2, "0")}:00
              </span>
            </div>
          ))}
          {showNow && (
            <span
              className="absolute right-1 z-30 px-1.5 py-px rounded-md text-[10px] text-white"
              style={{ top: nowTop - 8, background: "#7C0BD8", fontWeight: 700 }}
            >
              {fmtHour(now)}
            </span>
          )}
        </div>

        {days.map((day) => {
          const isToday = sameDay(day, now);
          const dayItems = items.filter((i) => sameDay(i.start, day));
          return (
            <div
              key={day.toISOString()}
              className="flex-1 relative border-l"
              style={{ borderColor: "#F0EDE6", background: isToday ? "rgba(168, 85, 255,0.035)" : "transparent" }}
            >
              {HOURS.map((h) => (
                <div key={h} className="absolute w-full border-t" style={{ top: (h - START_HOUR) * HOUR_HEIGHT, borderColor: "#F0EDE6" }} />
              ))}
              {HOURS.map((h) => (
                <div
                  key={`${h}-half`}
                  className="absolute w-full border-t"
                  style={{ top: (h - START_HOUR + 0.5) * HOUR_HEIGHT, borderColor: "#FAF8F5", borderStyle: "dashed" }}
                />
              ))}

              {isToday && showNow && (
                <div className="absolute z-10 flex items-center pointer-events-none" style={{ top: nowTop - 1, left: 0, right: 0 }} aria-hidden>
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: "#7C0BD8", marginLeft: -5 }} />
                  <div className="flex-1 h-0.5" style={{ background: "#7C0BD8" }} />
                </div>
              )}

              {busy
                .filter((b) => !b.allDay && sameDay(b.start, day))
                .map((b) => (
                  <BusyGridBlock key={b.id} block={b} />
                ))}

              {layoutDay(dayItems).map(({ item, col, cols }) => (
                <GridBlock
                  key={item.key}
                  item={item}
                  col={col}
                  cols={cols}
                  selected={selectedKey === item.key}
                  who={contactName(item)}
                  onSelect={() => onSelect(item)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BusyGridBlock({ block: b }: { block: BusyBlock }) {
  const startH = Math.max(decimalHour(b.start), START_HOUR);
  const endH = Math.min(sameDay(b.start, b.end) ? decimalHour(b.end) : END_HOUR, END_HOUR);
  if (endH <= START_HOUR || startH >= END_HOUR) return null;
  const top = (startH - START_HOUR) * HOUR_HEIGHT + 1;
  const height = Math.max((endH - startH) * HOUR_HEIGHT - 2, 14);
  const label = b.title ?? "Ocupado";
  return (
    <div
      role="note"
      aria-label={`${label} en Google Calendar, ${fmtHour(b.start)} a ${fmtHour(b.end)}`}
      title={`${label} (Google Calendar) · ${fmtHour(b.start)}–${fmtHour(b.end)}`}
      className="absolute rounded-md overflow-hidden pointer-events-none"
      style={{ top, height, left: 2, right: 2, background: BUSY_COLORS.stripes, border: `1px dashed ${BUSY_COLORS.border}`, zIndex: 5 }}
    >
      <span className="block truncate px-1.5 pt-0.5 text-[10px]" style={{ color: BUSY_COLORS.text, fontWeight: 600 }}>
        {fmtHour(b.start)} {label}
      </span>
    </div>
  );
}

function GridBlock({
  item,
  col,
  cols,
  selected,
  who,
  onSelect,
}: {
  item: AgendaItem;
  col: number;
  cols: number;
  selected: boolean;
  who: string | null;
  onSelect: () => void;
}) {
  const c = itemColors(item);
  const startH = Math.max(decimalHour(item.start), START_HOUR);
  const endH = Math.min(sameDay(item.start, item.end) ? decimalHour(item.end) : END_HOUR, END_HOUR);
  const top = (Math.min(startH, END_HOUR - 0.5) - START_HOUR) * HOUR_HEIGHT + 2;
  const height = Math.max((endH - startH) * HOUR_HEIGHT - 4, 26);
  const short = height < 50;
  const cancelled = item.status === "cancelada";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={itemAria(item, who)}
      className="absolute rounded-lg overflow-hidden text-left transition-shadow focus-visible:z-30"
      style={{
        top,
        height,
        left: `calc(${(col / cols) * 100}% + 3px)`,
        width: `calc(${100 / cols}% - 6px)`,
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderLeft: `3px solid ${c.accent}`,
        boxShadow: selected ? "0 0 0 2px #9B21FF, 0 6px 16px rgba(168, 85, 255,0.18)" : "0 1px 3px rgba(8, 11, 31,0.05)",
        zIndex: selected ? 20 : 10,
        opacity: cancelled ? 0.65 : 1,
      }}
    >
      <span className="flex flex-col h-full px-2 py-1 min-w-0">
        <span className="flex items-center gap-1 min-w-0">
          <span className="text-[10px] flex-shrink-0" style={{ color: c.sub, fontWeight: 700 }}>
            {fmtHour(item.start)}
          </span>
          <SourceBadge item={item} />
        </span>
        <span
          className="block truncate text-[11px] leading-tight"
          style={{ color: c.text, fontWeight: 700, textDecoration: cancelled ? "line-through" : undefined }}
        >
          {item.title}
        </span>
        {!short && item.event?.is_sample && <SampleBadge record={item.event} />}
        {!short && item.status && (
          <span className="mt-auto pt-0.5">
            <StatusChip item={item} size="xs" />
          </span>
        )}
      </span>
    </button>
  );
}

/* ── Mes ──────────────────────────────────────────────────────────────────── */

export function MonthGrid({
  monthStart,
  items,
  selectedKey,
  onSelect,
  onPickDay,
  now,
  busy = [],
}: {
  monthStart: Date;
  items: AgendaItem[];
  selectedKey: string | null;
  onSelect: (item: AgendaItem) => void;
  onPickDay: (day: Date) => void;
  now: Date;
  busy?: BusyBlock[];
}) {
  const gridStart = mondayOf(monthStart);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
  const weeks: Date[][] = [];
  for (let w = gridStart; w < monthEnd; w = addDays(w, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(w, i)));
  }
  const labels = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  return (
    <div className="flex flex-col" style={{ background: "white", minWidth: 720 }}>
      <div className="grid grid-cols-7 border-b" style={{ borderColor: "#F0EDE6" }}>
        {labels.map((l) => (
          <div key={l} className="py-2 text-center text-xs uppercase" style={{ color: "#6B7280", fontWeight: 700, letterSpacing: "0.08em" }}>
            {l}
          </div>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week[0].toISOString()} className="grid grid-cols-7 border-b" style={{ borderColor: "#F0EDE6" }}>
          {week.map((day) => {
            const inMonth = day.getMonth() === monthStart.getMonth();
            const isToday = sameDay(day, now);
            const dayItems = items
              .filter((i) => sameDay(i.start, day))
              .sort((a, b) => a.start.getTime() - b.start.getTime());
            const shown = dayItems.slice(0, 3);
            return (
              <div
                key={day.toISOString()}
                className="min-h-[112px] p-1.5 border-l first:border-l-0 flex flex-col gap-1"
                style={{ borderColor: "#F0EDE6", background: isToday ? "#F7F0FF" : inMonth ? "white" : "#FAF8F5" }}
              >
                <button
                  type="button"
                  onClick={() => onPickDay(day)}
                  className="self-start min-w-8 h-8 px-1.5 rounded-full text-xs hover:bg-violet-50"
                  style={
                    isToday
                      ? { background: "var(--gradient-brand)", color: "white", fontWeight: 800 }
                      : { color: inMonth ? "#1A1A1A" : "#6B7280", fontWeight: 600 }
                  }
                  aria-label={`Ver el ${day.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}`}
                >
                  {day.getDate()}
                </button>
                {shown.map((i) => {
                  const c = itemColors(i);
                  return (
                    <button
                      key={i.key}
                      type="button"
                      onClick={() => onSelect(i)}
                      aria-pressed={selectedKey === i.key}
                      className="w-full flex items-center gap-1 px-1.5 py-1 rounded-md text-left text-[11px] min-w-0"
                      style={{
                        background: c.bg,
                        borderLeft: `3px solid ${c.accent}`,
                        boxShadow: selectedKey === i.key ? "0 0 0 2px #9B21FF" : undefined,
                        opacity: i.status === "cancelada" ? 0.65 : 1,
                      }}
                    >
                      <span style={{ color: c.sub, fontWeight: 700 }}>{fmtHour(i.start)}</span>
                      <span className="truncate" style={{ color: "#1A1A1A", fontWeight: 600 }}>
                        {i.title}
                      </span>
                      <SampleBadge record={i.event} />
                    </button>
                  );
                })}
                {(() => {
                  const dayBusy = busy.filter((b) => busyOnDay(b, day));
                  if (dayBusy.length === 0) return null;
                  const first = dayBusy[0];
                  return (
                    <span
                      className="w-full truncate px-1.5 py-0.5 rounded-md text-[10px]"
                      style={{ background: BUSY_COLORS.stripes, color: BUSY_COLORS.text, fontWeight: 600 }}
                      title="Ocupado en Google Calendar"
                    >
                      {first.allDay ? "" : `${fmtHour(first.start)} `}
                      {first.title ?? "Ocupado"}
                      {dayBusy.length > 1 ? ` +${dayBusy.length - 1}` : ""}
                    </span>
                  );
                })()}
                {dayItems.length > shown.length && (
                  <button
                    type="button"
                    onClick={() => onPickDay(day)}
                    className="self-start text-[11px] px-1.5 py-0.5 rounded hover:bg-violet-50"
                    style={{ color: "#7C0BD8", fontWeight: 700 }}
                  >
                    +{dayItems.length - shown.length} más
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ── Lista ────────────────────────────────────────────────────────────────── */

export function ListView({
  days,
  items,
  selectedKey,
  onSelect,
  contactName,
  propertyTitle,
  now,
  hideEmptyDays = false,
  busy = [],
}: {
  days: Date[];
  items: AgendaItem[];
  selectedKey: string | null;
  onSelect: (item: AgendaItem) => void;
  contactName: (i: AgendaItem) => string | null;
  propertyTitle: (i: AgendaItem) => string | null;
  now: Date;
  hideEmptyDays?: boolean;
  busy?: BusyBlock[];
}) {
  const groups = days
    .map((day) => ({
      day,
      items: items.filter((i) => sameDay(i.start, day)).sort((a, b) => a.start.getTime() - b.start.getTime()),
    }))
    .filter((g) => !hideEmptyDays || g.items.length > 0);

  if (groups.length === 0) {
    return (
      <p className="px-4 py-10 text-sm text-center" style={{ color: "#6B7280" }}>
        No hay nada agendado en este período.
      </p>
    );
  }

  return (
    <div className="px-4 md:px-6 py-4 space-y-5" style={{ background: "white" }}>
      {groups.map(({ day, items: dayItems }) => {
        const isToday = sameDay(day, now);
        return (
          <section key={day.toISOString()} aria-label={day.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}>
            <h3
              className="text-xs uppercase mb-2 flex items-center gap-2"
              style={{ color: isToday ? "#7C0BD8" : "#6B7280", fontWeight: 700, letterSpacing: "0.08em" }}
            >
              {day.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "short" })}
              {isToday && (
                <span className="normal-case tracking-normal px-2 py-0.5 rounded-full text-white text-[10px]" style={{ background: "var(--gradient-brand)" }}>
                  Hoy
                </span>
              )}
            </h3>
            {dayItems.length === 0 ? (
              <p className="text-xs pl-1" style={{ color: "#6B7280" }}>
                Sin eventos
              </p>
            ) : null}
            {busy.some((b) => busyOnDay(b, day)) && (
              <ul className="space-y-1 mt-2" aria-label="Ocupado en Google Calendar">
                {busy
                  .filter((b) => busyOnDay(b, day))
                  .map((b) => (
                    <li
                      key={b.id}
                      className="flex items-center gap-3 px-3 py-1.5 rounded-lg text-xs"
                      style={{ background: BUSY_COLORS.stripes, color: BUSY_COLORS.text, border: `1px dashed ${BUSY_COLORS.border}` }}
                    >
                      <span className="w-12 flex-shrink-0" style={{ fontWeight: 700 }}>
                        {b.allDay ? "Día" : fmtHour(b.start)}
                      </span>
                      <span className="truncate" style={{ fontWeight: 600 }}>
                        {b.title ?? "Ocupado"} <span style={{ fontWeight: 400 }}>· Google Calendar</span>
                      </span>
                    </li>
                  ))}
              </ul>
            )}
            {dayItems.length > 0 && (
              <ul className="space-y-2">
                {dayItems.map((i) => {
                  const c = itemColors(i);
                  const who = contactName(i);
                  const prop = propertyTitle(i);
                  const selected = selectedKey === i.key;
                  return (
                    <li key={i.key}>
                      <button
                        type="button"
                        onClick={() => onSelect(i)}
                        aria-pressed={selected}
                        className="w-full min-h-11 flex items-center gap-3 p-3 rounded-xl text-left border"
                        style={{
                          background: selected ? "#F7F0FF" : "white",
                          borderColor: selected ? "#9B21FF" : "#E9E5DE",
                          borderLeft: `4px solid ${c.accent}`,
                          opacity: i.status === "cancelada" ? 0.7 : 1,
                        }}
                      >
                        <span className="w-12 flex-shrink-0 text-sm" style={{ color: "#1A1A1A", fontWeight: 800 }}>
                          {fmtHour(i.start)}
                        </span>
                        <span
                          className="hidden sm:flex w-8 h-8 rounded-lg items-center justify-center flex-shrink-0"
                          style={{ background: `${TYPE_COLOR[i.type]}14` }}
                          aria-hidden
                        >
                          <EventTypeIcon type={i.type} color={TYPE_COLOR[i.type]} size={14} />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span
                              className="block text-sm truncate"
                              style={{ color: "#1A1A1A", fontWeight: 700, textDecoration: i.status === "cancelada" ? "line-through" : undefined }}
                            >
                              {i.title}
                            </span>
                            <SourceBadge item={i} />
                            <SampleBadge record={i.event} />
                          </span>
                          <span className="block text-xs truncate" style={{ color: "#6B7280" }}>
                            {[TYPE_LABEL[i.type], prop, who && !i.title.includes(who) ? who : null].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <StatusChip item={i} size="xs" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
