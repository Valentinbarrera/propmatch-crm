import { useEffect, useMemo, useState } from "react";
import { useStore, type NewEventInput } from "@/data/store";
import { AgendaIcon, EventTypeIcon } from "@/components/ui/icons";
import type { CalendarEvent, EventType, VisitStatus } from "@/types/db";
import { STATUS_META, STATUS_ORDER } from "./agendaModel";

/**
 * Alta y edición de un evento de agenda.
 *
 * El título se sugiere solo a partir del tipo y del contacto elegido, porque
 * en la práctica un agente agenda "Visita — Martín Rodríguez" nueve de cada
 * diez veces y escribirlo a mano es fricción pura. Si lo edita, deja de
 * pisarse.
 */

const TYPES: { value: EventType; label: string; color: string }[] = [
  { value: "visita", label: "Visita", color: "#9B21FF" },
  { value: "llamada", label: "Llamada", color: "#3B82F6" },
  { value: "reunion", label: "Reunión", color: "#FF5ECA" },
  { value: "seguimiento", label: "Seguimiento", color: "#F59E0B" },
  { value: "publicacion", label: "Publicación", color: "#CB1093" },
];

const DURATIONS = [30, 45, 60, 90, 120];

/** `Date` -> `YYYY-MM-DD` en hora local (el ISO nativo pasa por UTC y corre el día). */
const toDateInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Próxima media hora en punto, como arranque por defecto. */
function defaultStart(day?: Date): { date: string; time: string } {
  const d = day ? new Date(day) : new Date();
  if (!day) {
    d.setMinutes(d.getMinutes() + 30 - (d.getMinutes() % 30), 0, 0);
    if (d.getHours() < 9) d.setHours(9, 0, 0, 0);
    if (d.getHours() >= 19) {
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
    }
  } else {
    d.setHours(10, 0, 0, 0);
  }
  return {
    date: toDateInput(d),
    time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
  };
}

/** `Date` -> `HH:MM` en hora local. */
const toTimeInput = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

