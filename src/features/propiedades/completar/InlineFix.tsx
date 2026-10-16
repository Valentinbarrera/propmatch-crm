/**
 * Lista de faltantes con su arreglo al lado: cada ítem que falta se completa
 * ahí mismo (mini editor inline que guarda con `updateProperty`) o, si no es
 * un dato de un input (fotos, autorización…), con un botón que lleva al
 * control exacto. Al guardar, la pantalla vuelve a validar sola porque todo
 * se calcula desde la propiedad del store.
 */

import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/data/store";
import { FEATURE_CHIPS } from "@/data/seed";
import { AlertTriangleIcon, CheckIcon } from "@/components/ui/icons";
import { isShortMapsLink, parseCoordinates } from "@/lib/geo";
import { DESCRIPTION_MIN, TITLE_MAX, TITLE_MIN } from "@/lib/listingDiagnostics";
import type { CurrencyCode, Property } from "@/types/db";
import { Chip, CounterHint, Field, MoneyField, Stepper, inputClass, selectClass } from "../subir/ui";
import { FIX_LABEL, LAYOUTS, ORIENTATIONS, type FieldKey, type FixKey } from "./fields";

/* ── Tipos ─────────────────────────────────────────────────────────────── */

export type Fix =
  /** Se edita ahí mismo. */
  | { kind: "field"; key: FieldKey }
  /** Lleva a otra pantalla, al control exacto. */
  | { kind: "link"; key: FixKey; label: string; to: string }
  /** Lleva a un control de esta misma pantalla. */
  | { kind: "action"; key: FixKey; label: string; onClick: () => void };

export type FixTone = "ok" | "block" | "warn" | "optional";

export interface FixItem {
  id: string;
  title: string;
  detail?: string;
  tone: FixTone;
  fixes: Fix[];
}

const TONE_ICON: Record<FixTone, { bg: string; border: string; color: string; sr: string }> = {
  ok: { bg: "#F0FDF4", border: "#BBF7D0", color: "#16A34A", sr: "cumple" },
  block: { bg: "#FFF1F2", border: "#FECDD3", color: "#E11D48", sr: "falta" },
  warn: { bg: "#FFFBEB", border: "#FDE68A", color: "#D97706", sr: "sugerencia" },
  optional: { bg: "#F7F0FF", border: "#E9E5DE", color: "#9B21FF", sr: "opcional" },
};

/* ── Lista ─────────────────────────────────────────────────────────────── */

export function FixList({
  property,
  items,
  onSaved,
  dense = false,
}: {
  property: Property;
  items: FixItem[];
  /** Después de guardar un campo (p. ej. para descartar la validación del servidor). */
  onSaved?: (key: FieldKey) => void;
  /** Filas más compactas (columna lateral). */
  dense?: boolean;
}) {
  /** Ítems que se arreglaron desde acá y ya no figuran: se muestran con ✓. */
  const [resolved, setResolved] = useState<{ id: string; title: string }[]>([]);
  const [announce, setAnnounce] = useState("");
  const present = new Set(items.map((i) => i.id));
  const done = resolved.filter((r) => !present.has(r.id));

  const handleSaved = (item: FixItem, key: FieldKey) => {
    setAnnounce(`${FIX_LABEL[key]} guardado.`);
    setResolved((prev) => (prev.some((r) => r.id === item.id) ? prev : [...prev, { id: item.id, title: item.title }]));
    onSaved?.(key);
  };

  return (
    <>
      <ul className="flex flex-col">
        {items.map((item) => (
          <FixRow key={item.id} item={item} property={property} dense={dense} onSaved={(k) => handleSaved(item, k)} />
        ))}
        {done.map((r) => (
          <li
            key={`ok-${r.id}`}
            className={`flex items-start gap-3 ${dense ? "py-2.5" : "py-3"} border-b last:border-b-0 border-divider-soft`}
          >
            <ToneDot tone="ok" />
            <p className="text-sm text-ink" style={{ fontWeight: 600 }}>
              {r.title}
              <span className="block text-xs" style={{ color: "#15803D", fontWeight: 600 }}>
                Listo: ya no falta.
              </span>
            </p>
          </li>
        ))}
      </ul>
      <p role="status" className="sr-only">
        {announce}
      </p>
    </>
  );
}

