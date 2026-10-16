import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/states";
import { UsersIcon } from "@/components/ui/icons";
import { SampleBadge } from "@/components/ui/SampleBadge";
import { OPERATION_LABEL, PROPERTY_TYPE_LABEL } from "@/lib/format";
import { removeSegment, saveSegment } from "@/lib/marketing/actions";
import { allTags, evaluateSegment, EXCLUSION_LABEL, ruleSummary, type Audience, type ExclusionReason } from "@/lib/marketing/segments";
import { EMPTY_RULES, type InteractionRule, type MarketingChannel, type Segment, type SegmentRules } from "@/lib/marketing/types";
import type { ContactKind, ContactSource, ContactStatus, OperationType, PropertyType } from "@/types/db";
import { useMarketingCtx } from "./useMarketingCtx";
import { Btn, Chip, Field, INPUT, Modal, NoContactBadge } from "./ui";
import { blockOf } from "@/lib/marketing/block";

const SOURCE_LABEL: Record<ContactSource, string> = { manual: "Carga manual", web: "Web", portal: "Portal", referido: "Referido", consumer_app: "App PropMatch" };
const KIND_LABEL: Record<ContactKind, string> = { comprador: "Comprador", inquilino: "Inquilino", propietario: "Propietario", inversor: "Inversor", otro: "Otro" };
const STATUS_LABEL: Record<ContactStatus, string> = {
  nuevo: "Nuevo",
  activo: "Activo",
  en_seguimiento: "En seguimiento",
  visita_programada: "Visita programada",
  cerrado: "Cerrado",
  perdido: "Perdido",
};
const INTERACTION_LABEL: Record<InteractionRule, string> = {
  visito_sin_oferta: "Visitó y no ofertó",
  oferto_sin_cierre: "Ofertó y no cerró",
  oportunidad_perdida: "Oportunidad perdida",
};

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
const numOrNull = (s: string) => (s.trim() === "" || Number.isNaN(Number(s)) ? null : Math.max(0, Number(s)));

