import { useEffect, useId, useState } from "react";
import { SampleBadge } from "@/components/ui/SampleBadge";
import { useNavigate } from "react-router-dom";
import { useStore } from "@/data/store";
import { CheckIcon, ClockIcon, EditIcon, EventTypeIcon, MapPinIcon, PhoneIcon, WhatsAppIcon } from "@/components/ui/icons";
import type { Template } from "@/components/share/WhatsAppModal";
import { avatarGradient, initials, money, PROPERTY_TYPE_LABEL } from "@/lib/format";
import { firstName, whatsappLink } from "@/lib/whatsapp";
import { contactBlock } from "@/lib/marketing/block";
import type {
  CalendarEvent,
  Contact,
  EventType,
  Property,
  VisitFeedback,
  VisitHappened,
  VisitInterest,
  VisitNextAction,
  VisitStatus,
} from "@/types/db";
import {
  INTEREST_LABEL,
  NEXT_ACTION_LABEL,
  SOURCE_LABEL,
  STATUS_META,
  STATUS_ORDER,
  TYPE_COLOR,
  TYPE_LABEL,
  countdown,
  fmtHour,
  isVisit,
  mapsSearchUrl,
  propertyAddress,
  type AgendaItem,
} from "./agendaModel";
import { SourceBadge, StatusChip } from "./AgendaCalendar";

/**
 * Panel de la visita seleccionada: cuándo, qué propiedad, con quién, la
 * coordinación (checklist manual) y el feedback después de la visita.
 *
 * Todo lo que se marca acá es local del CRM. Las visitas de la app se ven
 * con su estado real pero ese estado se cambia desde la app.
 */

export interface ScheduleDefaults {
  start?: Date;
  type?: EventType;
  contactId?: string | null;
  propertyId?: string | null;
  ownerId?: string | null;
}

const HAPPENED_LABEL: Record<VisitHappened, string> = {
  si: "Sí, se hizo",
  reprogramada: "Se reprogramó",
  no_show: "No vino",
};

const HAPPENED_STATUS: Record<VisitHappened, VisitStatus> = {
  si: "realizada",
  reprogramada: "reprogramada",
  no_show: "no_show",
};

const toDateInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function VisitPanel({
  item,
  isNext,
  now,
  feedbackRequest,
  onEdit,
  onWhatsApp,
  onSchedule,
}: {
  item: AgendaItem | null;
  /** Es la próxima (no fue elegida a mano): cambia el título del panel. */
  isNext: boolean;
  now: Date;
  /** Cambia cada vez que alguien pide abrir el feedback (KPI "pendientes"). */
  feedbackRequest: number;
  onEdit: (event: CalendarEvent) => void;
  onWhatsApp: (contact: Contact, template: Template, property?: Property) => void;
  onSchedule: (defaults: ScheduleDefaults) => void;
}) {
  const navigate = useNavigate();
  const { agency, contactById, propertyById, coverPhoto, matches, updateProperty, patchEvent, patchAppVisitChecklist, logActivity } =
    useStore();

  if (!item) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
          No hay visitas próximas
        </p>
        <p className="text-xs mt-1" style={{ color: "#6B7280" }}>
          Elegí una card del calendario para ver el detalle acá.
        </p>
        <button
          type="button"
          onClick={() => onSchedule({ type: "visita" })}
          className="mt-4 min-h-11 px-4 rounded-xl text-sm text-white"
          style={{ background: "var(--gradient-brand)", fontWeight: 600 }}
        >
          Agendar visita
        </button>
      </div>
    );
  }

  const contact = contactById(item.contactId);
  const property = propertyById(item.propertyId);
  const who = contact?.full_name ?? item.contactFallback;
  const score =
    contact && property ? (matches.find((m) => m.contact_id === contact.id && m.property_id === property.id)?.score ?? null) : null;
  const visit = isVisit(item);
  const isApp = item.source === "app";
  const past = item.end.getTime() <= now.getTime();
  const started = item.start.getTime() <= now.getTime();

  const setStatus = (status: VisitStatus) => {
    if (item.event) patchEvent(item.event.id, { status });
  };

  const markChecklist = (key: "reminder_sent_at" | "location_sent_at") => {
    const at = new Date().toISOString();
    if (item.event) patchEvent(item.event.id, { checklist: { ...item.checklist, [key]: at } });
    else patchAppVisitChecklist(item.id, { [key]: at });
  };

  const sendReminder = () => {
    if (!contact) return;
    // Marketing: pidió no recibir más mensajes por WhatsApp.
    if (contactBlock(agency.id, contact).whatsapp) {
      window.alert(`${contact.full_name} pidió no recibir más mensajes por WhatsApp (No contactar). Avisale por otra vía si hace falta.`);
      return;
    }
    const day = item.start.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
    const address = propertyAddress(property);
    const text = `Hola ${firstName(contact.full_name)}! Te recuerdo la visita${property ? ` a ${property.title}` : ""} el ${day} a las ${fmtHour(item.start)} h${address ? ` (${address})` : ""}. Cualquier cambio avisame por acá. ¡Nos vemos!`;
    window.open(whatsappLink(contact.phone, text), "_blank", "noopener");
    logActivity({
      type: "mensaje",
      title: `WhatsApp a ${firstName(contact.full_name)}: recordatorio de visita`,
      detail: text.slice(0, 90),
      contact_id: contact.id,
      property_id: null,
    });
    markChecklist("reminder_sent_at");
  };

  const mapsUrl = mapsSearchUrl(property);
  const sendLocation = () => {
    if (!contact || !mapsUrl) return;
    // Marketing: pidió no recibir más mensajes por WhatsApp.
    if (contactBlock(agency.id, contact).whatsapp) {
      window.alert(`${contact.full_name} pidió no recibir más mensajes por WhatsApp (No contactar). Avisale por otra vía si hace falta.`);
      return;
    }
    const text = `Hola ${firstName(contact.full_name)}! Te paso la ubicación${property ? ` de ${property.title}` : ""}: ${mapsUrl}`;
    window.open(whatsappLink(contact.phone, text), "_blank", "noopener");
    logActivity({
      type: "mensaje",
      title: `WhatsApp a ${firstName(contact.full_name)}: ubicación de la visita`,
      detail: property?.title ?? null,
      contact_id: contact.id,
      property_id: null,
    });
    markChecklist("location_sent_at");
  };

  const confirmed = item.status === "confirmada" || item.status === "realizada";
  const cancelled = item.status === "cancelada";
  const photo = property ? coverPhoto(property.id) : null;

  return (
    <div className="flex flex-col">
      {/* Banner */}
      <div className="px-5 py-4 relative overflow-hidden" style={{ background: "var(--gradient-brand-wide)" }}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-white text-xs uppercase" style={{ letterSpacing: "0.1em", fontWeight: 700, opacity: 0.9 }}>
            {isNext ? (visit ? "Próxima visita" : "Próximo evento") : visit ? "Visita seleccionada" : "Evento seleccionado"}
          </p>
          {item.status && (
            <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: "white", color: STATUS_META[item.status].text, fontWeight: 700 }}>
              {STATUS_META[item.status].label}
            </span>
          )}
        </div>
        <p className="text-white text-2xl mt-1 tracking-tight" style={{ fontWeight: 800 }} aria-live="polite">
          {countdown(item.start, item.end, now)}
        </p>
        <p className="text-white text-xs mt-0.5 flex items-center gap-1.5" style={{ opacity: 0.9 }}>
          <ClockIcon size={12} color="white" />
          {item.start.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })} · {fmtHour(item.start)}–{fmtHour(item.end)}
        </p>
      </div>

      <div className="p-4 space-y-4">
        {/* Qué es */}
        <div className="flex items-start gap-2">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${TYPE_COLOR[item.type]}14` }} aria-hidden>
            <EventTypeIcon type={item.type} color={TYPE_COLOR[item.type]} size={14} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
              {item.title} <SampleBadge record={item.event} />
            </p>
            <p className="text-xs flex items-center gap-1.5 flex-wrap mt-0.5" style={{ color: "#6B7280" }}>
              {TYPE_LABEL[item.type]}
              <SourceBadge item={item} />
            </p>
          </div>
          {item.event && (
            <button
              type="button"
              onClick={() => onEdit(item.event!)}
              className="min-h-11 min-w-11 flex items-center justify-center rounded-xl hover:bg-violet-50"
              aria-label="Editar evento"
              title="Editar evento"
            >
              <EditIcon size={15} />
            </button>
          )}
        </div>

        {/* Estado */}
        {visit && (
          <div>
            <SectionTitle>Estado</SectionTitle>
            {isApp ? (
              <div className="rounded-xl p-3 text-xs" style={{ background: "#F7F0FF", color: "#6B7280" }}>
                <StatusChip item={item} />
                <p className="mt-2" style={{ lineHeight: 1.5 }}>
                  Visita pedida desde la app. El estado se gestiona en la app: desde el CRM se ve pero no se cambia.
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Estado de la visita">
                {STATUS_ORDER.map((s) => {
                  const m = STATUS_META[s];
                  const active = item.status === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setStatus(s)}
                      className="min-h-11 sm:min-h-9 px-2.5 rounded-lg text-xs border"
                      style={
                        active
                          ? { background: m.bg, color: m.text, borderColor: m.text, fontWeight: 700 }
                          : { background: "white", color: "#6B7280", borderColor: "#E9E5DE", fontWeight: 600 }
                      }
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Propiedad */}
        {property ? (
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#E9E5DE" }}>
            <div className="flex gap-3 p-3">
              <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0" style={{ background: "#F7F0FF" }}>
                {photo ? (
                  <img src={photo} alt="" loading="lazy" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <EventTypeIcon type="visita" color="#D4AAFF" size={22} />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] uppercase" style={{ color: "#6B7280", fontWeight: 700, letterSpacing: "0.06em" }}>
                  {PROPERTY_TYPE_LABEL[property.type]} · {money(property.price, property.currency)}
                </p>
                <p className="text-sm leading-snug mt-0.5" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                  {property.title}
                </p>
                {propertyAddress(property) && (
                  <p className="text-xs mt-0.5 flex items-start gap-1" style={{ color: "#6B7280" }}>
                    <MapPinIcon size={11} color="#6B7280" className="mt-0.5 flex-shrink-0" />
                    <span>{propertyAddress(property)}</span>
                  </p>
                )}
                <p className="text-xs mt-1" style={{ color: "#6B7280", fontWeight: 600 }}>
                  {[
                    property.rooms ? `${property.rooms} amb.` : null,
                    property.surface_total ? `${property.surface_total} m²` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Sin ambientes ni m² cargados"}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-t" style={{ borderColor: "#F0EDE6", background: "#FAF8F5" }}>
              {property.keys_custody ? (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border"
                  style={{ background: "var(--color-state-green-bg)", color: "var(--color-state-green-text)", borderColor: "var(--color-state-green-border)", fontWeight: 700 }}
                >
                  <CheckIcon size={10} /> Llaves en custodia
                </span>
              ) : (
                <span className="text-xs" style={{ color: "#6B7280" }}>
                  Llaves: no las tenemos
                </span>
              )}
              <label className="flex items-center gap-2 text-xs min-h-11 cursor-pointer" style={{ color: "#6B7280", fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={!!property.keys_custody}
                  onChange={(e) => updateProperty(property.id, { keys_custody: e.target.checked })}
                  className="w-4 h-4 accent-[#9B21FF]"
                />
                Tenemos las llaves
              </label>
            </div>
          </div>
        ) : (
          item.propertyId === null &&
          visit && (
            <p className="text-xs" style={{ color: "#6B7280" }}>
              {isApp ? "La propiedad todavía no llegó al CRM: se completa con la próxima sincronización." : "Sin propiedad asociada."}
            </p>
          )
        )}

        {/* Contacto */}
        {who && (
          <div>
            <SectionTitle>Contacto</SectionTitle>
            <div className="flex items-center gap-2.5">
              <div
                className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarGradient(who)} flex items-center justify-center text-white flex-shrink-0 text-xs`}
                style={{ fontWeight: 800 }}
                aria-hidden
              >
                {initials(who)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                  {who}
                </p>
                <p className="text-xs flex items-center gap-2 flex-wrap" style={{ color: "#6B7280" }}>
                  {contact ? `Origen: ${SOURCE_LABEL[contact.source]}` : "Todavía no está en el CRM"}
                  {score !== null && (
                    <span className="px-1.5 py-px rounded-md" style={{ background: "#E9E5DE", color: "#7C0BD8", fontWeight: 700 }}>
                      Match {Math.round(score)}%
                    </span>
                  )}
                </p>
              </div>
            </div>
            {contact && (
              <div className="grid grid-cols-3 gap-2 mt-3">
                {contact.phone ? (
                  <a
                    href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}
                    className="min-h-11 flex items-center justify-center gap-1.5 rounded-xl text-xs border hover:bg-violet-50"
                    style={{ borderColor: "#E9E5DE", color: "#7C0BD8", fontWeight: 700 }}
                  >
                    <PhoneIcon size={13} /> Llamar
                  </a>
                ) : contact.source === "consumer_app" ? (
                  <button
                    type="button"
                    onClick={() => navigate("/inbox")}
                    className="min-h-11 flex items-center justify-center gap-1.5 rounded-xl text-xs border hover:bg-violet-50"
                    style={{ borderColor: "#E9E5DE", color: "#7C0BD8", fontWeight: 700 }}
                    title="Los usuarios de la app no comparten su teléfono: escribile por el chat"
                  >
                    Ir al chat
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="min-h-11 flex items-center justify-center gap-1.5 rounded-xl text-xs border opacity-50 cursor-not-allowed"
                    style={{ borderColor: "#E9E5DE", color: "#6B7280", fontWeight: 700 }}
                    title="Este contacto no tiene teléfono cargado"
                  >
                    <PhoneIcon size={13} /> Sin teléfono
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onWhatsApp(contact, "visita", property)}
                  className="min-h-11 flex items-center justify-center gap-1.5 rounded-xl text-xs text-[#063B2A] hover:opacity-90"
                  style={{ background: "#25D366", fontWeight: 700 }}
                >
                  <WhatsAppIcon size={13} color="#063B2A" /> WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/contactos/${contact.id}`)}
                  className="min-h-11 flex items-center justify-center rounded-xl text-xs border hover:bg-violet-50"
                  style={{ borderColor: "#E9E5DE", color: "#7C0BD8", fontWeight: 700 }}
                >
                  Ver contacto
                </button>
              </div>
            )}
          </div>
        )}

        {item.notes && (
          <div>
            <SectionTitle>{isApp ? "Nota de la app" : "Notas"}</SectionTitle>
            <p className="text-xs whitespace-pre-line" style={{ color: "#374151", lineHeight: 1.5 }}>
              {item.notes}
            </p>
          </div>
        )}

        {/* Coordinación */}
        {visit && !cancelled && !past && (
          <div>
            <SectionTitle>Coordinación</SectionTitle>
            <ul className="space-y-1.5">
              <ChecklistRow
                done={!!item.checklist.reminder_sent_at}
                label="Recordatorio enviado"
                detail={item.checklist.reminder_sent_at ? `Por WhatsApp, ${sentAt(item.checklist.reminder_sent_at)}` : "Abre WhatsApp con el recordatorio y la fecha"}
                action={item.checklist.reminder_sent_at ? "Reenviar" : "Enviar"}
                disabledReason={!contact ? "Hace falta un contacto en el CRM" : null}
                onClick={sendReminder}
              />
              <ChecklistRow
                done={!!item.checklist.location_sent_at}
                label="Ubicación enviada"
                detail={item.checklist.location_sent_at ? `Por WhatsApp, ${sentAt(item.checklist.location_sent_at)}` : "Abre WhatsApp con el link de Google Maps"}
                action={item.checklist.location_sent_at ? "Reenviar" : "Enviar"}
                disabledReason={!contact ? "Hace falta un contacto en el CRM" : !mapsUrl ? "La propiedad no tiene dirección cargada" : null}
                onClick={sendLocation}
              />
              <ChecklistRow
                done={confirmed}
                label="Confirmada"
                detail={isApp ? "Se confirma desde la app" : confirmed ? "La visita está confirmada" : "Tildala cuando el cliente confirme"}
                action={isApp ? null : confirmed ? "Desmarcar" : "Marcar"}
                disabledReason={null}
                onClick={() => setStatus(confirmed ? "por_confirmar" : "confirmada")}
              />
            </ul>
          </div>
        )}

        {/* Feedback */}
        {visit && started && !cancelled && (
          <FeedbackSection
            key={`${item.key}-${feedbackRequest}`}
            item={item}
            contact={contact}
            property={property}
            autoOpen={feedbackRequest > 0}
            onWhatsApp={onWhatsApp}
            onSchedule={onSchedule}
          />
        )}
      </div>
    </div>
  );
}

const sentAt = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("es-AR", { day: "numeric", month: "short" })} ${fmtHour(d)}`;
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs uppercase mb-2" style={{ color: "#6B7280", fontWeight: 700, letterSpacing: "0.1em" }}>
      {children}
    </p>
  );
}

function ChecklistRow({
  done,
  label,
  detail,
  action,
  disabledReason,
  onClick,
}: {
  done: boolean;
  label: string;
  detail: string;
  action: string | null;
  disabledReason: string | null;
  onClick: () => void;
}) {
  return (
    <li className="flex items-center gap-2.5 p-2 rounded-xl border" style={{ borderColor: "#F0EDE6" }}>
      <span
        className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
        style={done ? { background: "var(--gradient-brand)" } : { border: "2px solid #DDD8CF", background: "white" }}
        aria-hidden
      >
        {done && <CheckIcon size={10} color="white" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-xs" style={{ color: "#1A1A1A", fontWeight: 700 }}>
          {label}
          <span className="sr-only">{done ? " (hecho)" : " (pendiente)"}</span>
        </span>
        <span className="block text-[11px]" style={{ color: "#6B7280" }}>
          {disabledReason ?? detail}
        </span>
      </span>
      {action && (
        <button
          type="button"
          onClick={onClick}
          disabled={!!disabledReason}
          className="min-h-11 sm:min-h-9 px-3 rounded-lg text-xs border hover:bg-violet-50 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ borderColor: "#E9E5DE", color: "#7C0BD8", fontWeight: 700 }}
          aria-label={`${action}: ${label}`}
        >
          {action}
        </button>
      )}
    </li>
  );
}

/* ── Feedback post-visita ─────────────────────────────────────────────────── */

function FeedbackSection({
  item,
  contact,
  property,
  autoOpen,
  onWhatsApp,
  onSchedule,
}: {
  item: AgendaItem;
  contact: Contact | undefined;
  property: Property | undefined;
  autoOpen: boolean;
  onWhatsApp: (contact: Contact, template: Template, property?: Property) => void;
  onSchedule: (defaults: ScheduleDefaults) => void;
}) {
  const { patchEvent, saveAppVisitFeedback, addTask, logActivity, contactById, profile } = useStore();
  const existing = item.feedback;
  const [editing, setEditing] = useState(!existing || autoOpen);
  const [happened, setHappened] = useState<VisitHappened>(existing?.happened ?? "si");
  const [interest, setInterest] = useState<VisitInterest | null>(existing?.interest ?? null);
  const [nextAction, setNextAction] = useState<VisitNextAction | "">(existing?.next_action ?? "");
  const [createFollowUp, setCreateFollowUp] = useState(true);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [saved, setSaved] = useState<string | null>(null);
  const owner = property ? contactById(property.owner_contact_id) : undefined;

  useEffect(() => {
    if (!autoOpen) return;
    document.getElementById(`feedback-${item.key}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [autoOpen, item.key]);

  const who = contact?.full_name ?? item.contactFallback ?? "el contacto";

  function save(notifyOwner: boolean) {
    const fb: VisitFeedback = {
      happened,
      interest: happened === "si" ? interest : null,
      next_action: nextAction || null,
      notes: notes.trim() || null,
      saved_at: new Date().toISOString(),
    };
    if (item.event) patchEvent(item.event.id, { feedback: fb, status: HAPPENED_STATUS[happened] });
    else saveAppVisitFeedback(item.id, fb);

    logActivity({
      type: "nota",
      title: `Feedback de visita: ${HAPPENED_LABEL[happened].toLowerCase()}`,
      detail:
        [
          fb.interest ? `Interés ${INTEREST_LABEL[fb.interest].toLowerCase()}` : null,
          fb.next_action ? `Próximo paso: ${NEXT_ACTION_LABEL[fb.next_action].toLowerCase()}` : null,
          property?.title,
        ]
          .filter(Boolean)
          .join(" · ") || null,
      contact_id: item.contactId,
      property_id: null,
    });

    let followUpMsg = "";
    if (fb.next_action && createFollowUp) {
      if (fb.next_action === "segunda_visita") {
        const start = new Date(item.start);
        start.setDate(start.getDate() + 7);
        onSchedule({ type: "visita", start, contactId: item.contactId, propertyId: item.propertyId, ownerId: item.ownerId });
        followUpMsg = " Completá la segunda visita en el formulario.";
      } else {
        const due = new Date();
        due.setDate(due.getDate() + 2);
        addTask({
          text: `${NEXT_ACTION_LABEL[fb.next_action]}: ${who}${property ? ` — ${property.title}` : ""}`,
          is_priority: fb.interest === "alto",
          due_date: toDateInput(due),
          contact_id: item.contactId,
          owner_id: item.ownerId ?? profile.id,
        });
        followUpMsg = " Creamos la tarea para dentro de 2 días.";
      }
    }

    setSaved(`Feedback guardado.${followUpMsg}`);
    setEditing(false);
    if (notifyOwner && owner) onWhatsApp(owner, "informe", property);
  }

  return (
    <div id={`feedback-${item.key}`} className="rounded-2xl border p-3" style={{ borderColor: "#E9E5DE", background: "#FAF8F5" }}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <SectionTitle>¿Cómo salió la visita?</SectionTitle>
        {!editing && existing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="min-h-11 sm:min-h-9 px-3 rounded-lg text-xs hover:bg-violet-50"
            style={{ color: "#7C0BD8", fontWeight: 700 }}
          >
            Editar
          </button>
        )}
      </div>

      {saved && (
        <p role="status" className="text-xs mb-2 px-2.5 py-2 rounded-lg" style={{ background: "var(--color-state-green-bg)", color: "var(--color-state-green-text)", fontWeight: 600 }}>
          {saved}
        </p>
      )}

      {!editing && existing ? (
        <dl className="text-xs grid grid-cols-[auto_1fr] gap-x-3 gap-y-1" style={{ color: "#374151" }}>
          <dt style={{ color: "#6B7280" }}>Se hizo</dt>
          <dd style={{ fontWeight: 600 }}>{HAPPENED_LABEL[existing.happened]}</dd>
          {existing.interest && (
            <>
              <dt style={{ color: "#6B7280" }}>Interés</dt>
              <dd style={{ fontWeight: 600 }}>{INTEREST_LABEL[existing.interest]}</dd>
            </>
          )}
          {existing.next_action && (
            <>
              <dt style={{ color: "#6B7280" }}>Próximo paso</dt>
              <dd style={{ fontWeight: 600 }}>{NEXT_ACTION_LABEL[existing.next_action]}</dd>
            </>
          )}
          {existing.notes && (
            <>
              <dt style={{ color: "#6B7280" }}>Notas</dt>
              <dd className="whitespace-pre-line">{existing.notes}</dd>
            </>
          )}
        </dl>
      ) : (
        <div className="space-y-3">
          <ChipGroup
            label="¿Se hizo?"
            options={(Object.keys(HAPPENED_LABEL) as VisitHappened[]).map((k) => ({ value: k, label: HAPPENED_LABEL[k] }))}
            value={happened}
            onChange={(v) => setHappened(v as VisitHappened)}
          />
          {happened === "si" && (
            <ChipGroup
              label="Interés"
              options={(Object.keys(INTEREST_LABEL) as VisitInterest[]).map((k) => ({ value: k, label: INTEREST_LABEL[k] }))}
              value={interest}
              onChange={(v) => setInterest(v as VisitInterest)}
            />
          )}
          <label className="block">
            <span className="block text-xs mb-1" style={{ color: "#6B7280", fontWeight: 600 }}>
              Próxima acción
            </span>
            <select
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value as VisitNextAction | "")}
              className="w-full min-h-11 px-3 rounded-xl text-sm border outline-none bg-white text-[#1A1A1A] border-[#E9E5DE] focus:border-[#9B21FF] focus:ring-4 focus:ring-[#E9E5DE]"
            >
              <option value="">Ninguna por ahora</option>
              {(Object.keys(NEXT_ACTION_LABEL) as VisitNextAction[]).map((k) => (
                <option key={k} value={k}>
                  {NEXT_ACTION_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          {nextAction && (
            <label className="flex items-center gap-2 text-xs min-h-11 cursor-pointer" style={{ color: "#374151" }}>
              <input
                type="checkbox"
                checked={createFollowUp}
                onChange={(e) => setCreateFollowUp(e.target.checked)}
                className="w-4 h-4 accent-[#9B21FF]"
              />
              {nextAction === "segunda_visita" ? "Agendar la segunda visita al guardar" : "Crear una tarea para el próximo paso"}
            </label>
          )}
          <label className="block">
            <span className="block text-xs mb-1" style={{ color: "#6B7280", fontWeight: 600 }}>
              Notas
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Qué le gustó, qué no, objeciones…"
              className="w-full px-3 py-2 rounded-xl text-sm border outline-none resize-none bg-white text-[#1A1A1A] placeholder:text-[#6B7280] border-[#E9E5DE] focus:border-[#9B21FF] focus:ring-4 focus:ring-[#E9E5DE]"
            />
          </label>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => save(false)}
              className="min-h-11 rounded-xl text-sm text-white hover:opacity-90"
              style={{ background: "var(--gradient-brand)", fontWeight: 600 }}
            >
              Guardar feedback
            </button>
            <button
              type="button"
              onClick={() => save(true)}
              disabled={!owner}
              className="min-h-11 rounded-xl text-sm border hover:bg-violet-50 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 600, background: "white" }}
              title={owner ? `Abre WhatsApp con el informe para ${owner.full_name}` : "La propiedad no tiene propietario cargado"}
            >
              Guardar y avisar al propietario
            </button>
            {!owner && (
              <p className="text-[11px]" style={{ color: "#6B7280" }}>
                Para avisar al propietario, cargalo en la ficha de la propiedad.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ChipGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string | null;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div>
      <span className="block text-xs mb-1" style={{ color: "#6B7280", fontWeight: 600 }} id={id}>
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby={id}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.value)}
              className="min-h-11 sm:min-h-9 px-3 rounded-lg text-xs border"
              style={
                active
                  ? { background: "#1A1A1A", color: "white", borderColor: "transparent", fontWeight: 700 }
                  : { background: "white", color: "#6B7280", borderColor: "#E9E5DE", fontWeight: 600 }
              }
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
