import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/states";
import { money } from "@/lib/format";
import { formatPct, type PropertyDiagnostic, type Recommendation } from "@/lib/propertyDiagnostic";
import type { Property } from "@/types/db";
import { useDiagnostic } from "./useDiagnostic";
import { RangeBar } from "./RangeBar";
import { ComparablesList } from "./ComparablesList";
import { BlockTitle, Disclosure, Metric, POSITIONING, TONE, ToneChip } from "./ui";

const CONFIDENCE_TONE = { alta: "verde", media: "amarillo", baja: "rojo", sin_datos: "sin_datos" } as const;
const PRIORITY_LABEL: Record<Recommendation["priority"], string> = { 1: "Prioridad alta", 2: "Prioridad media", 3: "Prioridad baja" };

function scoreLabel(v: number) {
  return v >= 70 ? "Bien posicionada" : v >= 40 ? "Mejorable" : "Necesita atención";
}

const whenFmt = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Diagnóstico PropMatch (Nivel 1): precio vs similares, demanda real y qué
 * hacer. Todo sale de `computeDiagnostic`; esta pantalla no calcula nada.
 */
export function DiagnosticoSection({
  property,
  channelsPublished,
  onShare,
}: {
  property: Property;
  channelsPublished: number | null;
  onShare: () => void;
}) {
  const { diagnostic: d, loading, marketError, recalc } = useDiagnostic(property, channelsPublished);
  const { hash } = useLocation();
  const scrolled = useRef(false);

  // Links con `#diagnostico` (p. ej. desde Mercado): bajar hasta acá una vez calculado.
  useEffect(() => {
    if (hash !== "#diagnostico" || loading || scrolled.current) return;
    scrolled.current = true;
    document.getElementById("diagnostico")?.scrollIntoView({ block: "start" });
    document.getElementById("diagnostico-title")?.focus({ preventScroll: true });
  }, [hash, loading]);

  return (
    <section id="diagnostico" aria-labelledby="diagnostico-title" className="scroll-mt-4">
      <Card>
        <div className="px-5 py-4 border-b flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: "#F0EDE6", background: "var(--gradient-soft)" }}>
          <div className="min-w-0">
            <h2 id="diagnostico-title" tabIndex={-1} className="text-base outline-none" style={{ color: "#1A1A1A", fontWeight: 800 }}>
              Diagnóstico PropMatch
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
              Precio frente a similares, demanda real y qué conviene hacer
              {d && <> · Calculado {whenFmt(d.computedAt)}</>}
            </p>
          </div>
          <button
            type="button"
            onClick={recalc}
            disabled={loading}
            className="min-h-11 px-4 rounded-xl text-sm border bg-white hover:bg-violet-50 disabled:opacity-60"
            style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 700 }}
          >
            {loading ? "Calculando…" : "Recalcular"}
          </button>
        </div>

        {marketError && (
          <div role="status" className="mx-5 mt-4 rounded-xl px-4 py-3 text-sm border" style={{ background: "#FFFBEB", borderColor: "#FDE68A", color: "#92400E" }}>
            {marketError.reason === "no_session"
              ? "No hay una sesión de PropMatch abierta, así que no se leyó el mercado de la app: el diagnóstico usa solo tu inventario."
              : "No se pudo leer el mercado de la app en este momento: el diagnóstico sigue solo con tu inventario. Probá «Recalcular» en un rato."}
          </div>
        )}

        {loading || !d ? <LoadingState /> : <Body d={d} property={property} onShare={onShare} />}
      </Card>
    </section>
  );
}

function LoadingState() {
  return (
    <div className="p-5 space-y-4" aria-busy="true" aria-label="Calculando diagnóstico">
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-16" />
      <Skeleton className="h-40" />
    </div>
  );
}

