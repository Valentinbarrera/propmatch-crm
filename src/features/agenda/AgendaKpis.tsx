import { useId, useState } from "react";
import { PROPERTY_TYPE_LABEL, moneyCompact } from "@/lib/format";
import { CONVERSION_CRITERIA, FEEDBACK_WINDOW_DAYS, type Kpis } from "./agendaModel";

/**
 * Fila de 4 KPIs. Todo sale de datos reales; si no hay con qué calcular se
 * muestra "—" en vez de un número inventado.
 */

const fmt1 = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 1 });

export function AgendaKpis({
  kpis,
  periodLabel,
  onOpenPendingFeedback,
}: {
  kpis: Kpis;
  /** "esta semana" / "este mes"… para el KPI de ofertas. */
  periodLabel: string;
  onOpenPendingFeedback: () => void;
}) {
  const { week, confirmed, pendingFeedback, offers, conversion } = kpis;
  const delta = week.total - week.previous;
  const byType = week.byType
    .slice(0, 3)
    .map((t) => `${t.count} ${t.type === "sin_propiedad" ? "sin propiedad" : PROPERTY_TYPE_LABEL[t.type].toLowerCase()}`)
    .join(" · ");

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 px-4 md:px-6 py-4" style={{ background: "#FAF8F5" }}>
      <Kpi
        label="Visitas de la semana"
        value={String(week.total)}
        badge={
          week.previous || week.total
            ? {
              text: `${delta > 0 ? "+" : ""}${delta} vs semana anterior`,
              tone: delta > 0 ? "green" : delta < 0 ? "amber" : "neutral",
            }
            : null
        }
        lines={[byType || "Sin visitas agendadas", week.total ? `≈ ${fmt1(week.perDay)} por día (lun a sáb)` : null]}
      />
      <Kpi
        label="Confirmadas"
        value={week.total ? `${confirmed.confirmed}/${confirmed.total}` : "—"}
        lines={[
          week.total ? `${confirmed.total - confirmed.confirmed} sin confirmar` : "Sin visitas esta semana",
          `${confirmed.noShows} ${confirmed.noShows === 1 ? "no vino" : "no vinieron"}`,
        ]}
        badge={confirmed.noShows ? { text: "No-show", tone: "red" } : null}
      />
      <Kpi
        label="Pendientes de feedback"
        value={String(pendingFeedback.length)}
        lines={[`Visitas de los últimos ${FEEDBACK_WINDOW_DAYS} días sin feedback`]}
        action={pendingFeedback.length ? { label: "Cargar el primero", onClick: onOpenPendingFeedback } : null}
        badge={pendingFeedback.length ? { text: "A completar", tone: "amber" } : null}
      />
      <Kpi
        label="Ofertas y pipeline"
        value={String(offers.count)}
        valueSuffix={`${offers.count === 1 ? "oferta" : "ofertas"} ${periodLabel}`}
        lines={[
          offers.pipeline.length
            ? `Pipeline: ${offers.pipeline.map((p) => moneyCompact(p.total, p.currency)).join(" + ")}`
            : "Pipeline: —",
        ]}
        conversion={conversion}
      />
    </div>
  );
}

type Tone = "green" | "amber" | "red" | "neutral";
const TONE: Record<Tone, { bg: string; text: string }> = {
  green: { bg: "var(--color-state-green-bg)", text: "var(--color-state-green-text)" },
  amber: { bg: "var(--color-state-amber-bg)", text: "var(--color-state-amber-text)" },
  red: { bg: "var(--color-state-red-bg)", text: "var(--color-state-red-text)" },
  neutral: { bg: "#F7F0FF", text: "#6B7280" },
};

function Kpi({
  label,
  value,
  valueSuffix,
  lines,
  badge,
  action,
  conversion,
}: {
  label: string;
  value: string;
  valueSuffix?: string;
  lines: (string | null)[];
  badge?: { text: string; tone: Tone } | null;
  action?: { label: string; onClick: () => void } | null;
  conversion?: Kpis["conversion"];
}) {
  return (
    <section className="rounded-2xl border p-4 bg-white flex flex-col" style={{ borderColor: "#E9E5DE", boxShadow: "var(--shadow-card)" }} aria-label={label}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs uppercase" style={{ color: "#6B7280", fontWeight: 700, letterSpacing: "0.08em" }}>
          {label}
        </p>
        {badge && (
          <span className="px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap" style={{ background: TONE[badge.tone].bg, color: TONE[badge.tone].text, fontWeight: 700 }}>
            {badge.text}
          </span>
        )}
      </div>
      <p className="mt-1 flex items-baseline gap-1.5 flex-wrap">
        <span className="text-2xl md:text-3xl tracking-tight" style={{ color: "#1A1A1A", fontWeight: 800 }}>
          {value}
        </span>
        {valueSuffix && (
          <span className="text-xs" style={{ color: "#6B7280", fontWeight: 600 }}>
            {valueSuffix}
          </span>
        )}
      </p>
      {lines.filter(Boolean).map((l) => (
        <p key={l} className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
          {l}
        </p>
      ))}
      {conversion !== undefined && <ConversionLine conversion={conversion} />}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-auto pt-2 self-start min-h-11 sm:min-h-9 px-3 rounded-lg text-xs border hover:bg-violet-50"
          style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 700 }}
        >
          {action.label}
        </button>
      )}
    </section>
  );
}

function ConversionLine({ conversion }: { conversion: Kpis["conversion"] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="relative mt-0.5">
      <p className="text-xs flex items-center gap-1.5" style={{ color: "#6B7280" }}>
        Conversión visita → oferta:{" "}
        <strong style={{ color: "#1A1A1A" }}>{conversion ? `${conversion.pct}%` : "—"}</strong>
        {conversion && (
          <span>
            ({conversion.converted}/{conversion.done})
          </span>
        )}
        <button
          type="button"
          aria-describedby={open ? id : undefined}
          aria-expanded={open}
          aria-label="Cómo se calcula la conversión"
          onClick={() => setOpen((v) => !v)}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onBlur={() => setOpen(false)}
          className="w-6 h-6 rounded-full border text-[11px] flex items-center justify-center"
          style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 700 }}
        >
          ?
        </button>
      </p>
      {open && (
        <p
          id={id}
          role="tooltip"
          className="absolute z-30 right-0 top-full mt-1 w-72 max-w-[80vw] p-3 rounded-xl text-xs"
          style={{ background: "#1A1A1A", color: "white", lineHeight: 1.5, boxShadow: "var(--shadow-pop)" }}
        >
          {CONVERSION_CRITERIA}
          {!conversion && " Todavía no hay visitas realizadas en la ventana: por eso se muestra «—»."}
        </p>
      )}
    </div>
  );
}
