import { useState, type Dispatch, type SetStateAction } from "react";
import type { FormState } from "@/features/propiedades/subir/form";
import { applyPropiedadToForm } from "@/lib/voz/apply";
import type { VozData } from "../../../shared/voz";
import { DictarButton } from "./DictarButton";
import { summarize } from "./fields";
import { useVozPrefill } from "./prefill";

/**
 * Todo lo de voz en el alta/edición de propiedad, en un solo componente para
 * que SubirPropiedadPage cambie lo mínimo: botón "Dictar", precarga desde
 * Proppi (estado de navegación) y el aviso de qué se completó.
 */
export function VozPropiedadEntry({ isNew, setForm }: { isNew: boolean; setForm: Dispatch<SetStateAction<FormState>> }) {
  const [notice, setNotice] = useState<{ count: number; notes: string[] } | null>(null);

  function apply(r: VozData) {
    if (r.kind !== "propiedad") return;
    setForm((f) => applyPropiedadToForm(f, r.data, { isNew }));
    const s = summarize(r);
    setNotice({ count: s.detected.length + (s.title ? 1 : 0) + (s.description ? 1 : 0), notes: s.notes });
  }

  useVozPrefill("propiedad", apply);

  return (
    <>
      <DictarButton kind="propiedad" onApply={apply} />
      {notice && (
        <div
          role="status"
          className="fixed z-40 left-4 right-4 sm:left-auto sm:right-6 bottom-[calc(88px+env(safe-area-inset-bottom))] lg:bottom-6 sm:max-w-sm rounded-2xl border px-4 py-3 bg-white"
          style={{ borderColor: "#DDD8CF", boxShadow: "var(--shadow-pop)" }}
        >
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                Completé {notice.count} {notice.count === 1 ? "campo" : "campos"} con lo dictado
              </p>
              <p className="text-xs mt-0.5" style={{ color: "#374151" }}>
                Revisalos en el formulario. No se guardó nada todavía.
              </p>
              {notice.notes.length > 0 && (
                <>
                  <p className="text-xs mt-2" style={{ color: "#78350F", fontWeight: 700 }}>
                    Sin campo (cargalo a mano si hace falta):
                  </p>
                  <ul className="text-xs list-disc pl-4" style={{ color: "#78350F" }}>
                    {notice.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Cerrar aviso"
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-violet-50 flex-shrink-0"
              style={{ color: "#6B7280", fontSize: 18, lineHeight: 1 }}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </>
  );
}
