import { useEffect, useMemo, useState } from "react";
import { useStore, STAGE_LABEL, type NewOpportunityInput } from "@/data/store";
import { OpportunitiesIcon, MatchesSolidIcon } from "@/components/ui/icons";
import { money } from "@/lib/format";
import type { CurrencyCode, OpportunityStage } from "@/types/db";

/**
 * Alta manual de una oportunidad.
 *
 * El camino principal sigue siendo convertir un match (ahí el score ya está
 * calculado), pero el agente también levanta el teléfono y arranca una
 * operación que el sistema todavía no vio. Al elegir contacto y propiedad se
 * muestra el score que tendría ese par, para que el alta a mano no quede
 * ciega respecto del matching.
 */

const STAGES: OpportunityStage[] = ["nuevos", "contactados", "visita", "negociacion", "cierre"];

export function OpportunityFormModal({
  stage: initialStage = "nuevos",
  onClose,
}: {
  /** Etapa preseleccionada: al crear desde una columna del kanban. */
  stage?: OpportunityStage;
  onClose: () => void;
}) {
  const { addOpportunity, contacts, properties, profiles, profile, matches, opportunities } =
    useStore();

  const [contactId, setContactId] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [stage, setStage] = useState<OpportunityStage>(initialStage);
  const [value, setValue] = useState<number | null>(null);
  const [valueTouched, setValueTouched] = useState(false);
  const [currency, setCurrency] = useState<CurrencyCode>("USD");
  const [ownerId, setOwnerId] = useState(profile.id);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const property = properties.find((p) => p.id === propertyId);

  /** El precio de la propiedad es el valor por defecto, hasta que lo pisen. */
  const effectiveValue = valueTouched ? value : (property?.price ?? null);
  const effectiveCurrency = valueTouched ? currency : (property?.currency ?? currency);

  const contactOptions = useMemo(
    () => [...contacts].sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [contacts],
  );

  /** Con un contacto elegido, primero las propiedades que ya le hacen match. */
  const propertyOptions = useMemo(() => {
    const scoreOf = new Map(
      matches.filter((m) => m.contact_id === contactId).map((m) => [m.property_id, m.score]),
    );
    return [...properties]
      .map((p) => ({ property: p, score: scoreOf.get(p.id) ?? null }))
      .sort((a, b) => {
        if ((b.score ?? -1) !== (a.score ?? -1)) return (b.score ?? -1) - (a.score ?? -1);
        const rank = (s: string) => (s === "disponible" ? 0 : 1);
        return rank(a.property.status) - rank(b.property.status) ||
          a.property.title.localeCompare(b.property.title);
      });
  }, [properties, matches, contactId]);

  const pairScore =
    contactId && propertyId
      ? (matches.find((m) => m.contact_id === contactId && m.property_id === propertyId)?.score ??
        null)
      : null;

  /** Ya existe una operación abierta para ese par: duplicarla ensucia el pipeline. */
  const duplicate =
    contactId && propertyId
      ? opportunities.find(
          (o) => o.contact_id === contactId && o.property_id === propertyId && o.stage !== "perdida",
        )
      : undefined;

  function handleSave() {
    const e: Record<string, string> = {};
    if (!contactId) e.contact = "Elegí un contacto";
    if (duplicate) e.property = `Ya hay una oportunidad en ${STAGE_LABEL[duplicate.stage]}`;
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    const input: NewOpportunityInput = {
      contact_id: contactId,
      property_id: propertyId || null,
      stage,
      value: effectiveValue,
      currency: effectiveCurrency,
      owner_id: ownerId,
    };
    addOpportunity(input);
    onClose();
  }

  return (
    <div
      className="pm-backdrop fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(8, 11, 31,0.35)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Nueva oportunidad"
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
            <OpportunitiesIcon size={18} color="white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-lg tracking-tight" style={{ color: "#1A1A1A", fontWeight: 800 }}>
              Nueva oportunidad
            </p>
            <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
              Entra al pipeline en {STAGE_LABEL[stage]}.
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
            <SectionLabel>Quién y qué</SectionLabel>
            <div className="grid gap-4">
              <Field label="Contacto" error={errors.contact}>
                <select
                  value={contactId}
                  onChange={(e) => setContactId(e.target.value)}
                  className={selectClass(!!errors.contact)}
                  autoFocus
                >
                  <option value="">Elegí un contacto…</option>
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
                  className={selectClass(!!errors.property)}
                >
                  <option value="">Sin definir todavía</option>
                  {propertyOptions.map(({ property: p, score }) => (
                    <option key={p.id} value={p.id}>
                      {score !== null ? `${score}% · ` : ""}
                      {p.title}
                      {p.status !== "disponible" ? ` (${p.status})` : ""}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {pairScore !== null && (
              <div
                className="flex items-center gap-2 mt-3 px-3.5 py-2.5 rounded-xl"
                style={{ background: "#F7F0FF" }}
              >
                <MatchesSolidIcon size={12} color="#9B21FF" />
                <p className="text-xs" style={{ color: "#7C0BD8" }}>
                  Este par ya tiene <strong>{pairScore}% de match</strong> según lo que busca el
                  contacto.
                </p>
              </div>
            )}
          </div>

          <div>
            <SectionLabel>Etapa</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {STAGES.map((s) => {
                const active = s === stage;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStage(s)}
                    className="text-xs px-3.5 py-2 rounded-xl transition-all border"
                    style={
                      active
                        ? {
                            background: "var(--gradient-brand)",
                            color: "white",
                            borderColor: "transparent",
                            fontWeight: 600,
                          }
                        : { background: "white", color: "#6B7280", borderColor: "#E9E5DE", fontWeight: 500 }
                    }
                  >
                    {STAGE_LABEL[s]}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <SectionLabel>Valor de la operación</SectionLabel>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <Field label="Monto">
                  <input
                    value={effectiveValue === null ? "" : effectiveValue.toLocaleString("es-AR")}
                    onChange={(e) => {
                      setValueTouched(true);
                      setValue(toNumber(e.target.value));
                    }}
                    placeholder="185.000"
                    inputMode="numeric"
                    className={inputClass}
                  />
                </Field>
              </div>
              <Field label="Moneda">
                <select
                  value={effectiveCurrency}
                  onChange={(e) => {
                    setValueTouched(true);
                    if (value === null) setValue(property?.price ?? null);
                    setCurrency(e.target.value as CurrencyCode);
                  }}
                  className={selectClass(false)}
                >
                  <option value="USD">USD</option>
                  <option value="ARS">ARS</option>
                </select>
              </Field>
            </div>
            {property?.price != null && !valueTouched && (
              <p className="text-xs mt-2" style={{ color: "#6B7280" }}>
                Tomado del precio publicado: {money(property.price, property.currency)}
              </p>
            )}
          </div>

          <div>
            <SectionLabel>Responsable</SectionLabel>
            <Field label="Agente a cargo">
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className={selectClass(false)}
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        {/* Pie */}
        <div
          className="px-6 py-4 border-t flex items-center justify-end gap-3 flex-shrink-0"
          style={{ borderColor: "#E9E5DE", background: "#FAF8F5" }}
        >
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
            Crear oportunidad
          </button>
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

const inputClass =
  "w-full px-4 py-2.5 rounded-xl text-sm border outline-none transition-all bg-white " +
  "text-[#1A1A1A] placeholder:text-[#6B7280] focus:ring-4 focus:ring-[#E9E5DE] " +
  "border-[#E9E5DE] focus:border-[#9B21FF]";

const selectClass = (hasError: boolean) =>
  "w-full px-4 py-2.5 rounded-xl text-sm border outline-none transition-all bg-white " +
  "text-[#1A1A1A] focus:ring-4 focus:ring-[#E9E5DE] " +
  (hasError ? "border-[#FECDD3] focus:border-[#FB7185]" : "border-[#E9E5DE] focus:border-[#9B21FF]");

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
