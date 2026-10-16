import { useState } from "react";
import { money, moneyCompact, PROPERTY_TYPE_LABEL } from "@/lib/format";
import { MIN_MARKET_SAMPLE, type ZoneStat } from "@/lib/market";

const MAX_ROWS = 12;

/** Ticks "redondos" (1, 2, 2,5, 5 × 10^n) entre lo y hi. */
function niceTicks(lo: number, hi: number, count = 4): number[] {
  const span = hi - lo || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const start = Math.floor(lo / step) * step;
  const out: number[] = [];
  for (let v = start; v <= hi + step * 0.001; v += step) out.push(v);
  if (out[out.length - 1] < hi) out.push(out[out.length - 1] + step);
  return out;
}

const rowLabel = (s: ZoneStat) => `${s.zone} · ${PROPERTY_TYPE_LABEL[s.type]}`;

/**
 * Rango P25–P75 (banda) y mediana (punto) por zona y tipo, en una escala
 * común. Una sola serie: el título dice qué es y la clave muestra banda y
 * punto. Cada fila es enfocable y muestra sus valores; la tabla de abajo
 * tiene todos los números.
 */
export function ZoneRangeChart({ stats }: { stats: ZoneStat[] }) {
  const rows = stats.filter((s) => s.p25 != null && s.p75 != null).slice(0, MAX_ROWS);
  const [active, setActive] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <p className="text-sm rounded-xl px-4 py-3" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", color: "#475569" }}>
        Ninguna zona tiene {MIN_MARKET_SAMPLE} o más publicaciones con este filtro: no hay rangos para graficar.
      </p>
    );
  }

  const ticks = niceTicks(Math.min(...rows.map((r) => r.p25!)), Math.max(...rows.map((r) => r.p75!)));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const pos = (v: number) => `${((v - lo) / (hi - lo || 1)) * 100}%`;

  const byMedian = [...rows].sort((a, b) => b.median - a.median);
  const top = byMedian[0];
  const bottom = byMedian[byMedian.length - 1];
  const summary =
    rows.length === 1
      ? `${rowLabel(top)}: mediana ${money(top.median)}, rango ${money(top.p25)} a ${money(top.p75)}.`
      : `${rows.length} combinaciones de zona y tipo con ${MIN_MARKET_SAMPLE} o más publicaciones. Mediana más alta: ${rowLabel(top)} (${money(top.median)}). ` +
        `Más baja: ${rowLabel(bottom)} (${money(bottom.median)}).`;

  return (
    <figure className="m-0">
      <figcaption className="text-sm mb-3" style={{ color: "#374151" }}>
        {summary}
        {stats.filter((s) => s.p25 != null).length > MAX_ROWS && ` Se muestran las ${MAX_ROWS} con más publicaciones; el resto está en la tabla.`}
      </figcaption>

      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs mb-3" style={{ color: "#374151" }} aria-hidden="true">
        <li className="flex items-center gap-1.5">
          <span className="inline-block w-5 h-3 rounded" style={{ background: "#D4AAFF" }} />
          Rango P25–P75
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "#7C0BD8", boxShadow: "0 0 0 2px white" }} />
          Mediana
        </li>
      </ul>

      <div className="relative">
        <ol className="space-y-1">
          {rows.map((r) => {
            const isActive = active === r.key;
            const label = rowLabel(r);
            return (
              <li
                key={r.key}
                tabIndex={0}
                aria-label={`${label}: mediana ${money(r.median)}, rango de ${money(r.p25)} a ${money(r.p75)}, ${r.count} publicaciones.`}
                onPointerEnter={() => setActive(r.key)}
                onPointerLeave={() => setActive((k) => (k === r.key ? null : k))}
                onFocus={() => setActive(r.key)}
                onBlur={() => setActive((k) => (k === r.key ? null : k))}
                className="grid grid-cols-1 sm:grid-cols-[minmax(0,210px)_minmax(0,1fr)] gap-x-3 gap-y-0.5 items-center rounded-lg px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-[#9B21FF]"
                style={{ background: isActive ? "#F7F0FF" : undefined }}
              >
                <span className="text-xs truncate" style={{ color: "#1A1A1A", fontWeight: 600 }} title={label}>
                  {label}
                </span>
                <span className="relative h-6 block">
                  {/* Grilla */}
                  {ticks.map((t) => (
                    <span key={t} aria-hidden="true" className="absolute top-0 bottom-0 w-px" style={{ left: pos(t), background: "#F0EDE6" }} />
                  ))}
                  <span
                    aria-hidden="true"
                    className="absolute top-1/2 -translate-y-1/2 h-3 rounded"
                    style={{
                      left: pos(r.p25!),
                      width: `max(4px, calc(${pos(r.p75!)} - ${pos(r.p25!)}))`,
                      background: isActive ? "#BF7FFF" : "#D4AAFF",
                    }}
                  />
                  <span
                    aria-hidden="true"
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full"
                    style={{ left: pos(r.median), background: "#7C0BD8", boxShadow: "0 0 0 2px white" }}
                  />
                  {isActive && (
                    <span
                      role="presentation"
                      className="absolute z-10 bottom-full mb-1 -translate-x-1/2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs pointer-events-none"
                      style={{ left: `clamp(170px, ${pos(r.median)}, calc(100% - 170px))`, background: "#1A1A1A", color: "white", boxShadow: "var(--shadow-pop)" }}
                    >
                      <strong>{money(r.median)}</strong> mediana · {money(r.p25)} – {money(r.p75)} · {r.count} publ.
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>

        {/* Eje X */}
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,210px)_minmax(0,1fr)] gap-x-3 px-2 mt-1" aria-hidden="true">
          <span className="hidden sm:block" />
          <span className="relative h-4 block">
            {ticks.map((t, i) => (
              <span
                key={t}
                className="absolute text-[11px] whitespace-nowrap"
                style={{
                  left: pos(t),
                  transform: i === 0 ? "none" : i === ticks.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
                  color: "#6B7280",
                }}
              >
                {moneyCompact(t)}
              </span>
            ))}
          </span>
        </div>
      </div>
    </figure>
  );
}
