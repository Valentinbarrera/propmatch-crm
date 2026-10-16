import { useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useStore } from "@/data/store";
import { DOCUMENT_LABEL, buildDocument, type DocumentKind } from "@/lib/deals";
import { domToTemplate, defaultTemplateFor, newTemplateId, templatesFor, upsertTemplate } from "@/lib/docTemplates";
import { agencyPatch, useAgencyBrand } from "@/lib/branding";
import { DocPaper } from "@/features/branding/DocPaper";
import type { DealKind, DocTemplate } from "@/types/db";

const KINDS = Object.keys(DOCUMENT_LABEL) as DocumentKind[];
const PROPMATCH = "propmatch";

/**
 * Documento listo para imprimir (o guardar como PDF desde el diálogo de
 * impresión). Sale de una plantilla: la predeterminada de la inmobiliaria o
 * el modelo de PropMatch. El texto es editable en pantalla para ajustar
 * cláusulas antes de imprimir; esos cambios no se guardan en la operación,
 * pero se pueden guardar como plantilla de la inmobiliaria (con variables,
 * para que se completen solas en las próximas operaciones).
 */
export default function DocumentoPage() {
  const { dealId, kind } = useParams();
  const { deals, propertyById, agency, profile, updateAgency } = useStore();
  const brand = useAgencyBrand();
  const deal = deals.find((d) => d.id === dealId);
  const docKind = KINDS.find((k) => k === kind);
  const options = useMemo(() => (deal && docKind ? templatesFor(agency.doc_templates, docKind, deal.kind) : []), [agency.doc_templates, deal, docKind]);
  const [choice, setChoice] = useState<string | null>(null);
  const selectedId = choice ?? (deal && docKind ? defaultTemplateFor(agency.doc_templates, docKind, deal.kind)?.id : null) ?? PROPMATCH;
  const selected = options.find((t) => t.id === selectedId) ?? null;
  const [letterhead, setLetterhead] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const paperRef = useRef<HTMLDivElement>(null);
  const canEditTemplates = profile.role === "owner" || profile.role === "admin";

  const blocks = useMemo(() => {
    if (!deal || !docKind) return null;
    return buildDocument(
      docKind,
      {
        deal,
        property: propertyById(deal.property_id),
        agencyName: brand.name,
        agencyCity: agency.city ?? "",
        agentName: profile.full_name,
        agencyLicense: brand.license,
        agencyAddress: brand.address,
      },
      selected?.text,
    );
  }, [deal, docKind, propertyById, agency, profile, brand, selected]);

  if (!deal || !docKind || !blocks) {
    return (
      <div className="p-8 text-sm">
        No se encontró el documento. <Link to="/operaciones" style={{ color: "#9B21FF" }}>Volver a Operaciones</Link>
      </div>
    );
  }

  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 3500);
  };

  const saveTemplate = (input: { name: string; dealKind: DealKind | null; isDefault: boolean; replace: boolean }) => {
    if (!paperRef.current) return;
    const text = domToTemplate(paperRef.current);
    const tpl: DocTemplate = {
      id: input.replace && selected ? selected.id : newTemplateId(),
      kind: docKind,
      name: input.name,
      deal_kind: docKind === "reserva" ? input.dealKind : null,
      text,
      is_default: input.isDefault,
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    };
    updateAgency(agencyPatch(agency, { doc_templates: upsertTemplate(agency.doc_templates, tpl) }));
    setChoice(tpl.id);
    setVersion((v) => v + 1);
    setSaving(false);
    flash(`Plantilla «${tpl.name}» guardada. La podés editar en Configuración → Documentos.`);
  };

  return (
    <div className="doc-root" style={{ background: "#F0EDE6", height: "100vh", overflowY: "auto" }}>
      <style>{`
        @media print {
          .doc-toolbar, .doc-hint { display: none !important; }
          .doc-root { background: white !important; height: auto !important; overflow: visible !important; }
          .doc-paper { box-shadow: none !important; margin: 0 !important; padding: 0 !important; max-width: none !important; }
          .doc-paper p { orphans: 3; widows: 3; }
          .doc-paper h1, .doc-letterhead { break-after: avoid; }
          .doc-sign { break-inside: avoid; }
          html, body, #root { height: auto !important; overflow: visible !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { size: A4; margin: 22mm 20mm; }
        }
      `}</style>

      <div className="doc-toolbar sticky top-0 z-10 flex flex-wrap items-center gap-2 sm:gap-3 px-4 py-3 border-b" style={{ background: "white", borderColor: "#E9E5DE" }}>
        <Link to={`/operaciones/${deal.id}`} className="text-sm mr-auto" style={{ color: "#9B21FF", fontWeight: 600 }}>
          ← Volver a la operación
        </Link>
        <label className="flex items-center gap-2 text-xs" style={{ color: "#374151", fontWeight: 600 }}>
          Modelo
          <select
            value={selectedId}
            onChange={(e) => {
              setChoice(e.target.value);
              setVersion((v) => v + 1);
            }}
            className="px-2 py-1.5 rounded-lg border text-xs bg-white"
            style={{ borderColor: "#DDD8CF", color: "#1A1A1A" }}
          >
            <option value={PROPMATCH}>Modelo de PropMatch</option>
            {options.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.is_default ? " (predeterminada)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs" style={{ color: "#374151", fontWeight: 600 }}>
          <input type="checkbox" checked={letterhead} onChange={(e) => setLetterhead(e.target.checked)} />
          Membrete
        </label>
        {canEditTemplates && (
          <button
            onClick={() => setSaving(true)}
            className="px-3 py-2 rounded-xl text-sm border bg-white"
            style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 600 }}
          >
            Guardar como plantilla
          </button>
        )}
        <button onClick={() => window.print()} className="px-4 py-2 rounded-xl text-sm text-white" style={{ background: "var(--gradient-brand)", fontWeight: 600 }}>
          Imprimir / Guardar PDF
        </button>
      </div>
      <p className="doc-hint text-xs text-center mt-3 px-4" style={{ color: "#6B7280" }}>
        Podés editar el texto antes de imprimir. Lo que cambies a mano no se guarda en la operación, salvo que lo guardes como plantilla.
      </p>

      <div className="my-6 mx-2 sm:mx-auto">
        <DocPaper key={`${selectedId}-${version}`} blocks={blocks} brand={letterhead ? brand : null} editable paperRef={paperRef} />
      </div>

      {saving && (
        <SaveTemplateModal
          kind={docKind}
          dealKind={deal.kind}
          current={selected}
          defaultName={`${DOCUMENT_LABEL[docKind]} de ${brand.name}`}
          onCancel={() => setSaving(false)}
          onSave={saveTemplate}
        />
      )}
      {toast && (
        <div role="status" className="doc-toolbar fixed bottom-6 right-6 z-50 rounded-2xl px-5 py-3.5 text-sm text-white max-w-sm" style={{ background: "#1A1A1A", fontWeight: 600 }}>
          ✓ {toast}
        </div>
      )}
    </div>
  );
}

