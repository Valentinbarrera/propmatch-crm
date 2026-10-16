import { useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { money, PROPERTY_TYPE_LABEL } from "@/lib/format";
import { estimatePrice, MIN_MARKET_SAMPLE, type ValuationInput } from "@/lib/market";
import { formatPct, type MarketListing, type PropertyDiagnostic } from "@/lib/propertyDiagnostic";
import type { OperationType, Property, PropertyType } from "@/types/db";
import { RangeBar } from "@/features/propiedades/diagnostico/RangeBar";
import { ComparablesList } from "@/features/propiedades/diagnostico/ComparablesList";
import { BlockTitle, Disclosure, Metric, ToneChip } from "@/features/propiedades/diagnostico/ui";

const CONFIDENCE_TONE = { alta: "verde", media: "amarillo", baja: "rojo", sin_datos: "sin_datos" } as const;
const TYPES = Object.keys(PROPERTY_TYPE_LABEL) as PropertyType[];
const OPERATIONS: { value: OperationType; label: string }[] = [
  { value: "venta", label: "Venta" },
  { value: "alquiler", label: "Alquiler" },
];

const fieldClass =
  "w-full px-3 min-h-11 py-2 rounded-xl text-sm border outline-none transition-all bg-white " +
  "text-[#1A1A1A] border-[#E9E5DE] focus:border-[#9B21FF] focus:ring-4 focus:ring-[#E9E5DE]";

interface FormState {
  operation: OperationType;
  type: PropertyType;
  zone: string;
  rooms: string;
  bedrooms: string;
  surface: string;
}

const toNum = (v: string): number | null => {
  const n = Number(v.replace(",", "."));
  return v.trim() && Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * "¿Cuánto pedir?": precio sugerido para una propiedad que todavía no está
 * cargada. Usa el mismo cálculo que el diagnóstico de la ficha.
 */
export function Tasador({
  zones,
  inventory,
  appListings,
  agencyId,
}: {
  zones: string[];
  inventory: Property[];
  appListings: MarketListing[] | null;
  agencyId: string;
}) {
  const ids = useId();
  const [form, setForm] = useState<FormState>({
    operation: "venta",
    type: "departamento",
    zone: zones[0] ?? "",
    rooms: "3",
    bedrooms: "",
    surface: "",
  });
  const [submitted, setSubmitted] = useState<ValuationInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Se recalcula si cambia el inventario o llega el mercado de la app.
  const result = useMemo(
    () => (submitted ? estimatePrice(submitted, { inventory, appListings, agencyId }) : null),
    [submitted, inventory, appListings, agencyId],
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.zone.trim()) {
      setError("Elegí una zona.");
      return;
    }
    setError(null);
    const rooms = toNum(form.rooms);
    setSubmitted({
      operation: form.operation,
      type: form.type,
      zone: form.zone.trim(),
      rooms: rooms != null ? Math.round(rooms) : null,
      bedrooms: toNum(form.bedrooms),
      surface: toNum(form.surface),
    });
  }

  return (
    <section aria-labelledby="tasador-title">
      <Card>
        <div className="px-5 py-4 border-b" style={{ borderColor: "#F0EDE6", background: "var(--gradient-soft)" }}>
          <h2 id="tasador-title" className="text-base" style={{ color: "#1A1A1A", fontWeight: 800 }}>
            ¿Cuánto pedir?
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
            Tasador rápido: precio sugerido y rango competitivo a partir de propiedades similares activas, en USD.
          </p>
        </div>

        <form onSubmit={onSubmit} className="p-5 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 items-end" noValidate>
          <fieldset className="lg:col-span-2 min-w-0">
            <legend className="text-xs mb-1.5" style={{ color: "#6B7280", fontWeight: 700 }}>
              Operación
            </legend>
            <div className="flex gap-1 p-1 rounded-xl" style={{ background: "#F7F0FF" }}>
              {OPERATIONS.map((o) => {
                const active = form.operation === o.value;
                return (
                  <label
                    key={o.value}
                    className="flex-1 min-h-9 flex items-center justify-center rounded-lg text-sm cursor-pointer transition-all has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[#9B21FF]"
                    style={
                      active
                        ? { background: "var(--gradient-brand)", color: "white", fontWeight: 600 }
                        : { color: "#6B7280", fontWeight: 500 }
                    }
                  >
                    <input
                      type="radio"
                      name={`${ids}-op`}
                      value={o.value}
                      checked={active}
                      onChange={() => set("operation", o.value)}
                      className="sr-only"
                    />
                    {o.label}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <Field label="Tipo" htmlFor={`${ids}-type`} className="lg:col-span-2">
            <select id={`${ids}-type`} value={form.type} onChange={(e) => set("type", e.target.value as PropertyType)} className={fieldClass}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {PROPERTY_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Zona / barrio" htmlFor={`${ids}-zone`} className="lg:col-span-2" error={error}>
            <select
              id={`${ids}-zone`}
              value={form.zone}
              onChange={(e) => set("zone", e.target.value)}
              className={fieldClass}
              aria-invalid={!!error}
              aria-describedby={error ? `${ids}-zone-err` : undefined}
            >
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Ambientes" htmlFor={`${ids}-rooms`} className="lg:col-span-1">
            <input id={`${ids}-rooms`} type="number" inputMode="numeric" min={1} max={20} value={form.rooms} onChange={(e) => set("rooms", e.target.value)} className={fieldClass} />
          </Field>
          <Field label="Dormitorios (opcional)" htmlFor={`${ids}-bed`} className="lg:col-span-1">
            <input id={`${ids}-bed`} type="number" inputMode="numeric" min={0} max={20} value={form.bedrooms} onChange={(e) => set("bedrooms", e.target.value)} className={fieldClass} />
          </Field>
          <Field label="Superficie m² (opcional)" htmlFor={`${ids}-m2`} className="lg:col-span-2">
            <input id={`${ids}-m2`} type="number" inputMode="decimal" min={1} value={form.surface} onChange={(e) => set("surface", e.target.value)} className={fieldClass} />
          </Field>
          <div className="lg:col-span-2 flex flex-col gap-1">
            <span className="text-xs" style={{ color: "#6B7280", fontWeight: 700 }}>
              Moneda
            </span>
            <span className="min-h-11 flex items-center text-sm" style={{ color: "#374151" }}>
              USD (la app publica solo en USD)
            </span>
          </div>
          <div className="sm:col-span-2 lg:col-span-6">
            <button
              type="submit"
              className="min-h-11 w-full sm:w-auto px-6 rounded-xl text-sm text-white transition-all hover:opacity-90 active:scale-95"
              style={{ background: "var(--gradient-brand)", fontWeight: 700, boxShadow: "var(--shadow-cta)" }}
            >
              Estimar precio
            </button>
          </div>
        </form>

        <div aria-live="polite">
          {result && submitted && <Result d={result} input={submitted} />}
        </div>
      </Card>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  className = "",
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  className?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1 min-w-0 ${className}`}>
      <label htmlFor={htmlFor} className="text-xs" style={{ color: "#6B7280", fontWeight: 700 }}>
        {label}
      </label>
      {children}
      {error && (
        <p id={`${htmlFor}-err`} className="text-xs" style={{ color: "#BE123C", fontWeight: 600 }}>
          {error}
        </p>
      )}
    </div>
  );
}

function Result({ d, input }: { d: PropertyDiagnostic; input: ValuationInput }) {
  const { price } = d;
  const n = d.comparables.length;
  const summary = [
    input.operation === "venta" ? "Venta" : "Alquiler",
    PROPERTY_TYPE_LABEL[input.type],
    input.zone,
    input.rooms != null ? `${input.rooms} amb.` : null,
    input.bedrooms != null ? `${input.bedrooms} dorm.` : null,
    input.surface != null ? `${input.surface} m²` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="px-5 pb-5 pt-1 space-y-6 border-t" style={{ borderColor: "#F0EDE6" }}>
      <p className="text-xs pt-4" style={{ color: "#6B7280" }}>
        Estimación para: <strong style={{ color: "#1A1A1A" }}>{summary}</strong>
        {input.operation === "alquiler" && " (precio mensual)"}
      </p>

      {d.level && d.level !== "zona_tipo" && n > 0 && (
        <p role="note" className="rounded-xl px-4 py-3 text-sm border" style={{ background: "#FFFBEB", borderColor: "#FDE68A", color: "#92400E" }}>
          {d.level === "zona"
            ? `No hubo ${MIN_MARKET_SAMPLE} similares del mismo tipo en ${input.zone}: se usaron propiedades de la zona de cualquier tipo.`
            : `No hubo ${MIN_MARKET_SAMPLE} similares en ${input.zone}: se usaron propiedades del mismo tipo («${PROPERTY_TYPE_LABEL[input.type]}») de otras zonas. Tomalo como referencia general, no como precio de la zona.`}
        </p>
      )}

      {price.showRange ? (
        <div className="grid gap-4 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)] items-stretch">
          <div className="rounded-2xl p-4 flex flex-col justify-center" style={{ background: "#FAF8F5", border: "1px solid #E9E5DE" }}>
            <p className="text-xs" style={{ color: "#6B7280", fontWeight: 700 }}>
              Precio sugerido
            </p>
            <p className="text-4xl tracking-tight text-gradient-brand mt-1" style={{ fontWeight: 800 }}>
              {money(price.suggested, "USD")}
            </p>
            <p className="text-xs mt-1" style={{ color: "#6B7280" }}>
              {price.roomsAdjustment != null
                ? price.roomsAdjustment === 0
                  ? `Mediana de comparables, sin ajuste (misma cantidad de ambientes que la mediana: ${price.medianRooms}).`
                  : `Mediana de comparables ${formatPct(price.roomsAdjustment)} por ambientes (mediana de ${price.medianRooms} amb.).`
                : "Mediana de comparables, sin ajuste (faltan ambientes)."}
            </p>
          </div>
          <div className="space-y-3 min-w-0">
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
              <Metric label="Rango competitivo (P25–P75)" value={`${money(price.p25, "USD")} – ${money(price.p75, "USD")}`} hint={`Mediana ${money(price.median, "USD")}`} />
              <Metric
                label={d.level === "tipo" ? "USD/m² de los comparables" : "USD/m² de la zona"}
                value={price.zonePricePerM2 != null ? money(price.zonePricePerM2, "USD") : null}
                hint={`Mediana de ${price.zonePricePerM2Count} comparables con m²`}
                missingReason={`Solo ${price.zonePricePerM2Count} comparables tienen m² (hacen falta 3; la app no guarda m²).`}
              />
              <Metric label="Comparables" value={String(n)} hint={d.levelLabel} />
            </div>
            <div className="flex flex-wrap gap-2">
              <ToneChip tone={CONFIDENCE_TONE[d.confidence]}>
                Basado en {n} {n === 1 ? "comparable" : "comparables"} · {d.confidenceLabel}
              </ToneChip>
              <SourceChip crm={d.sources.crm} app={d.sources.app} />
            </div>
          </div>
        </div>
      ) : (
        <div role="status" className="rounded-xl px-4 py-3" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
          <p className="text-sm" style={{ color: "#334155", fontWeight: 700 }}>
            Pocos comparables para estimar un rango
          </p>
          <p className="text-xs mt-1" style={{ color: "#475569" }}>
            {n === 0
              ? "No hay propiedades similares activas en USD, ni en la zona ni del mismo tipo."
              : `Hay ${n} ${n === 1 ? "similar" : "similares"}; hacen falta al menos 3 para dar un precio sugerido. Mejor tasar con visita y más referencias.`}
          </p>
        </div>
      )}

      {price.showRange && (
        <div className="rounded-xl p-4" style={{ border: "1px solid #F0EDE6" }}>
          <RangeBar price={price} />
        </div>
      )}

      {n > 0 && (
        <div>
          <BlockTitle>Comparables usados</BlockTitle>
          <ComparablesList
            comparables={d.comparables}
            diffNote={
              price.suggested != null
                ? "«Dif.» = cuánto más caro (+) o más barato (−) es cada comparable que el precio sugerido."
                : "Sin precio sugerido no se calcula «Dif.»."
            }
          />
        </div>
      )}

      <Disclosure title="¿Cómo se calcula?">
        <ul className="text-sm space-y-2 list-disc pl-5" style={{ color: "#374151" }}>
          <li>
            Comparables: propiedades activas de la misma operación y en USD — tu inventario disponible y, con sesión, las activas de la
            app PropMatch. Se piden parecidas en tamaño (±1 ambiente; ±25 % de m² si cargaste superficie).
          </li>
          <li>
            Se busca primero en <strong>misma zona y tipo</strong>; si no hay 3, en <strong>misma zona</strong>; si tampoco, en{" "}
            <strong>mismo tipo</strong>. Ahora: {d.countsByLevel.zona_tipo} en zona y tipo, {d.countsByLevel.zona} en la zona,{" "}
            {d.countsByLevel.tipo} del tipo.
          </li>
          <li>
            Rango competitivo = percentiles 25 y 75 de los precios. Precio sugerido = mediana, ajustada 6 % por cada ambiente de diferencia con
            la mediana de ambientes de los comparables (tope ±18 %). Es el mismo criterio que usa la app PropMatch.
          </li>
          <li>Confianza alta: 8 o más comparables de misma zona y tipo. Con menos de 3 no se muestra rango ni sugerido.</li>
          <li>USD/m² de la zona: mediana entre comparables con superficie (la app no guarda m²), solo con 3 o más.</li>
          <li>Los dormitorios quedan como referencia: el criterio ajusta por ambientes, como la app.</li>
          {d.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </Disclosure>
    </div>
  );
}

export function SourceChip({ crm, app }: { crm: number; app: number }) {
  return (
    <span
      className="inline-flex items-center text-xs px-2.5 py-1 rounded-full border whitespace-nowrap"
      style={{ background: "#F7F0FF", color: "#7C0BD8", borderColor: "#DDD8CF", fontWeight: 700 }}
    >
      Fuente: {crm} de tu inventario · {app} de la app
    </span>
  );
}