function ToneDot({ tone }: { tone: FixTone }) {
  const t = TONE_ICON[tone];
  return (
    <span
      className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
      style={{ background: t.bg, border: `1px solid ${t.border}` }}
      aria-hidden="true"
    >
      {tone === "ok" ? (
        <CheckIcon size={10} color={t.color} />
      ) : tone === "optional" ? (
        <span style={{ color: t.color, fontSize: 12, fontWeight: 800, lineHeight: 1 }}>+</span>
      ) : (
        <AlertTriangleIcon size={10} color={t.color} />
      )}
    </span>
  );
}

const fixBtn =
  "inline-flex items-center gap-1 px-3 min-h-11 rounded-xl text-xs border transition-all hover:bg-violet-50 " +
  "focus-visible:ring-4 focus-visible:ring-[#E9E5DE] outline-none";

function FixRow({
  item,
  property,
  dense,
  onSaved,
}: {
  item: FixItem;
  property: Property;
  dense: boolean;
  onSaved: (key: FieldKey) => void;
}) {
  const [open, setOpen] = useState<FieldKey | null>(null);
  const panelId = useId();
  const fieldFixes = item.fixes.filter((f) => f.kind === "field");
  const detailColor = item.tone === "block" ? "#BE123C" : item.tone === "warn" ? "#B45309" : "#6B7280";

  return (
    <li className={`${dense ? "py-2.5" : "py-3"} border-b last:border-b-0 border-divider-soft`}>
      <div className="flex items-start gap-3">
        <ToneDot tone={item.tone} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink" style={{ fontWeight: 600 }}>
            {item.title}
            <span className="sr-only">: {TONE_ICON[item.tone].sr}</span>
          </p>
          {item.detail && (
            <p className="text-xs mt-0.5" style={{ color: detailColor }}>
              {item.detail}
            </p>
          )}

          {item.fixes.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {item.fixes.map((f) => {
                if (f.kind === "field") {
                  const isOpen = open === f.key;
                  const text = fieldFixes.length > 1 ? FIX_LABEL[f.key] : "Completar";
                  return (
                    <button
                      key={f.key}
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      aria-label={fieldFixes.length > 1 ? `Completar ${FIX_LABEL[f.key].toLowerCase()}` : `Completar ${item.title.toLowerCase()}`}
                      onClick={() => setOpen(isOpen ? null : f.key)}
                      className={fixBtn}
                      style={
                        isOpen
                          ? { background: "#F7F0FF", borderColor: "#D4AAFF", color: "#7C0BD8", fontWeight: 700 }
                          : { background: "white", borderColor: "#DDD8CF", color: "#9B21FF", fontWeight: 700 }
                      }
                    >
                      {fieldFixes.length > 1 && <span aria-hidden="true">+</span>}
                      {text}
                    </button>
                  );
                }
                if (f.kind === "link") {
                  return (
                    <Link
                      key={f.key}
                      to={f.to}
                      className={fixBtn}
                      style={{ background: "white", borderColor: "#DDD8CF", color: "#9B21FF", fontWeight: 700 }}
                    >
                      {f.label} <span aria-hidden="true">→</span>
                    </Link>
                  );
                }
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={f.onClick}
                    className={fixBtn}
                    style={{ background: "white", borderColor: "#DDD8CF", color: "#9B21FF", fontWeight: 700 }}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          )}

          {open && (
            <div id={panelId} className="mt-3 rounded-xl p-3 border border-lilac" style={{ background: "#FAF8F5" }}>
              <InlineFieldEditor
                key={open}
                property={property}
                field={open}
                onCancel={() => setOpen(null)}
                onDone={() => {
                  const k = open;
                  setOpen(null);
                  onSaved(k);
                }}
              />
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

/* ── Mini editores ─────────────────────────────────────────────────────── */

interface EditorProps {
  property: Property;
  field: FieldKey;
  onDone: () => void;
  onCancel: () => void;
}

/** Mini editor de un dato de la propiedad. Guarda con `updateProperty`, igual que el resto de los cambios puntuales. */
export function InlineFieldEditor(props: EditorProps) {
  switch (props.field) {
    case "title":
      return <TitleFix {...props} />;
    case "description":
      return <DescriptionFix {...props} />;
    case "price":
    case "expenses":
      return <MoneyFix {...props} />;
    case "surface_total":
    case "surface_covered":
    case "rooms":
    case "age_years":
      return <NumberFix {...props} />;
    case "bedrooms":
    case "bathrooms":
    case "garages":
      return <StepperFix {...props} />;
    case "orientation":
    case "layout":
      return <SelectFix {...props} />;
    case "address":
      return <AddressFix {...props} />;
    case "coords":
      return <CoordsFix {...props} />;
    case "features":
      return <FeaturesFix {...props} />;
  }
}

/** Form con Guardar/Cancelar; Escape cancela. */
function FixForm({
  onSubmit,
  onCancel,
  canSave,
  children,
}: {
  onSubmit: () => void;
  onCancel: () => void;
  canSave: boolean;
  children: React.ReactNode;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) onSubmit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
      className="space-y-3"
    >
      {children}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={!canSave}
          className="px-4 min-h-11 rounded-xl text-sm text-white transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: "var(--gradient-brand)", fontWeight: 700 }}
        >
          Guardar
        </button>
        <button type="button" onClick={onCancel} className="px-4 min-h-11 rounded-xl text-sm hover:bg-violet-50 text-ink-soft" style={{ fontWeight: 600 }}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/**
 * Enfoca un control de adentro al montarse, para los que no aceptan autoFocus
 * (MoneyField, Stepper, chips). `last` = el último que coincide (el "Sumar").
 */
function AutoFocus({ selector, last = false, children }: { selector: string; last?: boolean; children: React.ReactNode }) {
  return (
    <div
      ref={(el) => {
        if (!el || el.dataset.focused) return;
        el.dataset.focused = "1";
        const all = el.querySelectorAll<HTMLElement>(selector);
        (last ? all[all.length - 1] : all[0])?.focus();
      }}
    >
      {children}
    </div>
  );
}

function useSave(property: Property, onDone: () => void) {
  const { updateProperty } = useStore();
  return (patch: Partial<Property>) => {
    updateProperty(property.id, patch);
    onDone();
  };
}

function TitleFix({ property, onDone, onCancel }: EditorProps) {
  const [value, setValue] = useState(property.title);
  const save = useSave(property, onDone);
  const len = value.trim().length;
  return (
    <FixForm canSave={len > 0} onCancel={onCancel} onSubmit={() => save({ title: value.trim() })}>
      <Field
        label="Título"
        hint={
          <CounterHint ok={len >= TITLE_MIN && len <= TITLE_MAX}>
            {len}/{TITLE_MAX} ·{" "}
            {len < TITLE_MIN
              ? `faltan ${TITLE_MIN - len} para el mínimo de ${TITLE_MIN}`
              : len > TITLE_MAX
                ? `sobran ${len - TITLE_MAX}`
                : "dentro de lo recomendado"}
          </CounterHint>
        }
      >
        <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} className={inputClass(false)} placeholder="Departamento en venta 3 ambientes en Tolosa" />
      </Field>
    </FixForm>
  );
}

function DescriptionFix({ property, onDone, onCancel }: EditorProps) {
  const [value, setValue] = useState(property.description ?? "");
  const save = useSave(property, onDone);
  const len = value.trim().length;
  return (
    <FixForm canSave={value.trim() !== (property.description ?? "").trim()} onCancel={onCancel} onSubmit={() => save({ description: value.trim() || null })}>
      <Field
        label="Descripción"
        hint={
          <CounterHint ok={len >= DESCRIPTION_MIN}>
            {len} caracteres · {len < DESCRIPTION_MIN ? `faltan ${DESCRIPTION_MIN - len} para el mínimo de ${DESCRIPTION_MIN}` : "dentro de lo recomendado"}
          </CounterHint>
        }
      >
        <textarea
          autoFocus
          rows={5}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Describí ambientes, luz, estado, entorno y lo que la hace distinta…"
          className={`${inputClass(false)} resize-y`}
        />
      </Field>
    </FixForm>
  );
}

function MoneyFix({ property, field, onDone, onCancel }: EditorProps) {
  const isPrice = field === "price";
  const initial = isPrice ? property.price : property.expenses;
  const [value, setValue] = useState(initial != null ? String(initial) : "");
  const [currency, setCurrency] = useState<CurrencyCode>(
    isPrice ? property.currency : (property.expenses_currency ?? "ARS"),
  );
  const save = useSave(property, onDone);
  const n = value.trim() ? Number(value) : null;
  const valid = n !== null && Number.isFinite(n) && (isPrice ? n > 0 : n >= 0);
  return (
    <FixForm
      canSave={valid}
      onCancel={onCancel}
      onSubmit={() => save(isPrice ? { price: n, currency } : { expenses: n, expenses_currency: currency })}
    >
      <div>
        <AutoFocus selector="input">
          <MoneyField
            label={isPrice ? (property.operation === "venta" ? "Precio de venta" : "Precio mensual") : "Expensas"}
            value={value}
            onValue={setValue}
            currency={currency}
            onCurrency={setCurrency}
            placeholder={isPrice ? "185000" : "45000"}
            hint={
              isPrice && currency === "ARS" ? (
                <span style={{ color: "#B45309", fontWeight: 600 }}>Solo los precios en USD se publican en la app PropMatch.</span>
              ) : undefined
            }
          />
        </AutoFocus>
      </div>
    </FixForm>
  );
}

const NUMBER_META: Partial<Record<FieldKey, { label: string; placeholder: string; min: number; decimals: boolean }>> = {
  surface_total: { label: "Superficie total (m²)", placeholder: "220", min: 1, decimals: true },
  surface_covered: { label: "Superficie cubierta (m²)", placeholder: "180", min: 1, decimals: true },
  rooms: { label: "Ambientes", placeholder: "3", min: 1, decimals: false },
  age_years: { label: "Antigüedad (años)", placeholder: "0 = a estrenar", min: 0, decimals: false },
};

function NumberFix({ property, field, onDone, onCancel }: EditorProps) {
  const meta = NUMBER_META[field]!;
  const current = property[field as "surface_total" | "surface_covered" | "rooms" | "age_years"];
  const [value, setValue] = useState(current != null ? String(current) : field === "rooms" && property.bedrooms != null ? String(property.bedrooms + 1) : "");
  const save = useSave(property, onDone);
  const n = value.trim() ? Number(value) : null;
  const valid = n !== null && Number.isFinite(n) && n >= meta.min;
  return (
    <FixForm canSave={valid} onCancel={onCancel} onSubmit={() => save({ [field]: n } as Partial<Property>)}>
      <Field
        label={meta.label}
        hint={
          field === "rooms" && current == null && property.bedrooms != null ? (
            <span style={{ color: "#6B7280" }}>Sugerido: dormitorios + 1</span>
          ) : field === "surface_covered" && property.surface_total ? (
            <span style={{ color: "#6B7280" }}>Total cargada: {property.surface_total} m²</span>
          ) : undefined
        }
      >
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value.replace(meta.decimals ? /[^\d.]/g : /[^\d]/g, ""))}
          inputMode={meta.decimals ? "decimal" : "numeric"}
          placeholder={meta.placeholder}
          className={inputClass(false)}
        />
      </Field>
    </FixForm>
  );
}

function StepperFix({ property, field, onDone, onCancel }: EditorProps) {
  const key = field as "bedrooms" | "bathrooms" | "garages";
  const [value, setValue] = useState<number>(property[key] ?? (key === "bathrooms" ? 1 : 0));
  const save = useSave(property, onDone);
  const hint =
    key === "bedrooms" ? "0 si es monoambiente." : key === "garages" ? "0 si no tiene." : value === 0 ? "Para publicar en portales hace falta al menos 1 baño." : null;
  return (
    <FixForm canSave onCancel={onCancel} onSubmit={() => save({ [key]: value } as Partial<Property>)}>
      <AutoFocus selector="button" last>
        <Stepper label={FIX_LABEL[key]} value={value} onChange={setValue} />
      </AutoFocus>
      {hint && <p className="text-xs text-ink-soft">{hint}</p>}
    </FixForm>
  );
}

function SelectFix({ property, field, onDone, onCancel }: EditorProps) {
  const isOrientation = field === "orientation";
  const options = isOrientation ? ORIENTATIONS : LAYOUTS;
  const [value, setValue] = useState<string>((isOrientation ? property.orientation : property.layout) ?? "");
  const save = useSave(property, onDone);
  return (
    <FixForm
      canSave={!!value}
      onCancel={onCancel}
      onSubmit={() => save(isOrientation ? { orientation: value as Property["orientation"] } : { layout: value as Property["layout"] })}
    >
      <Field label={FIX_LABEL[field]}>
        <select autoFocus value={value} onChange={(e) => setValue(e.target.value)} className={selectClass}>
          <option value="">Elegí…</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
    </FixForm>
  );
}

function AddressFix({ property, onDone, onCancel }: EditorProps) {
  const [street, setStreet] = useState(property.street ?? "");
  const [number, setNumber] = useState(property.street_number ?? "");
  const save = useSave(property, onDone);
  return (
    <FixForm
      canSave={!!street.trim()}
      onCancel={onCancel}
      onSubmit={() => save({ street: street.trim() || null, street_number: number.trim() || null })}
    >
      <div className="grid gap-3 grid-cols-3">
        <div className="col-span-2">
          <Field label="Calle">
            <input autoFocus value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Calle 13" className={inputClass(false)} />
          </Field>
        </div>
        <Field label="Número">
          <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="450" className={inputClass(false)} />
        </Field>
      </div>
    </FixForm>
  );
}

function CoordsFix({ property, onDone, onCancel }: EditorProps) {
  const [text, setText] = useState(
    typeof property.lat === "number" && typeof property.lng === "number" ? `${property.lat}, ${property.lng}` : "",
  );
  const found = parseCoordinates(text);
  const save = useSave(property, onDone);
  const msg = !text.trim()
    ? null
    : found
      ? { ok: true, text: `Listo: ${found.lat.toFixed(5)}, ${found.lng.toFixed(5)}` }
      : isShortMapsLink(text)
        ? { ok: false, text: "Los links cortos (maps.app.goo.gl) no traen coordenadas. Abrilo y copiá la dirección larga de la barra." }
        : { ok: false, text: "No encontramos coordenadas en ese texto." };
  return (
    <FixForm canSave={!!found} onCancel={onCancel} onSubmit={() => found && save({ lat: found.lat, lng: found.lng })}>
      <Field
        label="Link de Google Maps o «latitud, longitud»"
        hint={msg ? <span style={{ color: msg.ok ? "#15803D" : "#B45309", fontWeight: 600 }}>{msg.text}</span> : undefined}
      >
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="-34.8712, -58.0456"
          className={inputClass(false)}
        />
      </Field>
    </FixForm>
  );
}

function FeaturesFix({ property, onDone, onCancel }: EditorProps) {
  const [features, setFeatures] = useState<string[]>(property.features);
  const options = [...FEATURE_CHIPS, ...features.filter((f) => !FEATURE_CHIPS.includes(f))];
  const save = useSave(property, onDone);
  return (
    <FixForm canSave={features.length > 0} onCancel={onCancel} onSubmit={() => save({ features })}>
      <div role="group" aria-label="Amenities">
        <span className="block text-xs mb-1.5 text-ink-soft" style={{ fontWeight: 600 }}>
          Amenities
        </span>
        <AutoFocus selector="button">
          <div className="flex flex-wrap gap-2">
            {options.map((f) => (
              <Chip
                key={f}
                label={f}
                active={features.includes(f)}
                onClick={() => setFeatures((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]))}
              />
            ))}
          </div>
        </AutoFocus>
      </div>
    </FixForm>
  );
}

