import { useId, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { FilterTabs } from "@/components/ui/FilterTabs";
import { money, PROPERTY_TYPE_LABEL } from "@/lib/format";
import { computeZoneStats, MIN_MARKET_SAMPLE, type MarketPoint } from "@/lib/market";
import type { OperationType, PropertyType } from "@/types/db";
import { ZoneRangeChart } from "./ZoneRangeChart";

const OPERATIONS: { value: OperationType; label: string }[] = [
  { value: "venta", label: "Venta" },
  { value: "alquiler", label: "Alquiler" },
  { value: "alquiler_temporal", label: "Temporario" },
];
const TYPES = Object.keys(PROPERTY_TYPE_LABEL) as PropertyType[];

/**
 * Estadísticas por zona × tipo × operación, con la fuente de cada número.
 * Sin tendencia: los datos son las publicaciones activas hoy (no hay
 * histórico de precios), así que una "evolución" sería inventada.
 */
export function ZoneStats({ pool, appAvailable }: { pool: MarketPoint[]; appAvailable: boolean }) {
  const ids = useId();
  const [operation, setOperation] = useState<OperationType>("venta");
  const [type, setType] = useState<PropertyType | "todos">("todos");

  const filtered = useMemo(
    () => pool.filter((p) => p.operation === operation && (type === "todos" || p.type === type)),
    [pool, operation, type],
  );
  const stats = useMemo(() => computeZoneStats(filtered), [filtered]);
  const crm = filtered.filter((p) => p.source === "crm").length;
  const app = filtered.length - crm;
  const unit = operation === "venta" ? "" : " por mes";

  return (
    <section aria-labelledby="zonas-title">
      <Card>
        <div className="px-5 py-4 border-b" style={{ borderColor: "#F0EDE6" }}>
          <h2 id="zonas-title" className="text-base" style={{ color: "#1A1A1A", fontWeight: 800 }}>
            Estadísticas por zona
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
            Publicaciones activas hoy, agrupadas por zona y tipo. Solo precios en USD{unit}.
          </p>
        </div>

        <div className="px-5 pt-4 flex flex-wrap items-center gap-3">
          <div className="overflow-x-auto max-w-full">
            <FilterTabs options={OPERATIONS} value={operation} onChange={setOperation} />
          </div>
          <label htmlFor={`${ids}-type`} className="sr-only">
            Tipo de propiedad
          </label>
          <select
            id={`${ids}-type`}
            value={type}
            onChange={(e) => setType(e.target.value as PropertyType | "todos")}
            className="min-h-11 px-3 rounded-xl text-sm border bg-white outline-none focus:border-[#9B21FF] focus:ring-4 focus:ring-[#E9E5DE]"
            style={{ borderColor: "#E9E5DE", color: "#1A1A1A" }}
          >
            <option value="todos">Todos los tipos</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {PROPERTY_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          <span className="text-xs" style={{ color: "#6B7280" }}>
            {filtered.length} publicaciones: {crm} de tu inventario · {app} de la app PropMatch
            {!appAvailable && " (app no disponible)"}
          </span>
        </div>

        <div className="p-5 space-y-6">
          {stats.length === 0 ? (
            <p className="text-sm rounded-xl px-4 py-3" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", color: "#475569" }}>
              No hay publicaciones activas en USD con zona cargada para este filtro.
            </p>
          ) : (
            <>
              <div>
                <h3 className="text-xs uppercase mb-3" style={{ color: "#6B7280", fontWeight: 700, letterSpacing: "0.1em" }}>
                  Rango de precios por zona (USD{unit})
                </h3>
                <ZoneRangeChart stats={stats} />
              </div>
              <StatsTable stats={stats} unit={unit} />
            </>
          )}

          <ul className="text-xs space-y-1 list-disc pl-5" style={{ color: "#6B7280" }}>
            <li>
              Rango P25–P75 solo con {MIN_MARKET_SAMPLE} o más publicaciones; con menos se muestra la mediana y la cantidad, sin rango.
            </li>
            <li>USD/m²: solo publicaciones con superficie cargada (la app no guarda m², así que sale de tu inventario), y con {MIN_MARKET_SAMPLE} o más.</li>
            <li>Se excluyen precios en ARS: sin un tipo de cambio cargado no se convierten. Las de la app vinculadas a tu inventario se cuentan una vez.</li>
            <li>Sin tendencia: son las publicaciones activas hoy y no hay histórico de precios para comparar períodos.</li>
          </ul>
        </div>
      </Card>
    </section>
  );
}

function StatsTable({ stats, unit }: { stats: ReturnType<typeof computeZoneStats>; unit: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "#F0EDE6" }}>
      <table className="w-full text-sm min-w-[640px]">
        <caption className="sr-only">Estadísticas de precios en USD{unit} por zona y tipo, con la fuente de cada fila</caption>
        <thead>
          <tr className="text-xs text-left" style={{ color: "#6B7280", background: "#FAF8F5" }}>
            <th scope="col" className="px-3 py-2.5 font-bold">Zona</th>
            <th scope="col" className="px-3 py-2.5 font-bold">Tipo</th>
            <th scope="col" className="px-3 py-2.5 font-bold text-right">Activas</th>
            <th scope="col" className="px-3 py-2.5 font-bold text-right">Mediana</th>
            <th scope="col" className="px-3 py-2.5 font-bold text-right">Rango P25–P75</th>
            <th scope="col" className="px-3 py-2.5 font-bold text-right">USD/m² mediano</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s) => (
            <tr key={s.key} className="border-t" style={{ borderColor: "#F0EDE6" }}>
              <th scope="row" className="px-3 py-2.5 text-left font-semibold" style={{ color: "#1A1A1A" }}>
                {s.zone}
              </th>
              <td className="px-3 py-2.5" style={{ color: "#374151" }}>{PROPERTY_TYPE_LABEL[s.type]}</td>
              <td className="px-3 py-2.5 text-right" style={{ color: "#374151" }}>
                <span style={{ color: "#1A1A1A", fontWeight: 700 }}>{s.count}</span>
                <span className="block text-xs" style={{ color: "#6B7280" }}>
                  {[s.crmCount ? `${s.crmCount} inventario` : null, s.appCount ? `${s.appCount} app` : null].filter(Boolean).join(" · ")}
                </span>
              </td>
              <td className="px-3 py-2.5 text-right whitespace-nowrap" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                {money(s.median)}
              </td>
              <td className="px-3 py-2.5 text-right whitespace-nowrap" style={{ color: "#374151" }}>
                {s.p25 != null ? (
                  `${money(s.p25)} – ${money(s.p75)}`
                ) : (
                  <span className="text-xs" style={{ color: "#6B7280" }}>Pocos datos</span>
                )}
              </td>
              <td className="px-3 py-2.5 text-right whitespace-nowrap" style={{ color: "#374151" }}>
                {s.pricePerM2 != null ? (
                  money(s.pricePerM2)
                ) : (
                  <span className="text-xs" style={{ color: "#6B7280" }}>
                    {s.withSurface === 0 ? "Sin m²" : `Solo ${s.withSurface} con m²`}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
