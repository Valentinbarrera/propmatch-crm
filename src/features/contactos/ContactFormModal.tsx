import { useEffect, useState } from "react";
import { useStore, type NewContactInput, type RequirementInput } from "@/data/store";
import { FEATURE_CHIPS, ZONES } from "@/data/seed";
import { CheckIcon, ContactsIcon, MatchesSolidIcon } from "@/components/ui/icons";
import { computeMatch, MATCH_THRESHOLD } from "@/lib/matching";
import { CONTACT_STATUS_LABEL, PROPERTY_TYPE_LABEL } from "@/lib/format";
import { DictarButton } from "@/features/voz/DictarButton";
import { applyBusquedaToRequirement, busquedaNotes } from "@/lib/voz/apply";
import type { VozData } from "../../../shared/voz";
import type {
  ClientProfile,
  Contact,
  ContactKind,
  ContactStatus,
  CurrencyCode,
  OperationType,
  PropertyType,
} from "@/types/db";

/**
 * Alta y edición de un contacto junto con lo que busca.
 *
 * Van en el mismo formulario a propósito: un contacto sin criterios de búsqueda
 * no genera ningún match, así que separarlos en dos pasos deja al CRM a media
 * máquina sin que el agente se entere.
 */

const KINDS: { value: ContactKind; label: string }[] = [
  { value: "comprador", label: "Comprador" },
  { value: "inquilino", label: "Inquilino" },
  { value: "propietario", label: "Propietario" },
  { value: "inversor", label: "Inversor" },
  { value: "otro", label: "Otro" },
];

const STATUSES = Object.keys(CONTACT_STATUS_LABEL) as ContactStatus[];
const PROP_TYPES = Object.keys(PROPERTY_TYPE_LABEL) as PropertyType[];

const PROFILES: { value: ClientProfile; label: string }[] = [
  { value: "familia", label: "Familia" },
  { value: "primera_vivienda", label: "Primera vivienda" },
  { value: "inversor", label: "Inversor" },
  { value: "profesional", label: "Profesional" },
  { value: "estudiante", label: "Estudiante" },
];

const OPERATIONS: { value: OperationType; label: string }[] = [
  { value: "venta", label: "Compra" },
  { value: "alquiler", label: "Alquiler" },
  { value: "alquiler_temporal", label: "Temporal" },
];

const emptyRequirement = (): RequirementInput => ({
  label: null,
  operation: "venta",
  property_types: [],
  zones: [],
  budget_min: null,
  budget_max: null,
  currency: "USD",
  bedrooms_min: null,
  bathrooms_min: null,
  surface_min: null,
  surface_max: null,
  features: [],
});

