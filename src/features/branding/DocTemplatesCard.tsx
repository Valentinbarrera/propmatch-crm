import { useMemo, useRef, useState } from "react";
import { Card, SectionHeader } from "@/components/ui/Card";
import { useStore } from "@/data/store";
import { agencyPatch, useAgencyBrand } from "@/lib/branding";
import {
  DEFAULT_TEMPLATES,
  SECTIONS,
  TEMPLATE_KIND_LABEL,
  TEMPLATE_VARIABLES,
  newTemplateId,
  renderTemplate,
  sampleContext,
  templateData,
  unknownVariables,
  upsertTemplate,
  type TemplateKind,
} from "@/lib/docTemplates";
import type { DealKind, DocTemplate } from "@/types/db";
import { DocPaper } from "./DocPaper";

const INK = "#1A1A1A";
const SOFT = "#6B7280";
const KINDS = Object.keys(TEMPLATE_KIND_LABEL) as TemplateKind[];
const GROUPS = [...new Set(TEMPLATE_VARIABLES.map((v) => v.group))];

const btn = "min-h-9 px-3 rounded-lg text-xs border bg-white disabled:opacity-40";
const btnStyle = { borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 700 } as const;

const scopeLabel = (t: Pick<DocTemplate, "kind" | "deal_kind">) =>
  t.kind !== "reserva" ? "" : t.deal_kind === "venta" ? " · ventas" : t.deal_kind === "alquiler" ? " · alquileres" : " · ventas y alquileres";

/**
 * Configuración → «Documentos»: plantillas de la inmobiliaria para la
 * reserva, el boleto y el contrato de alquiler. Texto con variables, vista
 * previa con datos de ejemplo y volver al modelo de PropMatch.
 * Se guardan en este navegador (`agency.doc_templates`); para compartirlas
 * con el equipo hace falta la tabla de supabase/drafts/agency_doc_templates.sql.
 */
export function DocTemplatesCard({ onSaved }: { onSaved: (msg: string) => void }) {
  const { agency, profile, updateAgency } = useStore();
  const canEdit = profile.role === "owner" || profile.role === "admin";
  const list = agency.doc_templates ?? [];
  const [editing, setEditing] = useState<DocTemplate | null>(null);
  const [newKind, setNewKind] = useState<TemplateKind>("reserva");

  const save = (tpl: DocTemplate) => {
    updateAgency(agencyPatch(agency, { doc_templates: upsertTemplate(list, { ...tpl, updated_at: new Date().toISOString(), updated_by: profile.id }) }));
    setEditing(null);
    onSaved(`Plantilla «${tpl.name}» guardada`);
  };
  const remove = (tpl: DocTemplate) => {
    if (!window.confirm(`¿Borrar la plantilla «${tpl.name}»? Los documentos van a volver a usar el modelo de PropMatch (o tu otra plantilla predeterminada).`)) return;
    updateAgency(agencyPatch(agency, { doc_templates: list.filter((t) => t.id !== tpl.id) }));
    onSaved("Plantilla borrada");
  };
  const makeDefault = (tpl: DocTemplate, on: boolean) => {
    updateAgency(agencyPatch(agency, { doc_templates: upsertTemplate(list, { ...tpl, is_default: on }) }));
  };

  return (
    <Card className="lg:col-span-2">
      <SectionHeader
        inCard
        title="Documentos"
        subtitle={canEdit ? "Tus plantillas de reserva, boleto y contrato: se completan solas con los datos de cada operación" : "Solo el dueño o un administrador puede editarlas"}
      />
      <div className="p-5">
        {list.length === 0 ? (
          <p className="text-sm" style={{ color: SOFT }}>
            Todavía usás los modelos de PropMatch. Creá una plantilla acá o, desde un documento de una operación, tocá «Guardar como plantilla».
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "#F0EDE6" }}>
            {[...list]
              .sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.name.localeCompare(b.name))
              .map((t) => (
                <li key={t.id} className="py-3 flex flex-wrap items-center gap-2">
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-sm" style={{ color: INK, fontWeight: 700 }}>
                      {t.name}
                      {t.is_default && (
                        <span className="ml-2 text-[11px] px-2 py-0.5 rounded-full" style={{ background: "#DCFCE7", color: "#15803D", fontWeight: 700 }}>
                          Predeterminada
                        </span>
                      )}
                    </p>
                    <p className="text-xs" style={{ color: SOFT }}>
                      {TEMPLATE_KIND_LABEL[t.kind]}
                      {scopeLabel(t)} · editada el {new Date(t.updated_at).toLocaleDateString("es-AR")}
                    </p>
                  </div>
                  {canEdit && (
                    <>
                      <button className={btn} style={btnStyle} onClick={() => setEditing(t)}>
                        Editar
                      </button>
                      <button className={btn} style={btnStyle} onClick={() => makeDefault(t, !t.is_default)}>
                        {t.is_default ? "Quitar predeterminada" : "Usar por defecto"}
                      </button>
                      <button className="min-h-9 px-2 text-xs" style={{ color: "#BE123C", fontWeight: 700 }} onClick={() => remove(t)}>
                        Borrar
                      </button>
                    </>
                  )}
                </li>
              ))}
          </ul>
        )}
        {canEdit && !editing && (
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <select value={newKind} onChange={(e) => setNewKind(e.target.value as TemplateKind)} className="min-h-9 px-2 rounded-lg border text-sm bg-white" style={{ borderColor: "#DDD8CF", color: INK }} aria-label="Tipo de documento">
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {TEMPLATE_KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <button
              className="min-h-9 px-4 rounded-lg text-sm text-white"
              style={{ background: "var(--gradient-brand)", fontWeight: 700 }}
              onClick={() =>
                setEditing({
                  id: newTemplateId(),
                  kind: newKind,
                  name: `${TEMPLATE_KIND_LABEL[newKind]} de ${agency.name}`,
                  deal_kind: null,
                  text: DEFAULT_TEMPLATES[newKind],
                  is_default: !list.some((t) => t.kind === newKind && t.is_default),
                  updated_at: new Date().toISOString(),
                  updated_by: profile.id,
                })
              }
            >
              Nueva plantilla
            </button>
            <span className="text-xs" style={{ color: SOFT }}>
              Arranca con el modelo de PropMatch.
            </span>
          </div>
        )}
        {editing && <TemplateEditor key={editing.id} initial={editing} onCancel={() => setEditing(null)} onSave={save} />}
      </div>
    </Card>
  );
}