export function SegmentsTab() {
  const { m, agencyId, segmentData, store } = useMarketingCtx();
  const [editing, setEditing] = useState<Segment | "new" | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm" style={{ color: "#6B7280" }}>
          Audiencias armadas con tus datos: búsquedas, matches, visitas, ofertas y oportunidades.
        </p>
        <Btn kind="primary" onClick={() => setEditing("new")}>
          Nueva audiencia
        </Btn>
      </div>
      {m.segments.length === 0 ? (
        <Card>
          <EmptyState
            icon={<UsersIcon size={22} />}
            title="Todavía no armaste audiencias"
            description="Por ejemplo: «buscan 3 ambientes en La Plata hasta USD 150.000» o «visitaron y no ofertaron»."
            action={{ label: "Nueva audiencia", onClick: () => setEditing("new") }}
          />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {m.segments.map((s) => {
            const email = evaluateSegment(s.rules, "email", segmentData, m);
            const wa = evaluateSegment(s.rules, "whatsapp", segmentData, m);
            return (
              <Card key={s.id} padded hover>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm truncate" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                      {s.name}
                    </p>
                    <p className="text-xs mt-1" style={{ color: "#6B7280" }}>
                      {ruleSummary(s.rules, (id) => store.propertyById(id)?.title).join(" · ")}
                    </p>
                  </div>
                  <Btn kind="ghost" onClick={() => setEditing(s)}>
                    Editar
                  </Btn>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs" style={{ color: "#4B5563" }}>
                  <span className="px-2 py-1 rounded-lg" style={{ background: "#F7F0FF" }}>
                    {email.matched.length} coinciden
                  </span>
                  <span className="px-2 py-1 rounded-lg" style={{ background: "#F0FDF4" }}>
                    {email.eligible.length} por email
                  </span>
                  <span className="px-2 py-1 rounded-lg" style={{ background: "#F0FDF4" }}>
                    {wa.eligible.length} por WhatsApp
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {editing && (
        <SegmentEditor
          segment={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(name, rules) => {
            saveSegment(agencyId, { id: editing === "new" ? undefined : editing.id, name, rules });
            setEditing(null);
          }}
          onDelete={
            editing === "new"
              ? undefined
              : () => {
                  removeSegment(agencyId, editing.id);
                  setEditing(null);
                }
          }
        />
      )}
    </div>
  );
}

export function SegmentEditor({
  segment,
  onClose,
  onSave,
  onDelete,
}: {
  segment: Segment | null;
  onClose: () => void;
  onSave: (name: string, rules: SegmentRules) => void;
  onDelete?: () => void;
}) {
  const { m, segmentData, store } = useMarketingCtx();
  const [name, setName] = useState(segment?.name ?? "");
  const [r, setR] = useState<SegmentRules>({ ...EMPTY_RULES, ...(segment?.rules ?? {}) });
  const [channel, setChannel] = useState<MarketingChannel>("email");
  const set = (patch: Partial<SegmentRules>) => setR((x) => ({ ...x, ...patch }));
  const zones = useMemo(() => {
    const s = new Set<string>();
    for (const q of store.requirements) for (const z of q.zones) s.add(z);
    return [...s].sort((a, b) => a.localeCompare(b, "es"));
  }, [store.requirements]);
  const tags = allTags(m.tags);
  const audience = useMemo(() => evaluateSegment(r, channel, segmentData, m), [r, channel, segmentData, m]);
  const [zoneInput, setZoneInput] = useState("");
  const [tagInput, setTagInput] = useState("");

  return (
    <Modal
      title={segment ? "Editar audiencia" : "Nueva audiencia"}
      onClose={onClose}
      wide
      footer={
        <>
          {onDelete && (
            <Btn kind="danger" onClick={onDelete}>
              Borrar
            </Btn>
          )}
          <Btn onClick={onClose}>Cancelar</Btn>
          <Btn kind="primary" disabled={!name.trim()} onClick={() => onSave(name.trim(), r)}>
            Guardar audiencia
          </Btn>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Field label="Nombre">
            <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Buscan 3 amb. en La Plata" />
          </Field>

          <Section title="Por búsqueda">
            <div className="flex flex-wrap gap-2">
              <Chip active={r.operation === null} onClick={() => set({ operation: null })}>
                Cualquier operación
              </Chip>
              {(Object.keys(OPERATION_LABEL) as OperationType[]).map((o) => (
                <Chip key={o} active={r.operation === o} onClick={() => set({ operation: o })}>
                  {OPERATION_LABEL[o]}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(PROPERTY_TYPE_LABEL) as PropertyType[]).map((t) => (
                <Chip key={t} active={r.propertyTypes.includes(t)} onClick={() => set({ propertyTypes: toggle(r.propertyTypes, t) })}>
                  {PROPERTY_TYPE_LABEL[t]}
                </Chip>
              ))}
            </div>
            <Field label="Zonas" hint="Coincide si alguna de las zonas que busca el contacto contiene lo que escribas.">
              <div className="flex gap-2">
                <input
                  className={INPUT}
                  list="mkt-zones"
                  value={zoneInput}
                  onChange={(e) => setZoneInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && zoneInput.trim()) {
                      e.preventDefault();
                      set({ zones: [...new Set([...r.zones, zoneInput.trim()])] });
                      setZoneInput("");
                    }
                  }}
                  placeholder="Escribí una zona y Enter"
                />
                <datalist id="mkt-zones">
                  {zones.map((z) => (
                    <option key={z} value={z} />
                  ))}
                </datalist>
              </div>
              {r.zones.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {r.zones.map((z) => (
                    <Chip key={z} active onClick={() => set({ zones: r.zones.filter((x) => x !== z) })}>
                      {z} ×
                    </Chip>
                  ))}
                </div>
              )}
            </Field>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Field label="Moneda">
                <select className={INPUT} value={r.currency} onChange={(e) => set({ currency: e.target.value as SegmentRules["currency"] })}>
                  <option value="USD">USD</option>
                  <option value="ARS">ARS</option>
                </select>
              </Field>
              <Field label="Precio desde">
                <input className={INPUT} inputMode="numeric" value={r.priceMin ?? ""} onChange={(e) => set({ priceMin: numOrNull(e.target.value) })} />
              </Field>
              <Field label="Precio hasta">
                <input className={INPUT} inputMode="numeric" value={r.priceMax ?? ""} onChange={(e) => set({ priceMax: numOrNull(e.target.value) })} />
              </Field>
              <Field label="Ambientes (mín.)">
                <input className={INPUT} inputMode="numeric" value={r.roomsMin ?? ""} onChange={(e) => set({ roomsMin: numOrNull(e.target.value) })} />
              </Field>
            </div>
          </Section>

          <Section title="Por interacción">
            <Field label="Matcheó con">
              <select className={INPUT} value={r.matchedProperty ?? ""} onChange={(e) => set({ matchedProperty: e.target.value || null })}>
                <option value="">No filtrar</option>
                <option value="any">Alguna propiedad</option>
                {store.properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(INTERACTION_LABEL) as InteractionRule[]).map((k) => (
                <Chip key={k} active={r.interactions.includes(k)} onClick={() => set({ interactions: toggle(r.interactions, k) })}>
                  {INTERACTION_LABEL[k]}
                </Chip>
              ))}
            </div>
            <Field label="Sin contacto hace (días)" hint="Última llamada, mensaje o visita registrada.">
              <input className={INPUT} inputMode="numeric" value={r.noContactDays ?? ""} onChange={(e) => set({ noContactDays: numOrNull(e.target.value) })} placeholder="Ej.: 30" />
            </Field>
          </Section>

          <Section title="Por origen, tipo, estado y etiqueta">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(SOURCE_LABEL) as ContactSource[]).map((s) => (
                <Chip key={s} active={r.sources.includes(s)} onClick={() => set({ sources: toggle(r.sources, s) })}>
                  {SOURCE_LABEL[s]}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(KIND_LABEL) as ContactKind[]).map((s) => (
                <Chip key={s} active={r.kinds.includes(s)} onClick={() => set({ kinds: toggle(r.kinds, s) })}>
                  {KIND_LABEL[s]}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(STATUS_LABEL) as ContactStatus[]).map((s) => (
                <Chip key={s} active={r.statuses.includes(s)} onClick={() => set({ statuses: toggle(r.statuses, s) })}>
                  {STATUS_LABEL[s]}
                </Chip>
              ))}
            </div>
            <Field label="Etiquetas" hint="Las etiquetas se ponen desde la ficha del contacto (tarjeta Marketing).">
              <input
                className={INPUT}
                list="mkt-tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && tagInput.trim()) {
                    e.preventDefault();
                    set({ tags: [...new Set([...r.tags, tagInput.trim()])] });
                    setTagInput("");
                  }
                }}
                placeholder="Escribí una etiqueta y Enter"
              />
              <datalist id="mkt-tags">
                {tags.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
              {r.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {r.tags.map((t) => (
                    <Chip key={t} active onClick={() => set({ tags: r.tags.filter((x) => x !== t) })}>
                      {t} ×
                    </Chip>
                  ))}
                </div>
              )}
            </Field>
          </Section>
        </div>

        <div className="space-y-3">
          <div className="flex gap-2">
            <Chip active={channel === "email"} onClick={() => setChannel("email")}>
              Por email
            </Chip>
            <Chip active={channel === "whatsapp"} onClick={() => setChannel("whatsapp")}>
              Por WhatsApp
            </Chip>
          </div>
          <AudiencePreview audience={audience} />
        </div>
      </div>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-2xl border p-4" style={{ borderColor: "#E9E5DE" }}>
      <p className="text-xs uppercase" style={{ color: "#6B7280", letterSpacing: "0.08em", fontWeight: 700 }}>
        {title}
      </p>
      {children}
    </div>
  );
}