function SaveTemplateModal({
  kind,
  dealKind,
  current,
  defaultName,
  onCancel,
  onSave,
}: {
  kind: DocumentKind;
  dealKind: DealKind;
  current: DocTemplate | null;
  defaultName: string;
  onCancel: () => void;
  onSave: (input: { name: string; dealKind: DealKind | null; isDefault: boolean; replace: boolean }) => void;
}) {
  const [name, setName] = useState(current?.name ?? defaultName);
  const [scope, setScope] = useState<DealKind | "ambas">(current ? (current.deal_kind ?? "ambas") : dealKind);
  const [isDefault, setIsDefault] = useState(current?.is_default ?? true);
  const [replace, setReplace] = useState(!!current);
  const input = "w-full px-3 py-2 rounded-xl text-sm border bg-white";
  return (
    <div className="doc-toolbar fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(8, 11, 31,0.4)" }} role="dialog" aria-modal="true" aria-labelledby="save-tpl-title">
      <div className="bg-white rounded-2xl w-full max-w-md p-5" style={{ boxShadow: "var(--shadow-pop)" }}>
        <h2 id="save-tpl-title" className="text-base" style={{ color: "#1A1A1A", fontWeight: 800 }}>
          Guardar como plantilla de la inmobiliaria
        </h2>
        <p className="text-xs mt-1" style={{ color: "#6B7280" }}>
          Se guarda el texto con variables (nombres, montos, fechas): en la próxima operación se completan solas. Lo que escribiste a mano queda fijo.
        </p>
        <div className="grid gap-3 mt-4">
          {current && (
            <label className="flex items-center gap-2 text-sm" style={{ color: "#1A1A1A" }}>
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
              Reemplazar «{current.name}» (si no, se guarda como una nueva)
            </label>
          )}
          <label className="block text-xs" style={{ color: "#6B7280", fontWeight: 600 }}>
            Nombre
            <input value={name} onChange={(e) => setName(e.target.value)} className={`${input} mt-1`} style={{ borderColor: "#E9E5DE", color: "#1A1A1A" }} />
          </label>
          {kind === "reserva" && (
            <label className="block text-xs" style={{ color: "#6B7280", fontWeight: 600 }}>
              Sirve para
              <select value={scope} onChange={(e) => setScope(e.target.value as DealKind | "ambas")} className={`${input} mt-1`} style={{ borderColor: "#E9E5DE", color: "#1A1A1A" }}>
                <option value="venta">Ventas</option>
                <option value="alquiler">Alquileres</option>
                <option value="ambas">Ventas y alquileres</option>
              </select>
            </label>
          )}
          <label className="flex items-center gap-2 text-sm" style={{ color: "#1A1A1A" }}>
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
            Usarla por defecto para {DOCUMENT_LABEL[kind].toLowerCase()}
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onCancel} className="px-4 py-2 rounded-xl text-sm" style={{ color: "#6B7280", fontWeight: 600 }}>
            Cancelar
          </button>
          <button
            disabled={!name.trim()}
            onClick={() => onSave({ name: name.trim(), dealKind: scope === "ambas" ? null : scope, isDefault, replace })}
            className="px-4 py-2 rounded-xl text-sm text-white disabled:opacity-40"
            style={{ background: "var(--gradient-brand)", fontWeight: 600 }}
          >
            Guardar plantilla
          </button>
        </div>
      </div>
    </div>
  );
}
