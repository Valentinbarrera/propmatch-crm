import { Link } from "react-router-dom";
import { SampleBadge } from "@/components/ui/SampleBadge";
import { Card } from "@/components/ui/Card";
import { money, OPERATION_LABEL, PROPERTY_TYPE_LABEL } from "@/lib/format";
import type { PortfolioRow } from "@/lib/market";
import { formatPct, type PropertyDiagnostic } from "@/lib/propertyDiagnostic";
import { POSITIONING, ToneChip } from "@/features/propiedades/diagnostico/ui";

function Positioning({ d }: { d: PropertyDiagnostic }) {
  const { positioning, diffVsRange } = d.price;
  if (!positioning) {
    const n = d.comparables.length;
    return (
      <ToneChip tone="sin_datos">
        {d.price.current == null ? "Sin precio" : `Pocos comparables (${n})`}
      </ToneChip>
    );
  }
  return (
    <ToneChip tone={POSITIONING[positioning].tone}>
      {POSITIONING[positioning].label}
      {positioning !== "dentro" && diffVsRange != null && <> · {formatPct(diffVsRange)} vs rango</>}
    </ToneChip>
  );
}

const range = (d: PropertyDiagnostic) =>
  d.price.showRange ? `${money(d.price.p25, d.currency)} – ${money(d.price.p75, d.currency)}` : "—";
const days = (d: PropertyDiagnostic) => (d.demand.daysPublished != null ? `${d.demand.daysPublished} d` : "—");
const score = (d: PropertyDiagnostic) => (d.score.value != null ? String(d.score.value) : "Sin datos");

function DiagLink({ id, title }: { id: string; title: string }) {
  return (
    <Link
      to={`/propiedades/${id}#diagnostico`}
      className="inline-flex items-center min-h-11 px-3 rounded-xl text-xs hover:bg-violet-50 whitespace-nowrap"
      style={{ color: "#7C0BD8", fontWeight: 700 }}
      aria-label={`Ver diagnóstico de ${title}`}
    >
      Ver diagnóstico →
    </Link>
  );
}

/** Tus propiedades disponibles frente a sus comparables, las más desfasadas primero. */
export function Cartera({ rows }: { rows: PortfolioRow[] }) {
  const off = rows.filter((r) => r.diagnostic.price.positioning && r.diagnostic.price.positioning !== "dentro").length;

  return (
    <section aria-labelledby="cartera-title">
      <Card>
        <div className="px-5 py-4 border-b" style={{ borderColor: "#F0EDE6" }}>
          <h2 id="cartera-title" className="text-base" style={{ color: "#1A1A1A", fontWeight: 800 }}>
            Tu cartera vs. el mercado
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
            {rows.length} disponibles · {off} fuera del rango competitivo. Mismo cálculo que el diagnóstico de cada ficha; primero las más
            desfasadas.
          </p>
        </div>

        {rows.length === 0 ? (
          <p className="m-5 text-sm rounded-xl px-4 py-3" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", color: "#475569" }}>
            No tenés propiedades disponibles para comparar.
          </p>
        ) : (
          <>
            {/* Escritorio */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Tus propiedades disponibles con su posicionamiento de precio, ordenadas de más a menos desfasadas</caption>
                <thead>
                  <tr className="text-xs text-left" style={{ color: "#6B7280", background: "#FAF8F5" }}>
                    <th scope="col" className="px-5 py-2.5 font-bold">Propiedad</th>
                    <th scope="col" className="px-3 py-2.5 font-bold text-right">Precio</th>
                    <th scope="col" className="px-3 py-2.5 font-bold text-right">Rango P25–P75</th>
                    <th scope="col" className="px-3 py-2.5 font-bold">Posicionamiento</th>
                    <th scope="col" className="px-3 py-2.5 font-bold text-right">Score</th>
                    <th scope="col" className="px-3 py-2.5 font-bold text-right">Publicada</th>
                    <th scope="col" className="px-3 py-2.5"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ property: p, diagnostic: d }) => (
                    <tr key={p.id} className="border-t" style={{ borderColor: "#F0EDE6" }}>
                      <th scope="row" className="px-5 py-2.5 text-left font-normal min-w-0">
                        <Link to={`/propiedades/${p.id}`} className="hover:underline" style={{ color: "#1A1A1A", fontWeight: 600 }}>
                          {p.title} <SampleBadge record={p} />
                        </Link>
                        <span className="block text-xs" style={{ color: "#6B7280" }}>
                          {[p.zone ?? p.locality, PROPERTY_TYPE_LABEL[p.type], OPERATION_LABEL[p.operation]].filter(Boolean).join(" · ")}
                        </span>
                      </th>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                        {money(p.price, p.currency)}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap" style={{ color: "#374151" }}>{range(d)}</td>
                      <td className="px-3 py-2.5"><Positioning d={d} /></td>
                      <td className="px-3 py-2.5 text-right" style={{ color: "#1A1A1A", fontWeight: 700 }}>{score(d)}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap" style={{ color: "#374151" }}>{days(d)}</td>
                      <td className="px-3 py-2.5 text-right"><DiagLink id={p.id} title={p.title} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Celular */}
            <ul className="md:hidden p-4 space-y-2">
              {rows.map(({ property: p, diagnostic: d }) => (
                <li key={p.id} className="rounded-xl p-3 border" style={{ borderColor: "#F0EDE6", background: "#FAF8F5" }}>
                  <Link to={`/propiedades/${p.id}`} className="hover:underline" style={{ color: "#1A1A1A", fontWeight: 600 }}>
                    {p.title} <SampleBadge record={p} />
                  </Link>
                  <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
                    {[p.zone ?? p.locality, PROPERTY_TYPE_LABEL[p.type]].filter(Boolean).join(" · ")}
                  </p>
                  <div className="mt-2"><Positioning d={d} /></div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-xs" style={{ color: "#374151" }}>
                    <dt style={{ color: "#6B7280" }}>Precio</dt>
                    <dd className="text-right" style={{ color: "#1A1A1A", fontWeight: 700 }}>{money(p.price, p.currency)}</dd>
                    <dt style={{ color: "#6B7280" }}>Rango P25–P75</dt>
                    <dd className="text-right">{range(d)}</dd>
                    <dt style={{ color: "#6B7280" }}>Score PropMatch</dt>
                    <dd className="text-right">{score(d)}</dd>
                    <dt style={{ color: "#6B7280" }}>Días publicada</dt>
                    <dd className="text-right">{days(d)}</dd>
                  </dl>
                  <div className="mt-1 -mx-3 -mb-1"><DiagLink id={p.id} title={p.title} /></div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </section>
  );
}