function TemplateEditor({ initial, onCancel, onSave }: { initial: DocTemplate; onCancel: () => void; onSave: (t: DocTemplate) => void }) {
  const { agency } = useStore();
  const brand = useAgencyBrand();
  const [tpl, setTpl] = useState(initial);
  const [sample, setSample] = useState<DealKind>(initial.kind === "contrato_alquiler" ? "alquiler" : initial.deal_kind ?? "venta");
  const [showPreview, setShowPreview] = useState(true);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const unknown = unknownVariables(tpl.text);

  const blocks = useMemo(() => {
    const dealKind = tpl.kind === "boleto_compraventa" ? "venta" : tpl.kind === "contrato_alquiler" ? "alquiler" : sample;
    return renderTemplate(tpl.text, templateData(tpl.kind, sampleContext(dealKind, brand.name, agency.city ?? "")));
  }, [tpl.text, tpl.kind, sample, brand.name, agency.city]);

  const insert = (snippet: string) => {
    const el = areaRef.current;
    if (!el) return setTpl((t) => ({ ...t, text: t.text + snippet }));
    const { selectionStart: a, selectionEnd: b, value } = el;
    const selected = value.slice(a, b);
    // Sección: envuelve lo seleccionado.
    const text = snippet.includes("…") ? snippet.replace("…", selected || "texto") : snippet;
    const next = value.slice(0, a) + text + value.slice(b);
    setTpl((t) => ({ ...t, text: next }));
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = a + text.length;
    });
  };

  return (
    <div className="mt-5 rounded-2xl border p-4" style={{ borderColor: "#E9E5DE", background: "#FAF8F5" }}>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-end">
        <label className="block text-xs" style={{ color: "#6B7280", fontWeight: 600 }}>
          Nombre de la plantilla
          <input
            value={tpl.name}
            onChange={(e) => setTpl((t) => ({ ...t, name: e.target.value }))}
            className="mt-1 w-full px-3 py-2 rounded-xl text-sm border bg-white"
            style={{ borderColor: "#E9E5DE", color: INK }}
          />
        </label>
        <p className="text-xs pb-2" style={{ color: SOFT, fontWeight: 700 }}>
          {TEMPLATE_KIND_LABEL[tpl.kind]}
        </p>
      </div>
      {tpl.kind === "reserva" && (
        <label className="block text-xs mt-3" style={{ color: "#6B7280", fontWeight: 600 }}>
          Sirve para
          <select
            value={tpl.deal_kind ?? "ambas"}
            onChange={(e) => setTpl((t) => ({ ...t, deal_kind: e.target.value === "ambas" ? null : (e.target.value as DealKind) }))}
            className="mt-1 block px-3 py-2 rounded-xl text-sm border bg-white"
            style={{ borderColor: "#E9E5DE", color: INK }}
          >
            <option value="ambas">Ventas y alquileres</option>
            <option value="venta">Ventas</option>
            <option value="alquiler">Alquileres</option>
          </select>
        </label>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) insert(`{{${e.target.value}}}`);
          }}
          className="min-h-9 px-2 rounded-lg border text-xs bg-white"
          style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 700 }}
          aria-label="Insertar variable"
        >
          <option value="">+ Insertar variable…</option>
          {GROUPS.map((g) => (
            <optgroup key={g} label={g}>
              {TEMPLATE_VARIABLES.filter((v) => v.group === g).map((v) => (
                <option key={v.key} value={v.key}>
                  {v.label} — {`{{${v.key}}}`}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <select
          value=""
          onChange={(e) => {
            const [sign, key] = e.target.value.split(":");
            if (key) insert(`{{${sign}${key}}}…{{/${key}}}`);
          }}
          className="min-h-9 px-2 rounded-lg border text-xs bg-white"
          style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 700 }}
          aria-label="Insertar sección condicional"
        >
          <option value="">+ Texto condicional…</option>
          {SECTIONS.map((s) => (
            <option key={s.key} value={`#:${s.key}`}>
              {s.label}
            </option>
          ))}
          {SECTIONS.map((s) => (
            <option key={`n-${s.key}`} value={`^:${s.key}`}>
              {s.label.replace(/^Si (hay|es)/, "Si no $1")}
            </option>
          ))}
        </select>
        <button
          className={btn}
          style={btnStyle}
          onClick={() => {
            if (window.confirm("¿Volver al modelo de PropMatch? Se reemplaza el texto de esta plantilla (podés cancelar sin guardar).")) {
              setTpl((t) => ({ ...t, text: DEFAULT_TEMPLATES[t.kind] }));
            }
          }}
        >
          Restaurar el modelo de PropMatch
        </button>
        <button className={btn} style={btnStyle} onClick={() => setShowPreview((v) => !v)} aria-expanded={showPreview}>
          {showPreview ? "Ocultar vista previa" : "Ver vista previa"}
        </button>
      </div>
      <p className="text-xs mt-2" style={{ color: SOFT }}>
        Párrafos separados por una línea en blanco. <code># </code> al principio = título; <code>&gt; </code> = nota al pie; <code>{"{{firmas}}"}</code> solo = firmas.
        Con texto seleccionado, «Texto condicional» lo envuelve.
      </p>

      <div className={`grid gap-4 mt-3 ${showPreview ? "xl:grid-cols-2" : ""}`}>
        <textarea
          ref={areaRef}
          value={tpl.text}
          onChange={(e) => setTpl((t) => ({ ...t, text: e.target.value }))}
          rows={22}
          spellCheck
          aria-label="Texto de la plantilla"
          className="w-full rounded-xl border p-3 text-xs font-mono leading-relaxed bg-white"
          style={{ borderColor: "#DDD8CF", color: INK }}
        />
        {showPreview && (
          <div>
            {tpl.kind === "reserva" && (
              <div className="flex gap-2 mb-2 text-xs" role="group" aria-label="Datos de ejemplo">
                {(["venta", "alquiler"] as DealKind[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setSample(k)}
                    aria-pressed={sample === k}
                    className="px-3 py-1.5 rounded-lg border"
                    style={{ borderColor: "#DDD8CF", background: sample === k ? "#F7F0FF" : "white", color: "#7C0BD8", fontWeight: 700 }}
                  >
                    Ejemplo: {k}
                  </button>
                ))}
              </div>
            )}
            <div className="rounded-xl border overflow-auto" style={{ borderColor: "#E9E5DE", maxHeight: 560, background: "#F0EDE6", padding: 12 }}>
              <DocPaper blocks={blocks} brand={brand} highlightVars style={{ padding: "28px 30px", fontSize: 12 }} />
            </div>
            <p className="text-xs mt-1" style={{ color: SOFT }}>
              En amarillo, lo que sale de las variables (datos de ejemplo).
            </p>
          </div>
        )}
      </div>

      {unknown.length > 0 && (
        <p role="alert" className="text-xs mt-2" style={{ color: "#B45309", fontWeight: 600 }}>
          Estas variables no existen y van a salir tal cual: {unknown.join(", ")}
        </p>
      )}
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onCancel} className="px-4 py-2 rounded-xl text-sm" style={{ color: SOFT, fontWeight: 600 }}>
          Cancelar
        </button>
        <button
          disabled={!tpl.name.trim() || !tpl.text.trim()}
          onClick={() => onSave({ ...tpl, name: tpl.name.trim() })}
          className="px-5 py-2 rounded-xl text-sm text-white disabled:opacity-40"
          style={{ background: "var(--gradient-brand)", fontWeight: 600 }}
        >
          Guardar plantilla
        </button>
      </div>
    </div>
  );
}