export function EventFormModal({
  day,
  event,
  defaults,
  onClose,
  onSaved,
}: {
  /** Día preseleccionado: al agendar desde una celda del calendario. */
  day?: Date;
  /** Valores iniciales al crear (segunda visita, primer hueco libre). */
  defaults?: { start?: Date; type?: EventType; contactId?: string | null; propertyId?: string | null; ownerId?: string | null };
  /** Si viene, el modal edita este evento en lugar de crear uno. */
  event?: CalendarEvent;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { addEvent, updateEvent, removeEvent, contacts, properties, profiles, profile } = useStore();
  const isEdit = !!event;

  const initial = useMemo(() => {
    if (!event && defaults?.start) {
      return { date: toDateInput(defaults.start), time: toTimeInput(defaults.start), duration: 60 };
    }
    if (!event) return { ...defaultStart(day), duration: 60 };
    const start = new Date(event.starts_at);
    return {
      date: toDateInput(start),
      time: toTimeInput(start),
      duration: Math.max(15, Math.round((new Date(event.ends_at).getTime() - start.getTime()) / 60_000)),
    };
  }, [day, event, defaults]);

  const [type, setType] = useState<EventType>(event?.type ?? defaults?.type ?? "visita");
  const [title, setTitle] = useState(event?.title ?? "");
  // Al editar, el título ya es del agente: no se pisa con la sugerencia.
  const [titleTouched, setTitleTouched] = useState(isEdit);
  const [contactId, setContactId] = useState(event?.contact_id ?? defaults?.contactId ?? "");
  const [propertyId, setPropertyId] = useState(event?.property_id ?? defaults?.propertyId ?? "");
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [duration, setDuration] = useState(initial.duration);
  const [ownerId, setOwnerId] = useState(event?.owner_id ?? defaults?.ownerId ?? profile.id);
  const [status, setStatus] = useState<VisitStatus>(event?.status ?? "por_confirmar");
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  /** Un evento puede durar algo que no está en la lista: se ofrece igual. */
  const durationOptions = DURATIONS.includes(duration)
    ? DURATIONS
    : [...DURATIONS, duration].sort((a, b) => a - b);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const typeLabel = TYPES.find((t) => t.value === type)!.label;
  const contactName = contacts.find((c) => c.id === contactId)?.full_name;
  const suggested = contactName ? `${typeLabel} — ${contactName}` : typeLabel;
  const effectiveTitle = titleTouched && title.trim() ? title.trim() : suggested;

  /** Propiedades ofrecidas primero: las que están disponibles. */
  const propertyOptions = useMemo(
    () =>
      [...properties].sort((a, b) => {
        const rank = (s: string) => (s === "disponible" ? 0 : 1);
        return rank(a.status) - rank(b.status) || a.title.localeCompare(b.title);
      }),
    [properties],
  );

  const contactOptions = useMemo(
    () => [...contacts].sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [contacts],
  );

  function handleSave() {
    const e: Record<string, string> = {};
    if (!date) e.date = "Elegí una fecha";
    if (!time) e.time = "Elegí un horario";
    if (type === "visita" && !propertyId) e.property = "Una visita necesita una propiedad";
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    const [hh, mm] = time.split(":").map(Number);
    const [yy, mo, dd] = date.split("-").map(Number);
    const starts = new Date(yy, mo - 1, dd, hh, mm, 0, 0);
    const ends = new Date(starts.getTime() + duration * 60_000);

    const input: NewEventInput = {
      type,
      title: effectiveTitle,
      contact_id: contactId || null,
      property_id: propertyId || null,
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      notes: notes.trim() || null,
      owner_id: ownerId,
      ...(type === "visita" ? { status } : {}),
    };

    if (event) updateEvent(event.id, input);
    else addEvent(input);
    onSaved?.();
    onClose();
  }

  return (
    <div
      className="pm-backdrop fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(8, 11, 31,0.35)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? "Editar evento" : "Nuevo evento"}
    >
      <div
        className="pm-modal rounded-2xl w-full max-w-xl max-h-[88vh] flex flex-col overflow-hidden"
        style={{ background: "white", boxShadow: "var(--shadow-pop)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div
          className="px-6 py-5 border-b flex items-center gap-3 flex-shrink-0"
          style={{ borderColor: "#E9E5DE", background: "#FAF8F5" }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "var(--gradient-brand)" }}
          >
            <AgendaIcon size={18} color="white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-lg tracking-tight" style={{ color: "#1A1A1A", fontWeight: 800 }}>
              {isEdit ? "Editar evento" : "Nuevo evento"}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
              {isEdit
                ? "Los cambios se ven al instante en el calendario."
                : "Queda en el calendario y en el historial del contacto."}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-violet-50 flex-shrink-0"
            style={{ color: "#6B7280", fontSize: 20, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* Cuerpo */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <div>
            <SectionLabel>Tipo de evento</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {TYPES.map((t) => {
                const active = t.value === type;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    className="flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-xl transition-all border"
                    style={
                      active
                        ? { background: t.color, color: "white", borderColor: "transparent", fontWeight: 600 }
                        : { background: "white", color: "#6B7280", borderColor: "#E9E5DE", fontWeight: 500 }
                    }
                  >
                    <EventTypeIcon type={t.value} color={active ? "white" : t.color} size={12} />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <SectionLabel>Cuándo</SectionLabel>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Fecha" error={errors.date}>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputClass(!!errors.date)}
                />
              </Field>
              <Field label="Hora" error={errors.time}>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  step={900}
                  className={inputClass(!!errors.time)}
                />
              </Field>
              <Field label="Duración">
                <select
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className={selectClass}
                >
                  {durationOptions.map((d) => (
                    <option key={d} value={d}>
                      {d < 60 ? `${d} min` : d === 60 ? "1 hora" : d % 60 === 0 ? `${d / 60} horas` : `${d} min`}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          <div>
            <SectionLabel>Con quién</SectionLabel>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Contacto">
                <select
                  value={contactId}
                  onChange={(e) => setContactId(e.target.value)}
                  className={selectClass}
                >
                  <option value="">Sin contacto</option>
                  {contactOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Propiedad" error={errors.property}>
                <select
                  value={propertyId}
                  onChange={(e) => setPropertyId(e.target.value)}
                  className={errors.property ? selectClassError : selectClass}
                >
                  <option value="">Sin propiedad</option>
                  {propertyOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                      {p.status !== "disponible" ? ` (${p.status})` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Agente">
                <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={selectClass}>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              </Field>
              {type === "visita" && (
                <Field label="Estado de la visita">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as VisitStatus)}
                    className={selectClass}
                  >
                    {STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_META[s].label}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Título">
                <input
                  value={titleTouched ? title : suggested}
                  onChange={(e) => {
                    setTitleTouched(true);
                    setTitle(e.target.value);
                  }}
                  placeholder={suggested}
                  className={inputClass(false)}
                />
              </Field>
            </div>
          </div>

          <div>
            <SectionLabel>Notas</SectionLabel>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Qué hay que preparar, quién más va, cómo llegar…"
              className={inputClass(false) + " resize-none"}
            />
          </div>
        </div>

        {/* Pie */}
        <div
          className="px-6 py-4 border-t flex items-center justify-end gap-3 flex-shrink-0"
          style={{ borderColor: "#E9E5DE", background: "#FAF8F5" }}
        >
          {event && (
            <div className="mr-auto flex items-center gap-2">
              {confirmDelete ? (
                <>
                  <span className="text-xs" style={{ color: "#E11D48", fontWeight: 600 }}>
                    ¿Borrar el evento?
                  </span>
                  <button
                    onClick={() => {
                      removeEvent(event.id);
                      onSaved?.();
                      onClose();
                    }}
                    className="px-3 py-2 rounded-lg text-xs text-white transition-all hover:opacity-90"
                    style={{ background: "#E11D48", fontWeight: 600 }}
                  >
                    Sí, borrar
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="px-3 py-2 rounded-lg text-xs transition-all hover:bg-violet-50"
                    style={{ color: "#6B7280", fontWeight: 600 }}
                  >
                    No
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="px-3 py-2 rounded-lg text-xs transition-all hover:bg-rose-50"
                  style={{ color: "#E11D48", fontWeight: 600 }}
                >
                  Borrar evento
                </button>
              )}
            </div>
          )}
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-sm border transition-all hover:bg-violet-50"
            style={{ borderColor: "#E9E5DE", color: "#6B7280", fontWeight: 600, background: "white" }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2.5 rounded-xl text-sm text-white transition-all hover:opacity-90 active:scale-95"
            style={{ background: "var(--gradient-brand)", fontWeight: 600, boxShadow: "var(--shadow-cta)" }}
          >
            {isEdit ? "Guardar cambios" : "Agendar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Piezas ──────────────────────────────────────────────────────────────── */

const inputClass = (hasError: boolean) =>
  "w-full px-4 py-2.5 rounded-xl text-sm border outline-none transition-all bg-white " +
  "text-[#1A1A1A] placeholder:text-[#6B7280] focus:ring-4 focus:ring-[#E9E5DE] " +
  (hasError ? "border-[#FECDD3] focus:border-[#FB7185]" : "border-[#E9E5DE] focus:border-[#9B21FF]");

const selectClass =
  "w-full px-4 py-2.5 rounded-xl text-sm border outline-none transition-all bg-white " +
  "text-[#1A1A1A] border-[#E9E5DE] focus:border-[#9B21FF] focus:ring-4 focus:ring-[#E9E5DE]";

const selectClassError =
  "w-full px-4 py-2.5 rounded-xl text-sm border outline-none transition-all bg-white " +
  "text-[#1A1A1A] border-[#FECDD3] focus:border-[#FB7185] focus:ring-4 focus:ring-[#E9E5DE]";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-xs uppercase mb-3"
      style={{ color: "#9B21FF", fontWeight: 700, letterSpacing: "0.1em" }}
    >
      {children}
    </p>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs mb-1.5" style={{ color: "#6B7280", fontWeight: 600 }}>
        {label}
      </span>
      {children}
      {error && (
        <span className="block text-xs mt-1.5" style={{ color: "#E11D48", fontWeight: 500 }}>
          {error}
        </span>
      )}
    </label>
  );
}
