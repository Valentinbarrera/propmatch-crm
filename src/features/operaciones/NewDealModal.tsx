import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/data/store";
import { emptyParty } from "@/lib/deals";
import { dateInputFromNow } from "@/lib/authorization";
import type { Contact, DealKind, DealParty, Property } from "@/types/db";
import { Field, inputClass } from "./ui";

function partyFrom(contact: Contact | undefined): DealParty {
  return { ...emptyParty(), name: contact?.full_name ?? "", phone: contact?.phone ?? "", email: contact?.email ?? "" };
}

/**
 * Alta de una operación. Con la propiedad y el cliente elegidos se completa
 * todo lo que el CRM ya sabe (precio, propietario, comisión, teléfonos): el
 * agente solo agrega lo que falta, como el DNI.
 */
export function NewDealModal({
  initialPropertyId,
  initialContactId,
  onClose,
  onCreated,
}: {
  initialPropertyId?: string | null;
  initialContactId?: string | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { properties, contacts, opportunities, addDeal, contactById, propertyById, updateProperty } = useStore();

  const [propertyId, setPropertyId] = useState(initialPropertyId ?? "");
  const [clientId, setClientId] = useState(initialContactId ?? "");
  const [kind, setKind] = useState<DealKind>(() => {
    const p = propertyById(initialPropertyId);
    return p && p.operation !== "venta" ? "alquiler" : "venta";
  });
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sortedContacts = useMemo(() => [...contacts].sort((a, b) => a.full_name.localeCompare(b.full_name)), [contacts]);
  const sortedProperties = useMemo(() => [...properties].sort((a, b) => a.title.localeCompare(b.title)), [properties]);

  const pickProperty = (id: string) => {
    setPropertyId(id);
    const p = propertyById(id);
    if (p) setKind(p.operation === "venta" ? "venta" : "alquiler");
  };

  const submit = () => {
    const property: Property | undefined = propertyById(propertyId);
    if (!property) return setError("Elegí la propiedad de la operación.");
    if (!clientId) return setError(`Elegí ${kind === "venta" ? "el comprador" : "el inquilino"}.`);

    const client = contactById(clientId);
    const owner = contactById(property.owner_contact_id);
    const opp = opportunities.find(
      (o) => o.contact_id === clientId && o.property_id === property.id && o.stage !== "perdida",
    );

    const deal = addDeal({
      kind,
      status: "en_curso",
      opportunity_id: opp?.id ?? null,
      property_id: property.id,
      client_contact_id: clientId,
      owner_contact_id: owner?.id ?? null,
      client: partyFrom(client),
      owner: partyFrom(owner),
      guarantor: emptyParty(),
      price: property.price,
      currency: property.currency,
      commission_pct: property.commission_pct,
      reserva_amount: property.price !== null ? Math.round(property.price * (kind === "venta" ? 0.03 : 1)) : null,
      reserva_valid_until: dateInputFromNow(7),
      boleto_advance_pct: 30,
      escritura_date: null,
      escribano: "",
      contract_months: kind === "alquiler" ? 24 : null,
      start_date: null,
      deposit_months: kind === "alquiler" ? 1 : null,
      update_rule: "",
      destination: "vivienda",
      steps: {},
      docs: {},
      notes: "",
    });
    // La propiedad queda reservada mientras dure la operación (si se cae, vuelve a disponible).
    if (property.status === "disponible") updateProperty(property.id, { status: "reservada" });
    onCreated(deal.id);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(8, 11, 31,0.45)" }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl overflow-hidden">
        <div className="px-6 py-5 border-b flex items-center justify-between" style={{ borderColor: "#F0EDE6" }}>
          <p className="text-lg" style={{ color: "#1A1A1A", fontWeight: 800 }}>
            Nueva operación
          </p>
          <button onClick={onClose} aria-label="Cerrar" style={{ color: "#6B7280", fontSize: 22, lineHeight: 1 }}>
            ×
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <Field label="Propiedad">
            <select value={propertyId} onChange={(e) => pickProperty(e.target.value)} className={inputClass} autoFocus>
              <option value="">Elegí una propiedad…</option>
              {sortedProperties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </Field>

          <div>
            <span className="block text-xs mb-1.5" style={{ color: "#6B7280", fontWeight: 600 }}>
              Tipo de operación
            </span>
            <div className="flex gap-2">
              {(["venta", "alquiler"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className="flex-1 text-sm px-3 py-2.5 rounded-xl border transition-all"
                  style={
                    kind === k
                      ? { background: "var(--gradient-brand)", color: "white", borderColor: "transparent", fontWeight: 600 }
                      : { background: "white", color: "#6B7280", borderColor: "#E9E5DE", fontWeight: 500 }
                  }
                >
                  {k === "venta" ? "Venta" : "Alquiler"}
                </button>
              ))}
            </div>
          </div>

          <Field label={kind === "venta" ? "Comprador" : "Inquilino"}>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={inputClass}>
              <option value="">Elegí un contacto…</option>
              {sortedContacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
          </Field>

          {error && (
            <p className="text-xs" style={{ color: "#BE123C", fontWeight: 600 }}>
              {error}
            </p>
          )}
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-2" style={{ borderColor: "#F0EDE6" }}>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm border"
            style={{ borderColor: "#E9E5DE", color: "#6B7280", fontWeight: 600 }}
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            className="px-5 py-2.5 rounded-xl text-sm text-white"
            style={{ background: "var(--gradient-brand)", fontWeight: 600 }}
          >
            Crear operación
          </button>
        </div>
      </div>
    </div>
  );
}
