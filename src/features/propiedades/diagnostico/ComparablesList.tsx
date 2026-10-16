import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/Card";
import { money, PROPERTY_TYPE_LABEL } from "@/lib/format";
import { formatPct, type Comparable } from "@/lib/propertyDiagnostic";

type SortKey = "similitud" | "precio";
const INITIAL = 8;

const SOURCE_STYLE: Record<Comparable["source"], { bg: string; text: string; border: string }> = {
  crm: { bg: "#F7F0FF", text: "#7C0BD8", border: "#DDD8CF" },
  app: { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE" },
};

function perM2(c: Comparable) {
  return c.pricePerM2 != null ? money(c.pricePerM2, c.currency) : "—";
}

/** Dif. del comparable vs esta propiedad: "−12,0 %" = el comparable es 12 % más barato. */
function Diff({ value }: { value: number | null }) {
  if (value == null) return <span style={{ color: "#6B7280" }}>—</span>;
  const color = value < 0 ? "#BE123C" : value > 0 ? "#15803D" : "#475569";
  return <span style={{ color, fontWeight: 700 }}>{formatPct(value)}</span>;
}

function Title({ c }: { c: Comparable }) {
  return c.propertyId ? (
    <Link to={`/propiedades/${c.propertyId}`} className="hover:underline rounded" style={{ color: "#1A1A1A", fontWeight: 600 }}>
      {c.title}
    </Link>
  ) : (
    <span style={{ color: "#1A1A1A", fontWeight: 600 }}>{c.title}</span>
  );
}

export function ComparablesList({
  comparables,
  diffNote = "«Dif.» = cuánto más caro (+) o más barato (−) es cada comparable que esta propiedad.",
}: {
  comparables: Comparable[];
  /** Texto que explica la columna «Dif.» (el tasador la calcula contra el precio sugerido). */
  diffNote?: string;
}) {
  const [sort, setSort] = useState<SortKey>("similitud");
  const [showAll, setShowAll] = useState(false);

  const sorted = useMemo(
    () =>
      [...comparables].sort((a, b) =>
        sort === "precio" ? a.price - b.price : b.similarity - a.similarity || a.price - b.price,
      ),
    [comparables, sort],
  );
  const visible = showAll ? sorted : sorted.slice(0, INITIAL);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <p className="text-xs" style={{ color: "#6B7280" }}>
          {diffNote}
        </p>
        <div role="group" aria-label="Ordenar comparables" className="flex rounded-xl p-1" style={{ background: "#F7F0FF" }}>
          {(["similitud", "precio"] as SortKey[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setSort(k)}
              aria-pressed={sort === k}
              className="min-h-11 px-3 rounded-lg text-xs transition-all"
              style={{
                background: sort === k ? "white" : "transparent",
                color: sort === k ? "#7C0BD8" : "#6B7280",
                fontWeight: 700,
                boxShadow: sort === k ? "var(--shadow-card)" : undefined,
              }}
            >
              {k === "similitud" ? "Más similares" : "Precio"}
            </button>
          ))}
        </div>
      </div>

      {/* Escritorio: tabla */}
      <div className="hidden md:block overflow-x-auto rounded-xl border" style={{ borderColor: "#F0EDE6" }}>
        <table className="w-full text-sm">
          <caption className="sr-only">Propiedades comparables</caption>
          <thead>
            <tr className="text-xs text-left" style={{ color: "#6B7280", background: "#FAF8F5" }}>
              <th scope="col" className="px-3 py-2.5 font-bold">Propiedad</th>
              <th scope="col" className="px-3 py-2.5 font-bold">Zona</th>
              <th scope="col" className="px-3 py-2.5 font-bold text-right">Amb.</th>
              <th scope="col" className="px-3 py-2.5 font-bold text-right">m²</th>
              <th scope="col" className="px-3 py-2.5 font-bold text-right">Precio</th>
              <th scope="col" className="px-3 py-2.5 font-bold text-right">Precio/m²</th>
              <th scope="col" className="px-3 py-2.5 font-bold text-right">Dif.</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => (
              <tr key={c.key} className="border-t" style={{ borderColor: "#F0EDE6" }}>
                <td className="px-3 py-2.5 min-w-0">
                  <div className="flex flex-col gap-1 items-start">
                    <Title c={c} />
                    <span className="flex gap-1.5 items-center flex-wrap">
                      <Badge size="xs" {...SOURCE_STYLE[c.source]}>{c.sourceLabel}</Badge>
                      <span className="text-xs" style={{ color: "#6B7280" }}>{PROPERTY_TYPE_LABEL[c.type]}</span>
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5" style={{ color: "#374151" }}>{c.zone ?? "—"}</td>
                <td className="px-3 py-2.5 text-right" style={{ color: "#374151" }}>{c.rooms ?? "—"}</td>
                <td className="px-3 py-2.5 text-right" style={{ color: "#374151" }}>{c.surface ?? "—"}</td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                  {money(c.price, c.currency)}
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap" style={{ color: "#374151" }}>{perM2(c)}</td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap"><Diff value={c.diffVsTarget} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Móvil: tarjetas */}
      <ul className="md:hidden space-y-2">
        {visible.map((c) => (
          <li key={c.key} className="rounded-xl p-3 border" style={{ borderColor: "#F0EDE6", background: "#FAF8F5" }}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Title c={c} />
                <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
                  {[c.zone, PROPERTY_TYPE_LABEL[c.type], c.rooms != null ? `${c.rooms} amb.` : null, c.surface ? `${c.surface} m²` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Badge size="xs" {...SOURCE_STYLE[c.source]}>{c.source === "crm" ? "Inventario" : "App"}</Badge>
            </div>
            <div className="flex items-center justify-between mt-2 text-sm">
              <span style={{ color: "#1A1A1A", fontWeight: 700 }}>
                {money(c.price, c.currency)}
                {c.pricePerM2 != null && (
                  <span className="text-xs ml-1.5" style={{ color: "#6B7280", fontWeight: 500 }}>
                    ({perM2(c)}/m²)
                  </span>
                )}
              </span>
              <span className="text-xs">
                Dif. <Diff value={c.diffVsTarget} />
              </span>
            </div>
          </li>
        ))}
      </ul>

      {sorted.length > INITIAL && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 min-h-11 px-4 rounded-xl text-xs border hover:bg-violet-50"
          style={{ borderColor: "#E9E5DE", color: "#7C0BD8", fontWeight: 700 }}
        >
          {showAll ? "Ver menos" : `Ver los ${sorted.length} comparables`}
        </button>
      )}
    </div>
  );
}
