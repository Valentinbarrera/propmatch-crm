import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/data/store";
import { WhatsAppIcon } from "@/components/ui/icons";
import { buildSharedListing, listingUrl, localOnlyPhotos } from "@/lib/share";
import { firstName, normalizeWhatsappNumber, whatsappLink } from "@/lib/whatsapp";
import { OPERATION_LABEL, money } from "@/lib/format";
import type { Contact, Property } from "@/types/db";
import { ownerReport } from "@/lib/ownerReport";
import { authorizationState } from "@/lib/authorization";
import { isSample, isSamplePhone } from "@/lib/samples";
import { SampleBadge, SampleNotice } from "@/components/ui/SampleBadge";
import { useContactBlock } from "@/lib/marketing/block";

/**
 * Mensaje de WhatsApp a un contacto.
 *
 * El agente elige una plantilla, la retoca y la manda desde su propio
 * WhatsApp (web o app). No hay API de WhatsApp de por medio: es el mismo
 * WhatsApp que ya usa, así que no hay que pagar ni aprobar nada. A cambio, el
 * CRM no sabe si el mensaje salió; registra que se abrió el chat.
 */

const WA_GREEN = "#25D366";

export type Template = "informe" | "propiedad" | "saludo" | "visita" | "postvisita" | "seguimiento";

const TEMPLATE_LABEL: Record<Template, string> = {
  informe: "Informe al propietario",
  propiedad: "Enviar propiedad",
  saludo: "Primer contacto",
  visita: "Confirmar visita",
  postvisita: "Después de la visita",
  seguimiento: "Seguimiento",
};

