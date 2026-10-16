import { useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card } from "@/components/ui/Card";
import { useStore } from "@/data/store";
import { downloadCsv } from "@/lib/csv";
import {
  CONTACT_FIELDS,
  CONTACT_TEMPLATE,
  PROPERTY_FIELDS,
  PROPERTY_TEMPLATE,
  autoMap,
  buildContactDrafts,
  buildPropertyDrafts,
  readSheet,
  type Draft,
  type Mapping,
  type Sheet,
} from "@/lib/importer";

/**
 * Importar contactos o propiedades desde Excel / CSV.
 *
 * Tres pasos: subir el archivo, revisar qué columna es qué (se adivina solo,
 * se corrige si hace falta) y confirmar viendo fila por fila qué entra, qué
 * tiene errores y qué parece repetido. Se puede deshacer al terminar.
 */

type Kind = "contactos" | "propiedades";
type Step = "archivo" | "revisar" | "listo";

const MAX_ROWS = 5000;

export default function ImportarPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const kind: Kind = params.get("tipo") === "propiedades" ? "propiedades" : "contactos";
  const { contacts, properties, profiles, profile, agency, importContacts, importProperties, undoImport, photos, replacePropertyPhotos, updateProperty } = useStore();

  const [step, setStep] = useState<Step>("archivo");
  const [fileName, setFileName] = useState("");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [agentId, setAgentId] = useState(profile.id);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<{ ids: string[]; skipped: number; photosFilled?: number; roomsFilled?: number } | null>(null);
  const [undone, setUndone] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const fields = kind === "contactos" ? CONTACT_FIELDS : PROPERTY_FIELDS;
  const label = kind === "contactos" ? "contactos" : "propiedades";

  function reset(nextKind?: Kind) {
    setStep("archivo");
    setSheet(null);
    setFileName("");
    setError(null);
    setResult(null);
    setUndone(false);
    if (nextKind) setParams({ tipo: nextKind }, { replace: true });
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!/\.(xlsx|xls|csv|txt|ods)$/i.test(file.name)) {
      setError("Subí un archivo de Excel (.xlsx, .xls) o CSV.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const s = await readSheet(file);
      if (!s.headers.length || !s.rows.length) {
        setError("El archivo está vacío o no tiene filas debajo de los encabezados.");
        return;
      }
      if (s.rows.length > MAX_ROWS) {
        setError(`El archivo tiene ${s.rows.length} filas. Por ahora el máximo es ${MAX_ROWS}: dividilo en partes.`);
        return;
      }
      setSheet(s);
      setFileName(file.name);
      setMapping(autoMap(s.headers, fields));
      setStep("revisar");
    } catch {
      setError("No pudimos leer el archivo. Si es un Excel viejo, probá guardarlo como .xlsx o CSV.");
    } finally {
      setLoading(false);
    }
  }

  const drafts: Draft<unknown>[] = useMemo(() => {
    if (!sheet) return [];
    return kind === "contactos"
      ? buildContactDrafts(sheet, mapping, contacts, agentId)
      : buildPropertyDrafts(sheet, mapping, properties, agentId, agency.province ?? "Buenos Aires");
  }, [sheet, mapping, kind, contacts, properties, agentId, agency.province]);

  const importable = drafts.filter((d) => d.input && !(skipDuplicates && d.duplicate));
  const withErrors = drafts.filter((d) => !d.input).length;
  const duplicates = drafts.filter((d) => d.input && d.duplicate).length;
  const missingRequired = fields.filter((f) => f.required && (mapping[f.key] ?? -1) < 0);

  function doImport() {
    const inputs = importable.map((d) => d.input);
    const ids =
      kind === "contactos"
        ? importContacts(inputs as Parameters<typeof importContacts>[0])
        : importProperties(inputs as Parameters<typeof importProperties>[0]);
    // Repetidos de algo ya cargado que quedó sin fotos (p. ej. una importación anterior
    // que no las tomó): se completan las fotos en vez de duplicar la propiedad.
    // Igual con los ambientes: si el archivo los trae y la propiedad cargada no
    // los tiene, se completan (no se pisa un dato que ya está).
    let photosFilled = 0;
    let roomsFilled = 0;
    if (kind === "propiedades") {
      for (const d of drafts) {
        const input = d.input as { photos?: string[]; rooms?: number; bedrooms?: number } | null;
        if (!d.existingId || !input) continue;
        if (input.photos?.length && (photos[d.existingId] ?? []).length === 0) {
          replacePropertyPhotos(d.existingId, input.photos);
          photosFilled++;
        }
        const existing = properties.find((p) => p.id === d.existingId);
        if (existing && input.rooms && (existing.rooms === null || existing.rooms === undefined)) {
          updateProperty(d.existingId, {
            rooms: input.rooms,
            ...(!existing.bedrooms && input.bedrooms ? { bedrooms: input.bedrooms } : {}),
          });
          roomsFilled++;
        }
      }
    }
    setResult({ ids, skipped: drafts.length - ids.length, photosFilled, roomsFilled });
    setStep("listo");
  }

  function downloadTemplate() {
    downloadCsv(`plantilla-${label}`, kind === "contactos" ? CONTACT_TEMPLATE : PROPERTY_TEMPLATE);
  }

  return (
    <>
      <AppHeader
        title="Importar desde Excel"
        breadcrumb={[kind === "contactos" ? "Contactos" : "Propiedades", "Importar"]}
        subtitle="Traé tu cartera desde una planilla, Tokko u otro CRM."
        compact
      />

      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-10">
        {/* Pasos */}
        <div className="mt-8 flex flex-wrap items-center gap-3">
          {(["contactos", "propiedades"] as Kind[]).map((k) => (
            <button
              key={k}
              onClick={() => reset(k)}
              disabled={step === "listo" && !undone && k !== kind}
              className="px-4 py-2 rounded-xl text-sm border transition-all disabled:opacity-40"
              style={
                k === kind
                  ? { background: "#1A1A1A", color: "white", borderColor: "transparent", fontWeight: 600 }
                  : { background: "white", color: "#6B7280", borderColor: "#E9E5DE", fontWeight: 500 }
              }
            >
              {k === "contactos" ? "Contactos" : "Propiedades"}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 text-xs" style={{ color: "#6B7280", fontWeight: 600 }}>
            {(["archivo", "revisar", "listo"] as Step[]).map((s, i) => (
              <span key={s} className="flex items-center gap-2">
                {i > 0 && <span style={{ color: "#DDD8CF" }}>→</span>}
                <span style={s === step ? { color: "#9B21FF", fontWeight: 800 } : undefined}>
                  {i + 1}. {s === "archivo" ? "Archivo" : s === "revisar" ? "Revisar" : "Listo"}
                </span>
              </span>
            ))}
          </div>
        </div>

        {step === "archivo" && (
          <div className="pm-enter mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <Card>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  handleFile(e.dataTransfer.files[0]);
                }}
                onClick={() => input.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
                className="m-5 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center text-center px-6 py-16 cursor-pointer transition-all"
                style={{ borderColor: dragOver ? "#BF7FFF" : "#DDD8CF", background: dragOver ? "#F7F0FF" : "#FAF8F5" }}
              >
                <p className="text-4xl">📄</p>
                <p className="text-base mt-3" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                  {loading ? "Leyendo archivo…" : `Arrastrá el Excel con tus ${label}`}
                </p>
                <p className="text-sm mt-1" style={{ color: "#6B7280" }}>
                  o hacé click para elegirlo · .xlsx, .xls o .csv
                </p>
                <input
                  ref={input}
                  type="file"
                  accept=".xlsx,.xls,.csv,.txt,.ods"
                  className="hidden"
                  onChange={(e) => {
                    handleFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>
              {error && (
                <p className="mx-5 mb-5 text-sm px-4 py-3 rounded-xl" style={{ background: "#FFF1F2", color: "#BE123C", fontWeight: 600 }}>
                  {error}
                </p>
              )}
            </Card>

            <Card padded>
              <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                ¿Cómo tiene que estar el archivo?
              </p>
              <ul className="text-sm mt-3 space-y-2" style={{ color: "#374151" }}>
                <li>• Una fila por {kind === "contactos" ? "contacto" : "propiedad"}, con encabezados en la primera fila.</li>
                <li>• Los nombres de las columnas pueden ser los tuyos: los reconocemos y después los podés corregir.</li>
                <li>
                  • Obligatorio:{" "}
                  <strong>
                    {fields
                      .filter((f) => f.required)
                      .map((f) => f.label.toLowerCase())
                      .join(" y ")}
                  </strong>
                  .
                </li>
                {kind === "contactos" ? (
                  <li>• Si cargás qué busca (tipo, zona, presupuesto), el contacto ya entra al matching.</li>
                ) : (
                  <li>• Precios como vengan: “u$s 185.000”, “$ 450.000” o “185000”.</li>
                )}
              </ul>
              <button
                onClick={downloadTemplate}
                className="mt-5 w-full py-2.5 rounded-xl text-sm border transition-all hover:bg-violet-50"
                style={{ borderColor: "#E9E5DE", color: "#9B21FF", fontWeight: 600, background: "white" }}
              >
                Descargar plantilla de ejemplo
              </button>
            </Card>
          </div>
        )}

        {step === "revisar" && sheet && (
          <div className="pm-enter mt-6 space-y-6">
            <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
              {/* Mapeo */}
              <Card>
                <div className="px-5 py-4 border-b" style={{ borderColor: "#F0EDE6" }}>
                  <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                    Columnas de {fileName}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
                    {sheet.rows.length} filas · corregí lo que no esté bien
                  </p>
                </div>
                <div className="p-5 space-y-3 max-h-[560px] overflow-y-auto">
                  {fields.map((f) => {
                    const col = mapping[f.key] ?? -1;
                    const sample = col >= 0 ? sheet.rows.find((r) => r[col])?.[col] : undefined;
                    return (
                      <label key={f.key} className="block">
                        <span className="flex items-center justify-between text-xs mb-1" style={{ color: "#6B7280", fontWeight: 600 }}>
                          <span>
                            {f.label}
                            {f.required && <span style={{ color: "#E11D48" }}> *</span>}
                          </span>
                          {sample && (
                            <span className="truncate ml-3 max-w-[160px]" style={{ color: "#6B7280", fontWeight: 500 }}>
                              ej: {sample}
                            </span>
                          )}
                        </span>
                        <select
                          value={col}
                          onChange={(e) => setMapping((m) => ({ ...m, [f.key]: Number(e.target.value) }))}
                          className="w-full px-3 py-2 rounded-xl text-sm border outline-none bg-white text-[#1A1A1A] focus:border-[#9B21FF] focus-visible:ring-2 focus-visible:ring-[#9B21FF]"
                          style={{ borderColor: f.required && col < 0 ? "#FECDD3" : col >= 0 ? "#D4AAFF" : "#E9E5DE" }}
                        >
                          <option value={-1}>— No importar —</option>
                          {sheet.headers.map((h, i) => (
                            <option key={i} value={i}>
                              {h || `Columna ${i + 1}`}
                            </option>
                          ))}
                        </select>
                        {f.hint && col < 0 && (
                          <span className="block text-xs mt-1" style={{ color: "#6B7280" }}>
                            {f.hint}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </Card>

              {/* Vista previa */}
              <Card>
                <div className="px-5 py-4 border-b flex flex-wrap items-center gap-3" style={{ borderColor: "#F0EDE6" }}>
                  <Stat value={importable.length} label="se importan" color="#15803D" />
                  <Stat value={withErrors} label="con errores (se omiten)" color="#E11D48" />
                  <Stat value={duplicates} label="posibles repetidos" color="#B45309" />
                  <label className="ml-auto flex items-center gap-2 text-xs cursor-pointer" style={{ color: "#374151", fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={skipDuplicates}
                      onChange={(e) => setSkipDuplicates(e.target.checked)}
                      className="accent-[#9B21FF]"
                    />
                    Omitir repetidos
                  </label>
                </div>
                <div className="max-h-[520px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0" style={{ background: "#FAF8F5" }}>
                      <tr className="text-left text-xs" style={{ color: "#6B7280" }}>
                        <th className="px-4 py-2.5 font-semibold">Fila</th>
                        <th className="px-4 py-2.5 font-semibold">{kind === "contactos" ? "Contacto" : "Propiedad"}</th>
                        <th className="px-4 py-2.5 font-semibold">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drafts.slice(0, 300).map((d) => (
                        <DraftRow key={d.row} draft={d} kind={kind} skipDuplicates={skipDuplicates} />
                      ))}
                    </tbody>
                  </table>
                  {drafts.length > 300 && (
                    <p className="px-4 py-3 text-xs" style={{ color: "#6B7280" }}>
                      Se muestran las primeras 300 filas de {drafts.length}.
                    </p>
                  )}
                </div>
              </Card>
            </div>

            <div
              className="flex flex-wrap items-center gap-3 rounded-2xl px-5 py-4 border"
              style={{ borderColor: "#E9E5DE", background: "white" }}
            >
              <label className="flex items-center gap-2 text-sm" style={{ color: "#374151", fontWeight: 600 }}>
                Asignar a
                <select
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  className="px-3 py-2 rounded-xl text-sm border outline-none bg-white text-[#1A1A1A] border-[#E9E5DE] focus:border-[#9B21FF] focus-visible:ring-2 focus-visible:ring-[#9B21FF]"
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              </label>
              {missingRequired.length > 0 && (
                <span className="text-sm" style={{ color: "#E11D48", fontWeight: 600 }}>
                  Elegí la columna de: {missingRequired.map((f) => f.label.toLowerCase()).join(", ")}
                </span>
              )}
              <div className="ml-auto flex gap-3">
                <button
                  onClick={() => reset()}
                  className="px-5 py-2.5 rounded-xl text-sm border transition-all hover:bg-violet-50"
                  style={{ borderColor: "#E9E5DE", color: "#6B7280", fontWeight: 600, background: "white" }}
                >
                  Elegir otro archivo
                </button>
                <button
                  onClick={doImport}
                  disabled={importable.length === 0 || missingRequired.length > 0}
                  className="px-6 py-2.5 rounded-xl text-sm text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-40"
                  style={{ background: "var(--gradient-brand)", fontWeight: 700, boxShadow: "var(--shadow-cta)" }}
                >
                  Importar {importable.length} {label}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === "listo" && result && (
          <div className="pm-enter mt-10 max-w-xl mx-auto text-center">
            <p className="text-5xl">{undone ? "↩︎" : "✅"}</p>
            <p className="text-2xl mt-4 tracking-tight" style={{ color: "#1A1A1A", fontWeight: 800 }}>
              {undone ? "Importación deshecha" : `Se importaron ${result.ids.length} ${label}${result.photosFilled ? ` · se completaron las fotos de ${result.photosFilled} que ya estaban` : ""}${result.roomsFilled ? ` · se completaron los ambientes de ${result.roomsFilled}` : ""}`}
            </p>
            <p className="text-sm mt-2" style={{ color: "#6B7280" }}>
              {undone
                ? "No quedó nada de ese archivo en el CRM."
                : result.skipped
                  ? `${result.skipped} ${result.skipped === 1 ? "fila quedó afuera" : "filas quedaron afuera"} por errores o por estar repetidas.`
                  : "Entraron todas las filas."}
              {!undone && " Los matches ya se calcularon."}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {!undone && (
                <button
                  onClick={() => navigate(kind === "contactos" ? "/contactos" : "/propiedades")}
                  className="px-6 py-2.5 rounded-xl text-sm text-white"
                  style={{ background: "var(--gradient-brand)", fontWeight: 700 }}
                >
                  Ver {label}
                </button>
              )}
              {!undone && (
                <button
                  onClick={() => {
                    undoImport(kind === "contactos" ? { contacts: result.ids } : { properties: result.ids });
                    setUndone(true);
                  }}
                  className="px-5 py-2.5 rounded-xl text-sm border transition-all hover:bg-rose-50"
                  style={{ borderColor: "#FECDD3", color: "#E11D48", fontWeight: 600, background: "white" }}
                >
                  Deshacer importación
                </button>
              )}
              <button
                onClick={() => reset()}
                className="px-5 py-2.5 rounded-xl text-sm border transition-all hover:bg-violet-50"
                style={{ borderColor: "#E9E5DE", color: "#9B21FF", fontWeight: 600, background: "white" }}
              >
                Importar otro archivo
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function Stat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <span className="text-sm" style={{ color: "#374151" }}>
      <strong style={{ color, fontWeight: 800 }}>{value}</strong> {label}
    </span>
  );
}

function DraftRow({ draft, kind, skipDuplicates }: { draft: Draft<unknown>; kind: Kind; skipDuplicates: boolean }) {
  const input = draft.input as Record<string, unknown> | null;
  const name = input
    ? kind === "contactos"
      ? String(input.full_name)
      : String(input.title)
    : "—";
  const sub = input
    ? kind === "contactos"
      ? [input.phone, input.email, input.requirement ? "con búsqueda" : null].filter(Boolean).join(" · ")
      : [
          input.price !== null ? `${input.currency} ${Number(input.price).toLocaleString("es-AR")}` : null,
          input.locality,
          input.operation,
        ]
          .filter(Boolean)
          .join(" · ")
    : "";

  let status: { text: string; color: string; bg: string };
  if (!input) status = { text: draft.errors.join(" · "), color: "#BE123C", bg: "#FFF1F2" };
  else if (draft.duplicate)
    status = {
      text: `${skipDuplicates ? "Se omite: " : ""}parece repetido (${draft.duplicate})`,
      color: "#B45309",
      bg: "#FFFBEB",
    };
  else if (draft.warnings.length) status = { text: `Entra · ${draft.warnings.join(" · ")}`, color: "#6B7280", bg: "#FAF8F5" };
  else status = { text: "Entra", color: "#15803D", bg: "#F0FDF4" };

  return (
    <tr className="border-t" style={{ borderColor: "#F7F0FF" }}>
      <td className="px-4 py-2.5 text-xs align-top" style={{ color: "#6B7280" }}>
        {draft.row}
      </td>
      <td className="px-4 py-2.5 align-top">
        <p className="truncate max-w-[280px]" style={{ color: "#1A1A1A", fontWeight: 600 }}>
          {name}
        </p>
        {sub && (
          <p className="text-xs truncate max-w-[280px]" style={{ color: "#6B7280" }}>
            {sub}
          </p>
        )}
      </td>
      <td className="px-4 py-2.5 align-top">
        <span className="inline-block text-xs px-2.5 py-1 rounded-lg" style={{ background: status.bg, color: status.color, fontWeight: 600 }}>
          {status.text}
        </span>
      </td>
    </tr>
  );
}