function Body({ d, property, onShare }: { d: PropertyDiagnostic; property: Property; onShare: () => void }) {
  const navigate = useNavigate();
  const { price, demand } = d;
  const c = d.currency;
  const n = d.comparables.length;
  const editPath = `/propiedades/${property.id}/editar`;
  const headline = d.narrative.find((r) => r.group === "precio") ?? d.narrative[0];

  return (
    <div className="p-5 space-y-7">
      {/* Resumen */}
      <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)] items-stretch">
        <div className="rounded-2xl p-4 flex flex-col items-center justify-center text-center" style={{ background: "#FAF8F5", border: "1px solid #E9E5DE" }}>
          <p className="text-xs" style={{ color: "#6B7280", fontWeight: 700 }}>
            Score PropMatch
          </p>
          {d.score.value != null ? (
            <>
              <p className="text-5xl tracking-tight text-gradient-brand" style={{ fontWeight: 800 }} aria-label={`${d.score.value} sobre 100`}>
                {d.score.value}
              </p>
              <p className="text-xs" style={{ color: "#6B7280" }}>de 100 · {scoreLabel(d.score.value)}</p>
            </>
          ) : (
            <p className="text-sm mt-2" style={{ color: "#475569", fontWeight: 700 }}>
              Sin score
            </p>
          )}
          <p className="text-xs mt-2" style={{ color: "#374151" }}>
            {d.score.summary}
          </p>
        </div>

        <div className="space-y-3 min-w-0">
          <div className="grid gap-3 sm:grid-cols-2">
            <Metric label="Precio publicado" value={price.current != null ? money(price.current, c) : null} missingReason="Falta cargar el precio." />
            {price.showRange ? (
              <Metric label="Rango competitivo estimado" value={`${money(price.p25, c)} – ${money(price.p75, c)}`} hint="P25–P75 de comparables" />
            ) : (
              <div className="rounded-xl px-3 py-2.5" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
                <p className="text-xs" style={{ color: "#475569", fontWeight: 600 }}>Rango competitivo</p>
                <p className="text-sm mt-0.5" style={{ color: "#334155", fontWeight: 700 }}>Pocos comparables para estimar un rango</p>
                <p className="text-xs mt-0.5" style={{ color: "#475569" }}>
                  {n === 0 ? "No hay similares activos." : `Hay ${n}; hacen falta al menos 3.`}
                </p>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {price.positioning ? (
              <ToneChip tone={POSITIONING[price.positioning].tone}>
                {POSITIONING[price.positioning].label}
                {price.positioning !== "dentro" && price.diffVsRange != null && <> · {formatPct(price.diffVsRange)} vs rango</>}
              </ToneChip>
            ) : (
              <ToneChip tone="sin_datos">Posicionamiento sin datos</ToneChip>
            )}
            <ToneChip tone={CONFIDENCE_TONE[d.confidence]}>
              Basado en {n} {n === 1 ? "comparable" : "comparables"} · {d.confidenceLabel}
            </ToneChip>
          </div>
          {headline && (
            <p className="text-sm leading-relaxed" style={{ color: "#374151" }}>
              {headline.text}
            </p>
          )}
        </div>
      </div>

      {/* Precio */}
      <div>
        <BlockTitle>Precio</BlockTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Metric label="Precio actual" value={price.current != null ? money(price.current, c) : null} missingReason="Sin precio cargado." />
          <Metric
            label="Precio por m²"
            value={price.pricePerM2 != null ? money(price.pricePerM2, c) : null}
            hint={price.surface ? `${price.surface} m²` : undefined}
            missingReason="La ficha no tiene superficie."
          />
          <Metric
            label="Precio/m² de la zona"
            value={price.zonePricePerM2 != null ? money(price.zonePricePerM2, c) : null}
            hint={`Mediana de ${price.zonePricePerM2Count} comparables con m²`}
            missingReason={`Solo ${price.zonePricePerM2Count} comparables tienen m² (hacen falta 3).`}
          />
          <Metric
            label="Mediana de comparables"
            value={price.median != null ? money(price.median, c) : null}
            hint={price.diffVsMedian != null ? `Esta propiedad: ${formatPct(price.diffVsMedian)}` : undefined}
            missingReason="Sin comparables."
          />
          {price.showRange && (
            <>
              <Metric label="Rango P25–P75" value={`${money(price.p25, c)} – ${money(price.p75, c)}`} hint={`Entre ${n} comparables`} />
              <Metric
                label="Precio sugerido"
                value={money(price.suggested, c)}
                hint={
                  price.roomsAdjustment != null
                    ? `Mediana ${price.roomsAdjustment === 0 ? "sin ajuste" : `${formatPct(price.roomsAdjustment)} por ambientes`} (mediana de ${price.medianRooms} amb.)`
                    : "Mediana sin ajuste (faltan ambientes)"
                }
              />
            </>
          )}
        </div>
        {price.showRange ? (
          <div className="mt-4 rounded-xl p-4" style={{ border: "1px solid #F0EDE6" }}>
            <RangeBar price={price} />
          </div>
        ) : (
          <p className="mt-3 text-sm" style={{ color: "#475569" }}>
            Pocos comparables para estimar un rango: no mostramos rango ni precio sugerido para no inventar un número.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2 items-center">
          <button
            type="button"
            onClick={() => navigate(editPath)}
            className="min-h-11 px-4 rounded-xl text-sm border hover:bg-violet-50"
            style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 700 }}
          >
            Editar precio
          </button>
          {d.notes
            .filter((t) => !t.startsWith("No se pudo leer"))
            .map((t) => (
              <p key={t} className="text-xs" style={{ color: "#6B7280" }}>
                {t}
              </p>
            ))}
        </div>
      </div>

      {/* Comparables */}
      <div>
        <BlockTitle>Comparables · {d.levelLabel}</BlockTitle>
        {n === 0 ? (
          <p className="text-sm rounded-xl px-4 py-3" style={{ background: "#F8FAFC", color: "#475569", border: "1px solid #E2E8F0" }}>
            No encontramos propiedades activas parecidas (misma operación y moneda, ±1 ambiente
            {price.surface ? ", ±25 % de superficie" : ""}) ni en tu inventario
            {d.sources.appAvailable ? " ni en la app" : ""}.
          </p>
        ) : (
          <ComparablesList comparables={d.comparables} />
        )}
      </div>

      {/* Demanda y rendimiento */}
      <div>
        <BlockTitle>Demanda y rendimiento</BlockTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Metric
            label="Días publicada"
            value={demand.daysPublished}
            hint={demand.interestPerWeek != null ? `${demand.interestPerWeek.toFixed(1).replace(".", ",")} interesados por semana` : undefined}
            missingReason="Sin fecha de publicación."
          />
          <Metric label="Interesados en la app" value={demand.interested} hint="Likes reales" missingReason="No está en la app." />
          <Metric label="Matches en la app" value={demand.appMatches} missingReason="No está en la app." />
          <Metric label="Visitas propuestas (app)" value={demand.appVisits} missingReason="No está en la app." />
          <Metric
            label="Visitas en agenda"
            value={demand.agendaVisits.done + demand.agendaVisits.upcoming}
            hint={`${demand.agendaVisits.done} hechas · ${demand.agendaVisits.upcoming} próximas`}
          />
          <Metric
            label="Ofertas"
            value={demand.offers ? demand.offers.count : null}
            hint={
              demand.offers?.best != null
                ? `Mejor: ${money(demand.offers.best, "USD")}${demand.offers.bestVsPrice != null ? ` (${formatPct(demand.offers.bestVsPrice)} vs precio)` : ""}`
                : undefined
            }
            missingReason="No está en la app."
          />
          <Metric label="Oportunidades abiertas" value={demand.openOpportunities} hint="En tu pipeline" />
          <Metric
            label="Compatibles en tu cartera"
            value={demand.compatibleContacts.count}
            hint={
              demand.compatibleContacts.bestScore != null
                ? `Mejor ${demand.compatibleContacts.bestScore} % · promedio ${demand.compatibleContacts.avgScore} %`
                : "Matching del CRM"
            }
          />
          <Metric
            label="Canales externos"
            value={demand.channelsPublished}
            hint="Publicada en portales"
            missingReason="Cargando publicaciones."
          />
        </div>
      </div>

      {/* Lectura cruzada */}
      <div>
        <BlockTitle>Lectura cruzada</BlockTitle>
        <ul className="grid gap-2 sm:grid-cols-2">
          {d.signals.map((s) => {
            const t = TONE[s.status];
            return (
              <li key={s.id} className="rounded-xl px-3 py-2.5 border" style={{ background: t.bg, borderColor: t.border }}>
                <p className="text-sm flex items-center gap-1.5" style={{ color: t.text, fontWeight: 700 }}>
                  <span aria-hidden="true">{t.dot}</span>
                  {s.label}: {t.label}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "#374151" }}>
                  {s.detail}
                </p>
              </li>
            );
          })}
        </ul>
        {d.narrative.length > 0 && (
          <div className="mt-4 rounded-xl p-4 space-y-2" style={{ background: "#F7F0FF" }}>
            <p className="text-xs" style={{ color: "#7C0BD8", fontWeight: 700 }}>
              Diagnóstico
            </p>
            {d.narrative.map((r) => (
              <p key={r.id} className="text-sm leading-relaxed" style={{ color: "#1A1A1A" }}>
                {r.text}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Recomendaciones */}
      <div>
        <BlockTitle>Qué conviene hacer</BlockTitle>
        {d.recommendations.length === 0 ? (
          <p className="text-sm" style={{ color: "#475569" }}>
            No hay acciones urgentes con los datos disponibles.
          </p>
        ) : (
          <ol className="space-y-2">
            {d.recommendations.map((r) => (
              <li key={r.id} className="rounded-xl p-3 border flex flex-col sm:flex-row sm:items-center gap-3" style={{ borderColor: "#E9E5DE" }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                    {r.title}
                    <span className="ml-2 text-xs align-middle" style={{ color: r.priority === 1 ? "#BE123C" : "#6B7280", fontWeight: 600 }}>
                      {PRIORITY_LABEL[r.priority]}
                    </span>
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "#374151" }}>
                    {r.why}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => (r.action.kind === "share" ? onShare() : r.action.to && navigate(r.action.to))}
                  className="min-h-11 px-4 rounded-xl text-sm text-white flex-shrink-0 hover:opacity-90"
                  style={{ background: "var(--gradient-brand)", fontWeight: 700 }}
                >
                  {r.action.label}
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Desglose y método */}
      <div className="space-y-2">
        <Disclosure title="Cómo se calcula el score">
          <ScoreBreakdown d={d} />
        </Disclosure>
        <Disclosure title="Método y fuentes">
          <MethodNote d={d} />
        </Disclosure>
      </div>
    </div>
  );
}

function ScoreBreakdown({ d }: { d: PropertyDiagnostic }) {
  const pct = (v: number) => `${Math.round(v * 100)} %`;
  return (
    <div className="space-y-2">
      <p className="text-xs" style={{ color: "#374151" }}>
        Promedio ponderado de los componentes con datos. Los que no tienen datos se excluyen y sus pesos se reparten entre
        los demás; con menos de 2 componentes no se calcula score.
      </p>
      <ul className="space-y-2">
        {d.score.components.map((comp) => (
          <li key={comp.id} className="rounded-xl p-3" style={{ background: comp.included ? "#FAF8F5" : "#F8FAFC", border: "1px solid #F0EDE6" }}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                {comp.label}
              </p>
              <p className="text-xs" style={{ color: comp.included ? "#7C0BD8" : "#475569", fontWeight: 700 }}>
                {comp.included ? `${comp.value}/100` : "Sin datos"} · peso {pct(comp.weight)}
                {comp.effectiveWeight != null && comp.effectiveWeight !== comp.weight && ` → ${pct(comp.effectiveWeight)}`}
              </p>
            </div>
            <p className="text-xs mt-1" style={{ color: "#374151" }}>
              {comp.source}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
              Fórmula: {comp.formula}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MethodNote({ d }: { d: PropertyDiagnostic }) {
  return (
    <ul className="list-disc pl-5 space-y-1.5 text-xs" style={{ color: "#374151" }}>
      <li>
        <strong>Fuentes:</strong> tu inventario en PropMatch ({d.sources.crm} comparables) y las propiedades activas de la app
        PropMatch ({d.sources.appAvailable ? `${d.sources.app} comparables` : "no disponible en este cálculo"}). Las
        propiedades tuyas que también están en la app se cuentan una sola vez.
      </li>
      <li>
        <strong>Comparables:</strong> activas, misma operación y moneda, ±1 ambiente y ±25 % de superficie cuando ambas
        la tienen (la app no guarda m²). Se busca primero misma zona y tipo ({d.countsByLevel.zona_tipo}), después misma
        zona ({d.countsByLevel.zona}) y después mismo tipo ({d.countsByLevel.tipo}); se usa el primer nivel con al menos 3.
        Usado: {d.levelLabel}.
      </li>
      <li>
        <strong>Confianza:</strong> alta con 8 o más comparables de misma zona y tipo; media con 3 a 7; baja con 1 o 2. Con
        confianza baja no se muestran rango ni precio sugerido.
      </li>
      <li>
        <strong>Precio sugerido:</strong> mediana de comparables ajustada 6 % por ambiente de diferencia (tope ±18 %), el
        mismo criterio que usa la app PropMatch.
      </li>
      <li>
        <strong>Demanda:</strong> likes, matches, visitas y ofertas reales de la app (solo si la propiedad está publicada
        ahí), visitas de tu agenda, oportunidades del pipeline y contactos compatibles del matching del CRM.
      </li>
      {d.notes.map((t) => (
        <li key={t}>{t}</li>
      ))}
      <li>
        <strong>Todavía no incluye datos de portales externos</strong> (Zonaprop, Argenprop, Mercado Libre). Nivel 2:
        próximamente, con una fuente de datos de mercado legal y estable.
      </li>
      <li>Calculado el {new Date(d.computedAt).toLocaleString("es-AR")}.</li>
    </ul>
  );
}