export function ContactFormModal({
  contact,
  onClose,
  onSaved,
  vozPrefill,
}: {
  /** `undefined` = alta. Con contacto = edición. */
  contact?: Contact;
  onClose: () => void;
  onSaved?: (contactId: string) => void;
  /** Búsqueda dictada (carga por voz) para precargar. No guarda: se revisa y se guarda acá. */
  vozPrefill?: VozData | null;
}) {
  const { addContact, updateContact, saveRequirement, requirementOf, properties, profiles } =
    useStore();

  const existing = contact ? requirementOf(contact.id) : undefined;

  const [fullName, setFullName] = useState(contact?.full_name ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [kind, setKind] = useState<ContactKind>(contact?.kind ?? "comprador");
  const [status, setStatus] = useState<ContactStatus>(contact?.status ?? "nuevo");
  const [profileType, setProfileType] = useState<ClientProfile | null>(contact?.profile_type ?? null);
  const [ownerId, setOwnerId] = useState(contact?.owner_id ?? profiles[0].id);
  const [notes, setNotes] = useState(contact?.notes ?? "");

  const [req, setReq] = useState<RequirementInput>(() =>
    existing
      ? {
          label: existing.label,
          operation: existing.operation,
          property_types: existing.property_types,
          zones: existing.zones,
          budget_min: existing.budget_min,
          budget_max: existing.budget_max,
          currency: existing.currency,
          bedrooms_min: existing.bedrooms_min,
          bathrooms_min: existing.bathrooms_min,
          surface_min: existing.surface_min,
          surface_max: existing.surface_max,
          features: existing.features,
        }
      : emptyRequirement(),
  );

  const [errors, setErrors] = useState<Record<string, string>>({});

  /** Carga por voz: completa lo detectado; nombre y teléfono solo si estaban vacíos. */
  function applyVoz(r: VozData) {
    if (r.kind !== "busqueda") return;
    const d = r.data;
    if (d.contact_name) setFullName((v) => (v.trim() ? v : d.contact_name!));
    if (d.contact_phone) setPhone((v) => (v.trim() ? v : d.contact_phone!));
    if (!contact && d.operation && d.operation !== "venta") setKind((k) => (k === "comprador" ? "inquilino" : k));
    setReq((prev) => applyBusquedaToRequirement(prev, d));
    const extra = busquedaNotes(d);
    if (extra) setNotes((n) => (n.includes(extra) ? n : n.trim() ? `${n.trim()}\n${extra}` : extra));
  }

  useEffect(() => {
    if (vozPrefill) applyVoz(vozPrefill);
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cerrar con Escape, como cualquier modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** Vista previa: contra cuántas propiedades de la cartera daría match. */
  const preview = (() => {
    if (req.budget_max === null && req.budget_min === null) return null;
    const scores = properties
      .filter((p) => p.status === "disponible" && p.operation === req.operation)
      .map(
        (p) =>
          computeMatch(
            {
              id: "draft",
              agency_id: "",
              contact_id: "draft",
              rooms_min: null,
              is_active: true,
              created_at: "",
              updated_at: "",
              ...req,
            },
            p,
          ).score,
      )
      .filter((s) => s >= MATCH_THRESHOLD);
    return { count: scores.length, best: scores.length ? Math.max(...scores) : 0 };
  })();

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!fullName.trim()) e.fullName = "El nombre es obligatorio";
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "El email no parece válido";
    if (req.budget_min !== null && req.budget_max !== null && req.budget_min > req.budget_max) {
      e.budget = "El mínimo no puede ser mayor que el máximo";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const hasRequirement =
    req.property_types.length > 0 ||
    req.zones.length > 0 ||
    req.budget_min !== null ||
    req.budget_max !== null;

  function handleSave() {
    if (!validate()) return;

    if (contact) {
      updateContact(contact.id, {
        full_name: fullName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        kind,
        status,
        profile_type: profileType,
        owner_id: ownerId,
        notes: notes.trim() || null,
      });
      if (hasRequirement) saveRequirement(contact.id, req);
      onSaved?.(contact.id);
    } else {
      const input: NewContactInput = {
        full_name: fullName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        kind,
        status,
        profile_type: profileType,
        notes: notes.trim() || null,
        owner_id: ownerId,
        requirement: hasRequirement ? req : null,
      };
      const created = addContact(input);
      onSaved?.(created.id);
    }
    onClose();
  }

  const set = <K extends keyof RequirementInput>(key: K, value: RequirementInput[K]) =>
    setReq((prev) => ({ ...prev, [key]: value }));

  const toggleIn = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  return (
    <div
      className="pm-backdrop fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(8, 11, 31,0.35)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={contact ? "Editar contacto" : "Nuevo contacto"}
    >
      <div
        className="pm-modal rounded-2xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden"
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
            <ContactsIcon size={18} color="white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-lg tracking-tight" style={{ color: "#1A1A1A", fontWeight: 800 }}>
              {contact ? "Editar contacto" : "Nuevo contacto"}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
              Cargá quién es y qué busca. Con eso el sistema le encuentra propiedades solo.
            </p>
          </div>
          <DictarButton kind="busqueda" onApply={applyVoz} />
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
          {/* Datos */}
          <div>
            <SectionLabel>Datos del contacto</SectionLabel>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre y apellido" error={errors.fullName}>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Martín Rodríguez"
                  className={inputClass(!!errors.fullName)}
                  autoFocus
                />
              </Field>
              <Field label="Teléfono">
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+54 221 444 5566"
                  className={inputClass(false)}
                />
              </Field>
              <Field label="Email" error={errors.email}>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="martin@email.com"
                  className={inputClass(!!errors.email)}
                />
              </Field>
              <Field label="Agente asignado">
                <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={selectClass}>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tipo de contacto">
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as ContactKind)}
                  className={selectClass}
                >
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Estado">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ContactStatus)}
                  className={selectClass}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {CONTACT_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="mt-4">
              <Field label="Perfil">
                <div className="flex flex-wrap gap-2">
                  {PROFILES.map((p) => (
                    <Chip
                      key={p.value}
                      label={p.label}
                      active={profileType === p.value}
                      onClick={() => setProfileType(profileType === p.value ? null : p.value)}
                    />
                  ))}
                </div>
              </Field>
            </div>
          </div>

          <div className="h-px" style={{ background: "#F0EDE6" }} />

          {/* Búsqueda */}
          <div>
            <SectionLabel>
              Qué busca
              <span className="ml-2 text-xs" style={{ color: "#6B7280", fontWeight: 500 }}>
                — sin esto no se le calculan matches
              </span>
            </SectionLabel>

            <Field label="Operación">
              <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ background: "#F7F0FF" }}>
                {OPERATIONS.map((op) => (
                  <button
                    key={op.value}
                    type="button"
                    onClick={() => set("operation", op.value)}
                    className="px-4 py-1.5 rounded-lg text-sm transition-all"
                    style={
                      req.operation === op.value
                        ? {
                            background: "var(--gradient-brand)",
                            color: "white",
                            fontWeight: 600,
                            boxShadow: "0 2px 8px rgba(168, 85, 255,0.25)",
                          }
                        : { color: "#6B7280", fontWeight: 500 }
                    }
                  >
                    {op.label}
                  </button>
                ))}
              </div>
            </Field>

            <div className="mt-4">
              <Field label="Tipo de propiedad">
                <div className="flex flex-wrap gap-2">
                  {PROP_TYPES.map((t) => (
                    <Chip
                      key={t}
                      label={PROPERTY_TYPE_LABEL[t]}
                      active={req.property_types.includes(t)}
                      onClick={() => set("property_types", toggleIn(req.property_types, t))}
                    />
                  ))}
                </div>
              </Field>
            </div>

            <div className="mt-4">
              <Field label="Zonas de interés">
                <div className="flex flex-wrap gap-2">
                  {ZONES.map((z) => (
                    <Chip
                      key={z}
                      label={z}
                      active={req.zones.includes(z)}
                      onClick={() => set("zones", toggleIn(req.zones, z))}
                    />
                  ))}
                </div>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 mt-4">
              <Field label="Presupuesto mínimo" error={errors.budget}>
                <input
                  value={req.budget_min ?? ""}
                  onChange={(e) => set("budget_min", toNumber(e.target.value))}
                  inputMode="numeric"
                  placeholder="150000"
                  className={inputClass(!!errors.budget)}
                />
              </Field>
              <Field label="Presupuesto máximo">
                <input
                  value={req.budget_max ?? ""}
                  onChange={(e) => set("budget_max", toNumber(e.target.value))}
                  inputMode="numeric"
                  placeholder="200000"
                  className={inputClass(!!errors.budget)}
                />
              </Field>
              <Field label="Moneda">
                <select
                  value={req.currency}
                  onChange={(e) => set("currency", e.target.value as CurrencyCode)}
                  className={selectClass}
                >
                  <option value="USD">USD</option>
                  <option value="ARS">ARS</option>
                </select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-4 mt-4">
              <Field label="Dormitorios (mín.)">
                <input
                  value={req.bedrooms_min ?? ""}
                  onChange={(e) => set("bedrooms_min", toNumber(e.target.value))}
                  inputMode="numeric"
                  placeholder="3"
                  className={inputClass(false)}
                />
              </Field>
              <Field label="Baños (mín.)">
                <input
                  value={req.bathrooms_min ?? ""}
                  onChange={(e) => set("bathrooms_min", toNumber(e.target.value))}
                  inputMode="numeric"
                  placeholder="2"
                  className={inputClass(false)}
                />
              </Field>
              <Field label="Superficie desde (m²)">
                <input
                  value={req.surface_min ?? ""}
                  onChange={(e) => set("surface_min", toNumber(e.target.value))}
                  inputMode="numeric"
                  placeholder="150"
                  className={inputClass(false)}
                />
              </Field>
              <Field label="Superficie hasta (m²)">
                <input
                  value={req.surface_max ?? ""}
                  onChange={(e) => set("surface_max", toNumber(e.target.value))}
                  inputMode="numeric"
                  placeholder="300"
                  className={inputClass(false)}
                />
              </Field>
            </div>

            <div className="mt-4">
              <Field label="Características buscadas">
                <div className="flex flex-wrap gap-2">
                  {FEATURE_CHIPS.map((f) => (
                    <Chip
                      key={f}
                      label={f}
                      active={req.features.includes(f)}
                      onClick={() => set("features", toggleIn(req.features, f))}
                    />
                  ))}
                </div>
              </Field>
            </div>

            {/* Vista previa del matching, mientras se completa */}
            <div
              className="mt-5 rounded-xl p-4 flex items-center gap-3"
              style={{ background: "var(--gradient-soft)", border: "1px solid #E9E5DE" }}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: "var(--gradient-brand)" }}
              >
                <MatchesSolidIcon size={16} />
              </div>
              <div className="min-w-0">
                <p
                  className="text-xs uppercase"
                  style={{ color: "#6B7280", fontWeight: 700, letterSpacing: "0.08em" }}
                >
                  Propiedades compatibles
                </p>
                <p className="text-sm mt-0.5" style={{ color: "#1A1A1A", fontWeight: 600 }}>
                  {preview === null
                    ? "Cargá un presupuesto para calcular"
                    : preview.count === 0
                      ? "Ninguna de tu cartera encaja todavía"
                      : `${preview.count} ${preview.count === 1 ? "propiedad" : "propiedades"} · mejor compatibilidad ${preview.best}%`}
                </p>
              </div>
            </div>
          </div>

          <div className="h-px" style={{ background: "#F0EDE6" }} />

          <Field label="Notas">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Contexto útil: plazos, condiciones, lo que dijo en la última llamada…"
              className={`${inputClass(false)} resize-none`}
            />
          </Field>
        </div>

        {/* Pie */}
        <div
          className="px-6 py-4 border-t flex items-center justify-between gap-4 flex-shrink-0"
          style={{ borderColor: "#E9E5DE", background: "#FAF8F5" }}
        >
          <span className="text-xs" style={{ color: hasRequirement ? "#15803D" : "#B45309" }}>
            {hasRequirement ? (
              <span className="flex items-center gap-1.5">
                <CheckIcon size={11} color="#16A34A" />
                Con búsqueda cargada
              </span>
            ) : (
              "Sin búsqueda: no va a generar matches"
            )}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-sm border transition-all hover:border-violet-300"
              style={{ borderColor: "#E9E5DE", color: "#6B7280", fontWeight: 600, background: "white" }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2.5 rounded-xl text-sm text-white transition-all hover:opacity-90 active:scale-95"
              style={{ background: "var(--gradient-brand)", fontWeight: 600, boxShadow: "var(--shadow-cta)" }}
            >
              {contact ? "Guardar cambios" : "Crear contacto"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Piezas ──────────────────────────────────────────────────────────────── */

const toNumber = (v: string): number | null => {
  const digits = v.replace(/[^\d]/g, "");
  return digits === "" ? null : Number(digits);
};

const inputClass = (hasError: boolean) =>
  "w-full px-4 py-2.5 rounded-xl text-sm border outline-none transition-all bg-white " +
  "text-[#1A1A1A] placeholder:text-[#6B7280] focus:ring-4 focus:ring-[#E9E5DE] " +
  (hasError ? "border-[#FECDD3] focus:border-[#FB7185]" : "border-[#E9E5DE] focus:border-[#9B21FF]");

const selectClass =
  "w-full px-4 py-2.5 rounded-xl text-sm border outline-none transition-all bg-white " +
  "text-[#1A1A1A] border-[#E9E5DE] focus:border-[#9B21FF] focus:ring-4 focus:ring-[#E9E5DE]";

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

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs px-3 py-1.5 rounded-full transition-all border"
      style={
        active
          ? { background: "var(--gradient-brand)", color: "white", borderColor: "transparent", fontWeight: 600 }
          : { background: "white", color: "#6B7280", borderColor: "#E9E5DE", fontWeight: 500 }
      }
    >
      {active && "✓ "}
      {label}
    </button>
  );
}
