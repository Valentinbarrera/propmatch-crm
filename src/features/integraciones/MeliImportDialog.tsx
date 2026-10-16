/**
 * «Importar mis avisos de Mercado Libre»: trae los avisos de Inmuebles
 * (activos y pausados) de la cuenta conectada de la inmobiliaria, muestra cuáles
 * ya están en el CRM y crea los elegidos como propiedades, con su publicación
 * de ML vinculada (así «Actualizar aviso» edita ESE aviso y no crea otro).
 *
 * Idempotente: un aviso ya vinculado no se vuelve a ofrecer; uno que coincide
 * con una propiedad existente (título + precio + dirección) se ofrece para
 * VINCULAR, no para duplicar. Nunca toca datos de ejemplo.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useStore, isLinkedAgencyId } from "@/data/store";
import { money } from "@/lib/format";
import { saveCrmPublication } from "@/lib/crmPublications";
import { saveExtras } from "@/features/propiedades/MeliPublishPanel";
import { usePublications } from "@/features/propiedades/usePublications";
import { findImportDuplicate, type DuplicateMatch } from "../../../shared/meliImport";
import { integrationsApi, type ImportCandidate, type ImportCursor } from "./api";
import { draftToPropertyInput, importNote, linkedPublicationRow } from "./meliImportPlan";

const INK = "#1A1A1A";
const MUTED = "#6B7280";

const MELI_STATUS_TEXT: Record<string, string> = {
  active: "Activo",
  paused: "Pausado",
  under_review: "En revisión",
  payment_required: "Pendiente de pago",
  inactive: "Inactivo",
};

/** Tope de avisos que se leen en una sesión de importación (evita colgar la pantalla). */
const MAX_LISTINGS = 1000;

type Row = ImportCandidate & { dup: DuplicateMatch | null };