/** Cuántos y quiénes, con los excluidos y el motivo. */
export function AudiencePreview({ audience, limit = 40 }: { audience: Audience; limit?: number }) {
  const { m } = useMarketingCtx();
  const [showExcluded, setShowExcluded] = useState(false);
  const reasons = (Object.keys(audience.byReason) as ExclusionReason[]).filter((k) => audience.byReason[k] > 0);
  return (
    <div className="rounded-2xl border p-4 space-y-3" style={{ borderColor: "#E9E5DE", background: "#FAF8F5" }}>
      <div>
        <p className="text-3xl" style={{ color: "#1A1A1A", fontWeight: 800 }}>
          {audience.eligible.length}
        </p>
        <p className="text-xs" style={{ color: "#6B7280" }}>
          pueden recibir · {audience.matched.length} coinciden con los filtros
        </p>
      </div>
      {reasons.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs" style={{ color: "#6B7280", fontWeight: 700 }}>
            Excluidos automáticamente
          </p>
          {reasons.map((k) => (
            <div key={k} className="flex justify-between text-xs" style={{ color: "#4B5563" }}>
              <span>{EXCLUSION_LABEL[k]}</span>
              <span style={{ fontWeight: 700 }}>{audience.byReason[k]}</span>
            </div>
          ))}
        </div>
      )}
      <ul className="space-y-1 max-h-64 overflow-y-auto">
        {audience.eligible.slice(0, limit).map((c) => (
          <li key={c.id} className="text-sm truncate" style={{ color: "#1F2937" }}>
            {c.full_name}
          </li>
        ))}
        {audience.eligible.length > limit && (
          <li className="text-xs" style={{ color: "#9CA3AF" }}>
            y {audience.eligible.length - limit} más
          </li>
        )}
      </ul>
      {audience.excluded.length > 0 && (
        <button className="text-xs underline" style={{ color: "#9B21FF" }} onClick={() => setShowExcluded((v) => !v)}>
          {showExcluded ? "Ocultar excluidos" : "Ver excluidos"}
        </button>
      )}
      {showExcluded && (
        <ul className="space-y-1 max-h-48 overflow-y-auto">
          {audience.excluded.slice(0, 100).map(({ contact, reason }) => (
            <li key={contact.id} className="text-xs flex items-center gap-1.5" style={{ color: "#6B7280" }}>
              <span className="truncate">{contact.full_name}</span>
              <SampleBadge record={contact} />
              {reason === "baja" && <NoContactBadge label={blockOf(m, contact).label} />}
              <span className="ml-auto whitespace-nowrap">{EXCLUSION_LABEL[reason]}</span>
            </li>
          ))}
        </ul>
      )}
      {audience.byReason.sin_consentimiento > 0 && (
        <p className="text-xs" style={{ color: "#92400E" }}>
          Para incluir a quien falta, registrá su consentimiento (con fecha y cómo lo dio) en «Bajas y consentimientos» o en su ficha.
        </p>
      )}
    </div>
  );
}