export function WhatsAppModal({
  contact,
  property: initialProperty,
  template: initialTemplate,
  onClose,
  onSent,
}: {
  contact: Contact;
  /** Propiedad preseleccionada (al abrir desde un match o desde la ficha). */
  property?: Property;
  /** Plantilla con la que abre (por ejemplo, la que sugiere el seguimiento). */
  template?: Template;
  onClose: () => void;
  onSent?: () => void;
}) {
  const { agency, profile, matches, properties, photos, events, opportunities, activities, profileById, logActivity } =
    useStore();

  /** Propiedades de las que este contacto es dueño: habilitan el informe. */
  const owned = useMemo(() => properties.filter((p) => p.owner_contact_id === contact.id), [properties, contact.id]);
  const templates = (Object.keys(TEMPLATE_LABEL) as Template[]).filter((t) => t !== "informe" || owned.length > 0);

  /** Propiedades para ofrecer: primero las que matchean con el contacto. */
  const options = useMemo(() => {
    const matched = matches
      .filter((m) => m.contact_id === contact.id)
      .map((m) => ({ property: properties.find((p) => p.id === m.property_id), score: m.score }))
      .filter((o): o is { property: Property; score: number } => !!o.property);
    const ids = new Set(matched.map((o) => o.property.id));
    const rest = properties
      .filter((p) => p.status === "disponible" && !ids.has(p.id))
      .map((property) => ({ property, score: null as number | null }));
    return [...matched, ...rest];
  }, [matches, properties, contact.id]);

  const nextVisit = useMemo(
    () =>
      events
        .filter((e) => e.contact_id === contact.id && new Date(e.starts_at).getTime() > Date.now())
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0],
    [events, contact.id],
  );

  const [template, setTemplate] = useState<Template>(
    initialTemplate ??
    (owned.length && (!initialProperty || initialProperty.owner_contact_id === contact.id)
      ? "informe"
      : initialProperty || options.length
        ? "propiedad"
        : "saludo"),
  );
  const [propertyId, setPropertyId] = useState(
    initialProperty?.id ?? (owned.length ? owned[0].id : options[0]?.property.id) ?? "",
  );
  const property = properties.find((p) => p.id === propertyId);
  const [link, setLink] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [edited, setEdited] = useState(false);

  // Contacto de ejemplo: su teléfono es inventado y whatsappLink no lo usa (WhatsApp abre sin destinatario).
  const sampleContact = isSample(contact) || isSamplePhone(contact.phone);
  const number = sampleContact ? null : normalizeWhatsappNumber(contact.phone);
  const name = firstName(contact.full_name);
  const me = firstName(profile.full_name);
  // Marketing: si pidió no recibir más mensajes por WhatsApp, el CRM no abre el chat.
  const block = useContactBlock(agency.id, contact);

  // La ficha se arma de forma asíncrona (comprime), por eso el link llega después.
  useEffect(() => {
    let alive = true;
    setLink(null);
    if (!property) return;
    const listing = buildSharedListing(property, photos[property.id] ?? [], agency, profileById(property.owner_agent_id));
    listingUrl(listing).then((url) => alive && setLink(url));
    return () => {
      alive = false;
    };
  }, [property, photos, agency, profileById]);

  const suggested = useMemo(() => {
    switch (template) {
      case "informe": {
        if (!property) return `Hola ${name}! Soy ${me} de ${agency.name}.`;
        const r = ownerReport(property.id, { matches, opportunities, events, activities });
        const auth = authorizationState(property.authorization_type, property.authorization_expires_at);
        const lines = [
          `Hola ${name}! Soy ${me} de ${agency.name}. Te paso cómo viene ${property.title}:`,
          ``,
          `👥 ${r.interested} ${r.interested === 1 ? "cliente de nuestra cartera busca" : "clientes de nuestra cartera buscan"} algo así`,
          r.sentTo ? `📲 Se la enviamos a ${r.sentTo} ${r.sentTo === 1 ? "interesado" : "interesados"}` : null,
          r.inProgress ? `🤝 ${r.inProgress} en conversación` : null,
          r.visitsDone || r.visitsUpcoming
            ? `🏠 ${r.visitsDone} ${r.visitsDone === 1 ? "visita hecha" : "visitas hechas"}${r.visitsUpcoming ? ` y ${r.visitsUpcoming} ${r.visitsUpcoming === 1 ? "agendada" : "agendadas"}` : ""}`
            : null,
          r.veryInterested
            ? `⭐ ${r.veryInterested} ${r.veryInterested === 1 ? "quedó muy interesado" : "quedaron muy interesados"}`
            : null,
          auth.tone === "expired" || auth.tone === "warning"
            ? `\n📝 La autorización ${auth.tone === "expired" ? "ya venció" : `vence en ${auth.daysLeft} días`}: ¿coordinamos para renovarla?`
            : null,
          ``,
          `Cualquier duda, escribime por acá.`,
        ];
        return lines.filter((l) => l !== null).join("\n");
      }
      case "propiedad": {
        if (!property) return `Hola ${name}! Soy ${me} de ${agency.name}.`;
        const where = [property.zone, property.locality].filter(Boolean)[0];
        return [
          `Hola ${name}! Soy ${me} de ${agency.name}.`,
          `Te comparto una propiedad que coincide con lo que estás buscando:`,
          ``,
          `🏠 ${property.title}`,
          `${OPERATION_LABEL[property.operation]} · ${money(property.price, property.currency)}${where ? ` · ${where}` : ""}`,
          ``,
          `Fotos y detalles: ${link ?? "…"}`,
          ``,
          `¿Querés que coordinemos una visita?`,
        ].join("\n");
      }
      case "saludo":
        return `Hola ${name}! Soy ${me} de ${agency.name}. Recibimos tu consulta y quería ayudarte con tu búsqueda. ¿Tenés un minuto para contarme qué estás buscando?`;
      case "visita": {
        if (!nextVisit) return `Hola ${name}! Te escribo para coordinar la visita. ¿Qué día y horario te queda cómodo?`;
        const d = new Date(nextVisit.starts_at);
        const day = d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
        const hour = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
        return `Hola ${name}! Te confirmo "${nextVisit.title}" el ${day} a las ${hour} h. Cualquier cambio avisame por acá. ¡Nos vemos!`;
      }
      case "postvisita":
        return property
          ? `Hola ${name}! ¿Qué te pareció ${property.title}? Contame qué te gustó y qué no, así te busco opciones que encajen mejor.`
          : `Hola ${name}! ¿Qué te pareció la visita? Contame qué te gustó y qué no, así te busco opciones que encajen mejor.`;
      case "seguimiento":
        return `Hola ${name}! ¿Cómo estás? Quería saber si pudiste pensar en las propiedades que te pasé o si preferís que te busque otras opciones.`;
    }
  }, [template, property, link, name, me, agency.name, nextVisit, matches, opportunities, events, activities]);

  // Mientras el agente no toque el texto, sigue a la plantilla (y al link cuando llega).
  useEffect(() => {
    if (!edited) setText(suggested);
  }, [suggested, edited]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const waitingLink = template === "propiedad" && !!property && !link;
  const skippedPhotos = property && template === "propiedad" ? localOnlyPhotos(photos[property.id] ?? []) : 0;

  function send() {
    if (block.whatsapp) return;
    window.open(whatsappLink(contact.phone, text), "_blank", "noopener");
    logActivity({
      type: "mensaje",
      title: `WhatsApp a ${name}: ${TEMPLATE_LABEL[template].toLowerCase()}`,
      detail: (template === "propiedad" || template === "informe") && property ? property.title : text.slice(0, 90),
      contact_id: contact.id,
      // Solo "enviar propiedad" cuenta como aviso a un interesado; el informe
      // va al dueño y no debe sumar en "se la enviamos a N".
      property_id: template === "propiedad" ? (property?.id ?? null) : null,
    });
    onSent?.();
    onClose();
  }

  return (
    <div
      className="pm-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      style={{ background: "rgba(8, 11, 31,0.35)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`WhatsApp a ${contact.full_name}`}
    >
      <div
        className="pm-modal rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
        style={{ background: "white", boxShadow: "var(--shadow-pop)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b flex items-center gap-3" style={{ borderColor: "#E9E5DE", background: "#FAF8F5" }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: WA_GREEN }}>
            <WhatsAppIcon size={20} color="white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-lg tracking-tight truncate" style={{ color: "#1A1A1A", fontWeight: 800 }}>
              WhatsApp a {contact.full_name} <SampleBadge record={contact} show={sampleContact} />
            </p>
            <p className="text-xs mt-0.5" style={{ color: number || sampleContact ? "#6B7280" : "#E11D48" }}>
              {sampleContact
                ? "Teléfono de ejemplo: no se usa"
                : number
                  ? `+${number}`
                  : "Sin teléfono válido: vas a elegir el chat a mano"}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-violet-50"
            style={{ color: "#6B7280", fontSize: 20, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {block.whatsapp && (
            <p
              role="alert"
              className="text-sm px-4 py-3 rounded-xl border"
              style={{ background: "#FFF1F2", color: "#9F1239", borderColor: "#FECDD3", fontWeight: 600 }}
            >
              ⛔ {block.label}: {contact.full_name} pidió no recibir más mensajes. No se le puede escribir por WhatsApp desde el CRM
              hasta que vuelva a dar su consentimiento (se registra en su ficha → Marketing).
            </p>
          )}
          {sampleContact && (
            <SampleNotice>
              Es un contacto de ejemplo: su teléfono es inventado. WhatsApp se va a abrir sin destinatario para que
              pruebes el mensaje sin escribirle a nadie real.
            </SampleNotice>
          )}
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTemplate(t);
                  setEdited(false);
                  if (t === "informe" && !owned.some((p) => p.id === propertyId)) setPropertyId(owned[0]?.id ?? "");
                  if (t === "propiedad" && !options.some((o) => o.property.id === propertyId))
                    setPropertyId(options[0]?.property.id ?? "");
                }}
                className="text-xs px-3.5 py-2 rounded-xl border transition-all"
                style={
                  t === template
                    ? { background: "#1A1A1A", color: "white", borderColor: "transparent", fontWeight: 600 }
                    : { background: "white", color: "#6B7280", borderColor: "#E9E5DE", fontWeight: 500 }
                }
              >
                {TEMPLATE_LABEL[t]}
              </button>
            ))}
          </div>

          {template === "informe" && owned.length > 1 && (
            <label className="block">
              <span className="block text-xs mb-1.5" style={{ color: "#6B7280", fontWeight: 600 }}>
                Propiedad
              </span>
              <select
                value={propertyId}
                onChange={(e) => {
                  setPropertyId(e.target.value);
                  setEdited(false);
                }}
                className="w-full px-4 py-2.5 rounded-xl text-sm border outline-none bg-white text-[#1A1A1A] border-[#E9E5DE] focus:border-[#9B21FF] focus:ring-4 focus:ring-[#E9E5DE]"
              >
                {owned.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
          )}

          {template === "propiedad" && (
            <label className="block">
              <span className="block text-xs mb-1.5" style={{ color: "#6B7280", fontWeight: 600 }}>
                Propiedad
              </span>
              <select
                value={propertyId}
                onChange={(e) => {
                  setPropertyId(e.target.value);
                  setEdited(false);
                }}
                className="w-full px-4 py-2.5 rounded-xl text-sm border outline-none bg-white text-[#1A1A1A] border-[#E9E5DE] focus:border-[#9B21FF] focus:ring-4 focus:ring-[#E9E5DE]"
              >
                {options.map(({ property: p, score }) => (
                  <option key={p.id} value={p.id}>
                    {score !== null ? `${Math.round(score)}% · ` : ""}
                    {p.title}
                  </option>
                ))}
              </select>
              {skippedPhotos > 0 && (
                <span className="block text-xs mt-1.5" style={{ color: "#B45309" }}>
                  {skippedPhotos === 1 ? "1 foto subida desde la compu no" : `${skippedPhotos} fotos subidas desde la compu no`}{" "}
                  entra en la ficha hasta que el CRM tenga servidor de fotos.
                </span>
              )}
            </label>
          )}

          <label className="block">
            <span className="block text-xs mb-1.5" style={{ color: "#6B7280", fontWeight: 600 }}>
              Mensaje
            </span>
            <textarea
              value={text}
              onChange={(e) => {
                setEdited(true);
                setText(e.target.value);
              }}
              rows={9}
              className="w-full px-4 py-3 rounded-xl text-sm border outline-none resize-none bg-[#F0FDF4] text-[#1A1A1A] border-[#BBF7D0] focus:border-[#25D366] focus:ring-4 focus:ring-[#DCFCE7]"
              style={{ lineHeight: 1.5 }}
            />
          </label>
        </div>

        <div className="px-6 py-4 border-t flex items-center justify-end gap-3" style={{ borderColor: "#E9E5DE", background: "#FAF8F5" }}>
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-sm border transition-all hover:bg-violet-50"
            style={{ borderColor: "#E9E5DE", color: "#6B7280", fontWeight: 600, background: "white" }}
          >
            Cancelar
          </button>
          <button
            onClick={send}
            disabled={!text.trim() || waitingLink || block.whatsapp}
            title={block.whatsapp ? "No contactar: pidió no recibir más mensajes" : undefined}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm text-[#063B2A] transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
            style={{ background: WA_GREEN, fontWeight: 700 }}
          >
            <WhatsAppIcon size={15} color="#063B2A" />
            {waitingLink ? "Armando ficha…" : "Abrir WhatsApp"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Botón verde reutilizable. */
export function WhatsAppButton({
  onClick,
  label = "WhatsApp",
  compact = false,
}: {
  onClick: () => void;
  label?: string;
  compact?: boolean;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex items-center justify-center gap-2 rounded-xl text-sm text-[#063B2A] transition-all hover:opacity-90 active:scale-95 ${
        compact ? "w-11 h-11 sm:w-9 sm:h-9" : "px-4 py-2"
      }`}
      style={{ background: WA_GREEN, fontWeight: 600 }}
      aria-label={compact ? label : undefined}
      title={compact ? label : undefined}
    >
      <WhatsAppIcon size={compact ? 16 : 14} color="#063B2A" />
      {!compact && label}
    </button>
  );
}