export function MeliImportDialog({ onClose }: { onClose: () => void }) {
  const { properties, agency, profile, addProperty, logActivity } = useStore();
  const { meliRowOf, applyRow } = usePublications();
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [skipped, setSkipped] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ created: number; linked: number; failed: string[]; localOnly: boolean } | null>(null);
  const touched = useRef(false);
  const linked = isLinkedAgencyId(agency.id);

  // Lee todas las páginas (activos y después pausados).
  useEffect(() => {
    if (!linked) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      let cursor: ImportCursor | null = null;
      let first = true;
      let count = 0;
      while (!cancelled && (first || cursor) && count < MAX_LISTINGS) {
        first = false;
        const r = await integrationsApi.meliImportList(cursor);
        if (cancelled) return;
        if (!r.ok) {
          setError(r.message);
          break;
        }
        count += r.data.candidates.length;
        setCandidates((prev) => [...prev, ...r.data.candidates.filter((c) => !prev.some((p) => p.externalId === c.externalId))]);
        setSkipped((s) => s + r.data.skipped);
        cursor = r.data.next;
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [linked]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  // Vínculos que ya existen: publicaciones de ML (base o navegador) con external_id.
  const links = useMemo(
    () =>
      properties.flatMap((p) => {
        const row = meliRowOf(p);
        return row?.external_id ? [{ crmPropertyId: p.id, externalId: row.external_id }] : [];
      }),
    [properties, meliRowOf],
  );

  const rows: Row[] = useMemo(
    () =>
      candidates.map((c) => ({
        ...c,
        dup:
          c.ok && c.draft
            ? findImportDuplicate(
                { externalId: c.externalId, title: c.draft.title, price: c.draft.price, currency: c.draft.currency, street: c.draft.street, street_number: c.draft.street_number },
                properties,
                links,
              )
            : findImportDuplicate({ externalId: c.externalId, title: c.title, price: c.price, currency: c.currency ?? "", street: null, street_number: null }, properties, links),
      })),
    [candidates, properties, links],
  );

  // Por defecto: todo lo importable que no está en el CRM (lo «parecido» se elige a mano).
  useEffect(() => {
    if (touched.current) return;
    setSelected(new Set(rows.filter((r) => r.ok && !r.dup).map((r) => r.externalId)));
  }, [rows]);

  const toggle = (id: string) => {
    touched.current = true;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectable = rows.filter((r) => r.ok && r.dup?.kind !== "linked");
  const chosen = selectable.filter((r) => selected.has(r.externalId));

  const runImport = async () => {
    if (chosen.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    const failed: string[] = [];
    let created = 0;
    let linkedCount = 0;
    let localOnly = false;
    for (let i = 0; i < chosen.length; i += 20) {
      const group = chosen.slice(i, i + 20);
      setProgress(`Importando ${Math.min(i + group.length, chosen.length)} de ${chosen.length}…`);
      // Detalle completo (con descripción) de este lote.
      const det = await integrationsApi.meliImportDetails(group.map((g) => g.externalId));
      if (!det.ok) {
        failed.push(...group.map((g) => `${g.title}: ${det.message}`));
        continue;
      }
      const toLink: { crmPropertyId: string; externalId: string; propertyId: string | null }[] = [];
      for (const g of group) {
        const full = det.data.candidates.find((c) => c.externalId === g.externalId);
        if (!full?.ok || !full.draft) {
          failed.push(`${g.title}: ${full?.reason ?? "no pudimos leer el aviso."}`);
          continue;
        }
        let propertyId: string;
        let appId: string | null = null;
        if (g.dup?.kind === "similar") {
          // Ya existe: se vincula, no se duplica.
          const existing = properties.find((p) => p.id === g.dup!.propertyId);
          if (!existing) continue;
          propertyId = existing.id;
          appId = existing.app_property_id ?? null;
          linkedCount++;
        } else {
          const p = addProperty(draftToPropertyInput(full.draft, profile?.id ?? null));
          propertyId = p.id;
          created++;
          logActivity({
            type: "nota",
            title: "Importada de Mercado Libre",
            detail: importNote(full.externalId, full.unmapped ?? [], full.hasDescription),
            contact_id: null,
            property_id: p.id,
          });
        }
        // Ubicación de ML del aviso: «Actualizar aviso» no pide volver a elegirla.
        if (full.meliLocation) {
          saveExtras(propertyId, { location: full.meliLocation, guests: null, landAccess: null, listingType: "silver" });
        }
        saveCrmPublication(agency.id, propertyId, linkedPublicationRow(agency.id, propertyId, full));
        toLink.push({ crmPropertyId: propertyId, externalId: full.externalId, propertyId: appId });
      }
      if (toLink.length > 0) {
        const r = await integrationsApi.meliImportLink(toLink);
        if (r.ok) {
          for (const x of r.data.results) {
            if (!x.ok) failed.push(`${x.externalId}: ${x.message ?? "no se pudo vincular."}`);
            if (x.row) {
              saveCrmPublication(agency.id, x.crmPropertyId, x.row);
              applyRow(x.row);
            }
            if (x.ok && !x.storedOnServer) localOnly = true;
          }
        } else {
          // El vínculo queda en este navegador; el servidor lo verifica en la próxima acción.
          localOnly = true;
        }
      }
    }
    setProgress(null);
    setBusy(false);
    setSummary({ created, linked: linkedCount, failed, localOnly });
  };

  return (
    <div
      className="pm-backdrop fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
      style={{ background: "rgba(8, 11, 31,0.35)" }}
      onClick={() => !busy && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="meli-import-h"
    >
      <div
        className="pm-modal w-full sm:max-w-2xl max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{ background: "white", boxShadow: "var(--shadow-pop)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b flex items-center gap-3" style={{ borderColor: "#E9E5DE", background: "#FAF8F5" }}>
          <span className="w-9 h-9 rounded-lg flex items-center justify-center text-xs flex-shrink-0" style={{ background: "#FFE600", color: "#1F2937", fontWeight: 800 }}>
            ML
          </span>
          <div className="flex-1 min-w-0">
            <p id="meli-import-h" className="text-lg tracking-tight" style={{ color: INK, fontWeight: 800 }}>
              Importar mis avisos de Mercado Libre
            </p>
            <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
              Avisos de Inmuebles activos y pausados de la cuenta conectada. Elegí cuáles traer al CRM.
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Cerrar" className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-violet-50 disabled:opacity-40" style={{ color: "#6B7280", fontSize: 22 }}>
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-3">
          {!linked && (
            <p className="text-sm px-4 py-3 rounded-xl" style={{ background: "#FFF1F2", color: "#BE123C" }}>
              Tu cuenta no está vinculada a una inmobiliaria: no hay una cuenta de Mercado Libre de dónde importar.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm px-4 py-3 rounded-xl" style={{ background: "#FFF1F2", color: "#BE123C" }}>
              {error}{" "}
              {/conect/i.test(error) && (
                <Link to="/configuracion/integraciones" onClick={onClose} className="underline" style={{ fontWeight: 700 }}>
                  Ir a Integraciones
                </Link>
              )}
            </p>
          )}

          {summary ? (
            <div role="status" className="flex flex-col gap-2">
              <p className="text-sm px-4 py-3 rounded-xl" style={{ background: "#F0FDF4", color: "#15803D", fontWeight: 700 }}>
                {summary.created > 0 && `${summary.created} ${summary.created === 1 ? "propiedad creada" : "propiedades creadas"}. `}
                {summary.linked > 0 && `${summary.linked} ${summary.linked === 1 ? "vinculada" : "vinculadas"} con una propiedad que ya tenías. `}
                {summary.created + summary.linked === 0 && "No se importó nada."}
              </p>
              {summary.localOnly && (
                <p className="text-xs px-3 py-2 rounded-lg" style={{ background: "#FFFBEB", color: "#92400E" }}>
                  El vínculo con cada aviso quedó guardado en este navegador. Para que el resto del equipo lo vea, hay que aplicar la
                  migración de publicaciones solo-CRM (docs/integraciones-multitenant.md).
                </p>
              )}
              {summary.failed.length > 0 && (
                <div className="text-xs px-3 py-2 rounded-lg" style={{ background: "#FFF1F2", color: "#BE123C" }}>
                  <p style={{ fontWeight: 700 }}>No se pudieron importar:</p>
                  <ul className="list-disc pl-4 mt-1">{summary.failed.map((f, i) => <li key={i}>{f}</li>)}</ul>
                </div>
              )}
              <p className="text-xs" style={{ color: MUTED }}>
                Las propiedades en dólares se sincronizan con la app como cualquier carga manual. Revisalas en Propiedades: lo que el
                aviso tenía y la ficha no modela quedó como nota en su historial.
              </p>
            </div>
          ) : (
            <>
              {loading && (
                <p className="text-sm" style={{ color: MUTED }} role="status">
                  Leyendo tus avisos de Mercado Libre… {candidates.length > 0 && `(${candidates.length} hasta ahora)`}
                </p>
              )}
              {!loading && linked && !error && rows.length === 0 && (
                <p className="text-sm" style={{ color: MUTED }}>No encontramos avisos de Inmuebles activos ni pausados en la cuenta conectada.</p>
              )}
              {skipped > 0 && (
                <p className="text-xs" style={{ color: MUTED }}>
                  {skipped} {skipped === 1 ? "aviso no es" : "avisos no son"} de Inmuebles: no se muestran.
                </p>
              )}
              {rows.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {rows.map((r) => {
                    const inCrm = r.dup?.kind === "linked";
                    const canPick = r.ok && !inCrm && !busy;
                    const id = `ml-imp-${r.externalId}`;
                    const similar = r.dup?.kind === "similar" ? properties.find((p) => p.id === r.dup!.propertyId) : null;
                    return (
                      <li key={r.externalId} className="rounded-xl border p-3 flex items-start gap-3" style={{ borderColor: selected.has(r.externalId) && canPick ? "#D4AAFF" : "#E9E5DE", opacity: r.ok ? 1 : 0.75 }}>
                        <input
                          id={id}
                          type="checkbox"
                          disabled={!canPick}
                          checked={canPick && selected.has(r.externalId)}
                          onChange={() => toggle(r.externalId)}
                          className="w-5 h-5 mt-1 cursor-pointer disabled:cursor-not-allowed"
                          style={{ accentColor: "#9B21FF" }}
                        />
                        <div className="w-16 h-12 rounded-lg overflow-hidden flex-shrink-0" style={{ background: "#F7F0FF" }}>
                          {r.thumbnail && <img src={r.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <label htmlFor={id} className="block text-sm truncate" style={{ color: INK, fontWeight: 700 }}>{r.title || r.externalId}</label>
                          <p className="text-xs" style={{ color: MUTED }}>
                            {[
                              r.price != null && (r.currency === "ARS" || r.currency === "USD") ? money(r.price, r.currency) : r.price != null ? `${r.currency ?? ""} ${r.price}` : null,
                              MELI_STATUS_TEXT[r.meliStatus ?? ""] ?? r.meliStatus,
                              r.externalId,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                            {r.permalink && (
                              <>
                                {" · "}
                                <a href={r.permalink} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "#9B21FF" }}>
                                  Ver aviso
                                </a>
                              </>
                            )}
                          </p>
                          {inCrm && <p className="text-xs mt-1" style={{ color: "#15803D", fontWeight: 700 }}>Ya está en el CRM.</p>}
                          {similar && (
                            <p className="text-xs mt-1" style={{ color: "#92400E" }}>
                              Parece la misma que «{similar.title}». Si la marcás, se vincula con esa (no se crea otra).
                            </p>
                          )}
                          {!r.ok && <p className="text-xs mt-1" style={{ color: "#BE123C" }}>No se puede importar: {r.reason}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t flex flex-wrap gap-2 items-center" style={{ borderColor: "#E9E5DE" }}>
          {summary ? (
            <button type="button" onClick={onClose} className="min-h-[44px] px-5 rounded-xl text-sm text-white" style={{ background: "var(--gradient-brand)", fontWeight: 700 }}>
              Listo
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void runImport()}
                disabled={busy || loading || chosen.length === 0}
                className="min-h-[44px] px-5 rounded-xl text-sm text-white disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "var(--gradient-brand)", fontWeight: 700 }}
              >
                {busy ? progress ?? "Importando…" : `Importar seleccionados (${chosen.length})`}
              </button>
              {selectable.length > 0 && !busy && (
                <button
                  type="button"
                  onClick={() => {
                    touched.current = true;
                    setSelected(chosen.length === selectable.length ? new Set() : new Set(selectable.map((r) => r.externalId)));
                  }}
                  className="min-h-[44px] px-4 rounded-xl text-sm border bg-white"
                  style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 700 }}
                >
                  {chosen.length === selectable.length ? "Desmarcar todos" : "Marcar todos"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Botón que abre el importador (Integraciones y Propiedades). */
export function MeliImportButton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className} style={style}>
        Importar mis avisos de Mercado Libre
      </button>
      {open && <MeliImportDialog onClose={() => setOpen(false)} />}
    </>
  );
}
