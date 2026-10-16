import { useMemo, useState } from "react";
import { isSample, sampleCsvCell } from "@/lib/samples";
import { useNavigate } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, SectionHeader, Badge } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/states";
import {
  ContactsIcon,
  DownloadIcon,
  CalendarIcon,
  ChevronDownIcon,
  CheckCircleIcon,
  MatchesIcon,
  OpportunitiesIcon,
  TrendUpIcon,
} from "@/components/ui/icons";
import { useStore } from "@/data/store";
import { downloadCsv, datedFilename } from "@/lib/csv";
import { PROPERTY_STATUS_LABEL, PROPERTY_STATUS_STYLE, PROPERTY_TYPE_LABEL, avatarGradient, initials } from "@/lib/format";

/**
 * `YYYY-MM-DD` en hora local. `toISOString` pasa por UTC: en Argentina un lead
 * de las 22 h caía en la barra del día siguiente.
 */
const localDayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const PERIODS = [
  { value: 7, label: "Últimos 7 días" },
  { value: 30, label: "Últimos 30 días" },
  { value: 90, label: "Últimos 90 días" },
  { value: 365, label: "Este año" },
];

export default function ReportesPage() {
  const navigate = useNavigate();
  const { contacts, properties, opportunities, matches, profiles } = useStore();
  const [days, setDays] = useState(30);
  const [open, setOpen] = useState(false);

  const since = useMemo(() => Date.now() - days * 86_400_000, [days]);

  /** Ventana anterior de igual duración, para poder comparar. */
  const previousSince = useMemo(() => since - days * 86_400_000, [since, days]);

  const kpis = useMemo(() => {
    const inWindow = (iso: string) => new Date(iso).getTime() > since;
    const inPrevWindow = (iso: string) => {
      const t = new Date(iso).getTime();
      return t > previousSince && t <= since;
    };

    const leads = contacts.filter((c) => inWindow(c.created_at));
    const newMatches = matches.filter((m) => inWindow(m.created_at));
    // Abiertas = todavía en juego: ni perdidas ni cerradas.
    const openOpps = opportunities.filter((o) => o.stage !== "perdida" && o.stage !== "cierre");
    const closedAll = opportunities.filter((o) => o.stage === "cierre");
    // Cerradas en el período, con el mismo criterio que el período anterior.
    const closed = closedAll.filter((o) => o.closed_at && inWindow(o.closed_at));

    return {
      leads,
      newMatches,
      openOpps,
      closed,
      closedAll,
      prev: {
        leads: contacts.filter((c) => inPrevWindow(c.created_at)).length,
        matches: matches.filter((m) => inPrevWindow(m.created_at)).length,
        opps: opportunities.filter((o) => inPrevWindow(o.created_at)).length,
        closed: opportunities.filter((o) => o.stage === "cierre" && o.closed_at && inPrevWindow(o.closed_at))
          .length,
      },
    };
  }, [contacts, matches, opportunities, since, previousSince]);

  /**
   * Variación contra el período anterior.
   * Devuelve `null` cuando no hay base de comparación: mostrar "+100%" porque
   * antes no había nada no le dice nada a nadie.
   */
  const delta = (current: number, previous: number): { text: string; up: boolean } | null => {
    if (previous === 0) return current > 0 ? { text: `+${current}`, up: true } : null;
    const pct = Math.round(((current - previous) / previous) * 100);
    if (pct === 0) return { text: "Sin cambios", up: true };
    return { text: `${pct > 0 ? "+" : ""}${pct}%`, up: pct > 0 };
  };

  /**
   * Serie temporal. En el prototipo era un array de 30 puntos escritos a mano;
   * acá se agrupa por día lo que realmente pasó en el período.
   */
  const series = useMemo(() => {
    const buckets = new Map<string, { date: string; leads: number; ops: number; conv: number }>();
    const step = days <= 30 ? 1 : days <= 90 ? 3 : 15;

    for (let i = days; i >= 0; i -= step) {
      const d = new Date(Date.now() - i * 86_400_000);
      const key = localDayKey(d);
      buckets.set(key, {
        date: `${d.getDate()}/${d.getMonth() + 1}`,
        leads: 0,
        ops: 0,
        conv: 0,
      });
    }

    const nearestKey = (iso: string) => {
      const t = localDayKey(new Date(iso));
      let best: string | null = null;
      for (const key of buckets.keys()) if (key <= t) best = key;
      return best;
    };

    for (const c of contacts) {
      if (new Date(c.created_at).getTime() < since) continue;
      const k = nearestKey(c.created_at);
      if (k) buckets.get(k)!.leads += 1;
    }
    for (const o of opportunities) {
      if (new Date(o.created_at).getTime() < since) continue;
      const k = nearestKey(o.created_at);
      if (k) buckets.get(k)!.ops += 1;
      if (o.stage === "cierre" && o.closed_at) {
        const ck = nearestKey(o.closed_at);
        if (ck) buckets.get(ck)!.conv += 1;
      }
    }

    return [...buckets.values()];
  }, [contacts, opportunities, days, since]);

  /** Funnel real: matches → contactados → visitas → cerradas. */
  const funnel = useMemo(() => {
    const advancedStages = ["contactados", "visita", "negociacion", "cierre"];
    const contacted = opportunities.filter((o) => advancedStages.includes(o.stage));
    const visited = opportunities.filter((o) => ["visita", "negociacion", "cierre"].includes(o.stage));
    const closed = opportunities.filter((o) => o.stage === "cierre");
    return [
      { label: "Matches generados", value: matches.length, color: "#9B21FF" },
      { label: "Convertidos en oportunidad", value: opportunities.length, color: "#A855FF" },
      { label: "Contactados o más", value: contacted.length, color: "#FF5ECA" },
      { label: "Visitas coordinadas", value: visited.length, color: "#FF7ED5" },
      { label: "Operaciones cerradas", value: closed.length, color: "#FFC7EC" },
    ];
  }, [matches, opportunities]);

  // Como el embudo: todo lo cerrado sobre todos los matches.
  const conversionRate = matches.length
    ? Math.round((kpis.closedAll.length / matches.length) * 1000) / 10
    : 0;

  /** Rendimiento por propiedad, ordenado por matches generados. */
  const propertyPerf = useMemo(() => {
    const byProperty = new Map<string, number>();
    for (const m of matches) byProperty.set(m.property_id, (byProperty.get(m.property_id) ?? 0) + 1);

    return properties
      .map((p) => {
        const matchCount = byProperty.get(p.id) ?? 0;
        const opps = opportunities.filter((o) => o.property_id === p.id);
        const visits = opps.filter((o) =>
          ["visita", "negociacion", "cierre"].includes(o.stage),
        ).length;
        return { property: p, matchCount, opps: opps.length, visits };
      })
      .filter((r) => r.matchCount > 0 || r.opps > 0)
      .sort((a, b) => b.matchCount - a.matchCount)
      .slice(0, 5);
  }, [properties, matches, opportunities]);

  /** Ranking del equipo por oportunidades a cargo. */
  const team = useMemo(
    () =>
      profiles
        .map((agent) => {
          const owned = opportunities.filter((o) => o.owner_id === agent.id);
          const conv = owned.filter((o) => o.stage === "cierre").length;
          return {
            agent,
            opps: owned.length,
            conv,
            rate: owned.length ? Math.round((conv / owned.length) * 100) : 0,
          };
        })
        .filter((r) => r.opps > 0)
        .sort((a, b) => b.opps - a.opps),
    [profiles, opportunities],
  );

  /**
   * Exporta lo que se está viendo: mismas cifras, mismo período. Un CSV y no
   * un PDF porque el uso real es pegarlo en una planilla y seguir trabajando.
   */
  function exportCsv() {
    const periodLabel = PERIODS.find((p) => p.value === days)?.label ?? `Últimos ${days} días`;
    const rows: (string | number | null)[][] = [
      ["Reporte PropMatch", periodLabel],
      ["Generado", new Date().toLocaleString("es-AR")],
      // Los ejemplos cuentan en las cifras de pantalla: el CSV lo avisa y marca cada fila.
      ...(properties.some(isSample) || opportunities.some(isSample)
        ? [["Atención", "Incluye datos de ejemplo (columna Ejemplo). Se ocultan en Configuración › Datos de ejemplo."]]
        : []),
      [],
      ["Indicador", "Valor"],
      ["Leads nuevos", kpis.leads.length],
      ["Matches generados", kpis.newMatches.length],
      ["Oportunidades abiertas", kpis.openOpps.length],
      ["Operaciones cerradas", kpis.closed.length],
      ["Tasa de conversión (%)", conversionRate],
      [],
      ["Embudo", "Cantidad"],
      ...funnel.map((f) => [f.label, f.value]),
      [],
      ["Propiedad", "Matches", "Oportunidades", "Visitas", "Ejemplo"],
      ...propertyPerf.map((r) => [r.property.title, r.matchCount, r.opps, r.visits, sampleCsvCell(r.property)]),
      [],
      ["Agente", "Oportunidades", "Cerradas", "Conversión (%)", "Ejemplo"],
      ...team.map((r) => [r.agent.full_name, r.opps, r.conv, r.rate, sampleCsvCell(r.agent)]),
      [],
      ["Fecha", "Leads", "Oportunidades", "Cierres"],
      ...series.map((pt) => [pt.date, pt.leads, pt.ops, pt.conv]),
    ];
    downloadCsv(datedFilename("reporte-propmatch"), rows);
  }

  /** Insights derivados de los datos, no textos fijos. */
  const insights = useMemo(() => {
    const out: {
      emoji: string;
      accent: string;
      accentBg: string;
      accentBorder: string;
      label: string;
      text: string;
      cta: string;
      to: string;
    }[] = [];

    const top = propertyPerf[0];
    if (top) {
      out.push({
        emoji: "🔥",
        accent: "#FF5ECA",
        accentBg: "#FFF1FA",
        accentBorder: "#FFF1FA",
        label: "Propiedad destacada",
        text: `${top.property.title} es la que más interesados generó: ${top.matchCount} matches.`,
        cta: "Ver propiedades",
        to: "/propiedades",
      });
    }

    const oppPairs = new Set(opportunities.map((o) => `${o.contact_id}:${o.property_id}`));
    const untapped = matches.filter(
      (m) => m.score >= 80 && !oppPairs.has(`${m.contact_id}:${m.property_id}`),
    );
    if (untapped.length) {
      out.push({
        emoji: "⚡",
        accent: "#F59E0B",
        accentBg: "#FFFBEB",
        accentBorder: "#FEF3C7",
        label: "Oportunidad",
        text: `${untapped.length} matches de 80% o más todavía no tienen oportunidad creada.`,
        cta: "Ver matches",
        to: "/matches",
      });
    }

    const stale = opportunities.filter(
      (o) =>
        o.stage !== "cierre" &&
        o.stage !== "perdida" &&
        Date.now() - new Date(o.stage_since).getTime() > 7 * 86_400_000,
    );
    if (stale.length) {
      out.push({
        emoji: "⚠️",
        accent: "#F97316",
        accentBg: "#FFF7ED",
        accentBorder: "#FFEDD5",
        label: "Requiere atención",
        text: `${stale.length} oportunidades llevan más de 7 días sin moverse de etapa.`,
        cta: "Ver pipeline",
        to: "/oportunidades",
      });
    }

    const noRequirement = contacts.filter(
      (c) => !matches.some((m) => m.contact_id === c.id),
    );
    if (noRequirement.length) {
      out.push({
        emoji: "📈",
        accent: "#10B981",
        accentBg: "#F0FDF4",
        accentBorder: "#D1FAE5",
        label: "Para mejorar",
        text: `${noRequirement.length} contactos no tienen ningún match: puede faltarles cargar qué buscan.`,
        cta: "Ver contactos",
        to: "/contactos",
      });
    }

    return out;
  }, [propertyPerf, matches, opportunities, contacts]);

  const hasData = contacts.length > 0 || properties.length > 0;

  return (
    <>
      <AppHeader
        title="Reportes"
        breadcrumb={["PropMatch", "Reportes"]}
        subtitle="Entendé el rendimiento de tu negocio y detectá nuevas oportunidades."
        compact
      >
        <div className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm border transition-all hover:border-violet-300"
            style={{ borderColor: "#E9E5DE", background: "white", color: "#1A1A1A", fontWeight: 600 }}
          >
            <CalendarIcon size={14} color="#BF7FFF" />
            {PERIODS.find((p) => p.value === days)?.label}
            <ChevronDownIcon />
          </button>
          {open && (
            <div
              className="absolute right-0 top-full mt-1 rounded-xl overflow-hidden z-50 py-1"
              style={{
                background: "white",
                border: "1px solid #E9E5DE",
                boxShadow: "var(--shadow-pop)",
                minWidth: 180,
              }}
            >
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => {
                    setDays(p.value);
                    setOpen(false);
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm transition-all hover:bg-violet-50"
                  style={{
                    color: p.value === days ? "#9B21FF" : "#374151",
                    fontWeight: p.value === days ? 700 : 500,
                  }}
                >
                  {p.value === days && <span className="mr-2">✓</span>}
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={exportCsv}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm border transition-all hover:bg-violet-50"
          style={{ borderColor: "#E9E5DE", color: "#9B21FF", fontWeight: 600, background: "white" }}
        >
          <DownloadIcon />
          Exportar
        </button>
      </AppHeader>

      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-10">
        {!hasData ? (
          <EmptyState
            icon={<OpportunitiesIcon size={24} color="#9B21FF" />}
            title="Todavía no hay datos para reportar"
            description="Cargá propiedades y contactos: las métricas se calculan solas a partir de la actividad real."
            action={{ label: "Ir a Propiedades", onClick: () => navigate("/propiedades") }}
          />
        ) : (
          <>
            {/* KPIs */}
            <div className="mt-8 grid grid-cols-2 xl:grid-cols-4 gap-5">
              <ReportKpi
                value={String(kpis.leads.length)}
                label="Leads generados"
                sub={`Últimos ${days} días`}
                trend={delta(kpis.leads.length, kpis.prev.leads)}
                grad="var(--gradient-brand)"
                iconBg="#F7F0FF"
                icon={<ContactsIcon size={22} color="#9B21FF" />}
                series={series.map((s) => s.leads)}
                color="#9B21FF"
              />
              <ReportKpi
                value={String(matches.length)}
                label="Matches vigentes"
                sub={`${kpis.newMatches.length} en el período`}
                trend={delta(kpis.newMatches.length, kpis.prev.matches)}
                grad="var(--gradient-brand)"
                iconBg="#FFF1FA"
                icon={<MatchesIcon size={22} color="#FF5ECA" />}
                series={series.map((s) => s.ops)}
                color="#A855FF"
              />
              <ReportKpi
                value={String(kpis.openOpps.length)}
                label="Oportunidades activas"
                sub="En el pipeline"
                trend={delta(kpis.openOpps.length, kpis.prev.opps)}
                grad="linear-gradient(135deg,#FF5ECA,#FF7ED5)"
                iconBg="#FFF1FA"
                icon={<OpportunitiesIcon size={22} color="#FF5ECA" />}
                series={series.map((s) => s.ops)}
                color="#FF5ECA"
              />
              <ReportKpi
                value={String(kpis.closed.length)}
                label="Operaciones cerradas"
                sub={`${conversionRate}% de conversión`}
                trend={delta(kpis.closed.length, kpis.prev.closed)}
                grad="linear-gradient(135deg,#06B6D4,#3B82F6)"
                iconBg="#EFF6FF"
                icon={<CheckCircleIcon size={22} color="#06B6D4" />}
                series={series.map((s) => s.conv)}
                color="#06B6D4"
              />
            </div>

            {/* Serie temporal */}
            <div className="mt-6 grid gap-5 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px]">
              <Card padded>
                <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
                  <div>
                    <h2 className="text-base" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                      Evolución de la actividad
                    </h2>
                    <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
                      Últimos {days} días
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    {[
                      { label: "Leads", color: "#9B21FF" },
                      { label: "Oportunidades", color: "#FF5ECA" },
                      { label: "Cierres", color: "#06B6D4" },
                    ].map((s) => (
                      <div key={s.label} className="flex items-center gap-1.5">
                        <div className="w-3 h-0.5 rounded-full" style={{ background: s.color }} />
                        <span className="text-xs" style={{ color: "#6B7280" }}>
                          {s.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={series} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="4 4" stroke="#F0EDE6" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "#6B7280", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                      minTickGap={24}
                    />
                    <YAxis
                      tick={{ fill: "#6B7280", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="leads"
                      name="Leads"
                      stroke="#9B21FF"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4, fill: "#9B21FF", stroke: "white", strokeWidth: 2 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="ops"
                      name="Oportunidades"
                      stroke="#FF5ECA"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: "#FF5ECA", stroke: "white", strokeWidth: 2 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="conv"
                      name="Cierres"
                      stroke="#06B6D4"
                      strokeWidth={2}
                      dot={false}
                      strokeDasharray="5 3"
                      activeDot={{ r: 4, fill: "#06B6D4", stroke: "white", strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Card>

              <Card className="flex flex-col">
                <SectionHeader inCard title="Tasa de conversión" subtitle="Matches → cierres" />
                <div className="flex-1 flex flex-col items-center justify-center px-5 py-6">
                  <ConversionRing pct={conversionRate} />
                </div>
                <div className="px-5 pb-5 space-y-2.5">
                  {[
                    {
                      label: "Match → Oportunidad",
                      pct: matches.length
                        ? Math.round((opportunities.length / matches.length) * 100)
                        : 0,
                      color: "#9B21FF",
                    },
                    {
                      label: "Oportunidad → Visita",
                      pct: opportunities.length
                        ? Math.round(
                            (opportunities.filter((o) =>
                              ["visita", "negociacion", "cierre"].includes(o.stage),
                            ).length /
                              opportunities.length) *
                              100,
                          )
                        : 0,
                      color: "#FF5ECA",
                    },
                    {
                      label: "Visita → Cierre",
                      pct: opportunities.filter((o) =>
                        ["visita", "negociacion", "cierre"].includes(o.stage),
                      ).length
                        ? Math.round(
                            (kpis.closedAll.length /
                              opportunities.filter((o) =>
                                ["visita", "negociacion", "cierre"].includes(o.stage),
                              ).length) *
                              100,
                          )
                        : 0,
                      color: "#06B6D4",
                    },
                  ].map((r) => (
                    <div key={r.label}>
                      <div className="flex justify-between mb-1">
                        <span className="text-xs" style={{ color: "#6B7280" }}>
                          {r.label}
                        </span>
                        <span className="text-xs" style={{ color: r.color, fontWeight: 700 }}>
                          {r.pct}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full" style={{ background: "#F7F0FF" }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, r.pct)}%`,
                            background: `linear-gradient(90deg, ${r.color}, #FF5ECA)`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Funnel + propiedades */}
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Card padded>
                <div className="mb-6">
                  <h2 className="text-base" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                    Rendimiento del matching
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
                    De la compatibilidad detectada a la operación cerrada
                  </p>
                </div>
                <div className="space-y-4">
                  {funnel.map((step, idx) => {
                    const prev = idx > 0 ? funnel[idx - 1].value : null;
                    const rate = prev && prev > 0 ? Math.round((step.value / prev) * 1000) / 10 : null;
                    return (
                      <div key={step.label}>
                        <div className="flex items-center justify-between mb-1.5 gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ background: step.color }}
                            />
                            <span className="text-sm truncate" style={{ color: "#374151", fontWeight: 600 }}>
                              {step.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            {rate !== null && (
                              <span
                                className="text-xs px-2 py-0.5 rounded-full"
                                style={{ background: "#F7F0FF", color: "#9B21FF", fontWeight: 600 }}
                              >
                                {rate}%
                              </span>
                            )}
                            <span className="text-sm" style={{ color: "#1A1A1A", fontWeight: 800 }}>
                              {step.value}
                            </span>
                          </div>
                        </div>
                        <div className="h-3 rounded-full overflow-hidden" style={{ background: "#F7F0FF" }}>
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${(step.value / Math.max(1, funnel[0].value)) * 100}%`,
                              background: `linear-gradient(90deg, ${step.color}, #FF5ECA)`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div
                  className="mt-6 pt-4 border-t flex items-center justify-between"
                  style={{ borderColor: "#F0EDE6" }}
                >
                  <span className="text-xs" style={{ color: "#6B7280" }}>
                    Conversión total del funnel
                  </span>
                  <span className="text-gradient-brand-h" style={{ fontWeight: 800 }}>
                    {conversionRate}%
                  </span>
                </div>
              </Card>

              <Card>
                <SectionHeader
                  inCard
                  title="Rendimiento de propiedades"
                  subtitle="Por cantidad de matches generados"
                  action={{ label: "Ver todas", onClick: () => navigate("/propiedades") }}
                />
                {propertyPerf.length === 0 ? (
                  <EmptyState compact title="Sin datos" description="Todavía no hay matches ni oportunidades." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full" style={{ minWidth: 460 }}>
                      <thead>
                        <tr style={{ background: "#FAF8F5", borderBottom: "1px solid #F0EDE6" }}>
                          {["Propiedad", "Matches", "Oportunidades", "Visitas", "Estado"].map((h) => (
                            <th
                              key={h}
                              className="text-left px-5 py-3 text-xs uppercase tracking-wide whitespace-nowrap"
                              style={{ color: "#6B7280", letterSpacing: "0.06em", fontWeight: 600 }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {propertyPerf.map((row, idx) => {
                          const style = PROPERTY_STATUS_STYLE[row.property.status];
                          return (
                            <tr
                              key={row.property.id}
                              className="transition-all hover:bg-violet-50 cursor-pointer"
                              style={{
                                borderBottom:
                                  idx < propertyPerf.length - 1 ? "1px solid #FAF8F5" : undefined,
                              }}
                            >
                              <td className="px-5 py-3">
                                <p
                                  className="text-sm truncate max-w-[160px]"
                                  style={{ color: "#1A1A1A", fontWeight: 600 }}
                                >
                                  {row.property.title}
                                </p>
                                <p className="text-xs" style={{ color: "#6B7280" }}>
                                  {PROPERTY_TYPE_LABEL[row.property.type]}
                                </p>
                              </td>
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2">
                                  <div
                                    className="h-1.5 w-14 rounded-full overflow-hidden"
                                    style={{ background: "#E9E5DE" }}
                                  >
                                    <div
                                      className="h-full rounded-full"
                                      style={{
                                        width: `${(row.matchCount / Math.max(1, propertyPerf[0].matchCount)) * 100}%`,
                                        background: "var(--gradient-brand-h)",
                                      }}
                                    />
                                  </div>
                                  <span
                                    className="text-gradient-brand-h"
                                    style={{ fontWeight: 700, fontSize: 13 }}
                                  >
                                    {row.matchCount}
                                  </span>
                                </div>
                              </td>
                              <td className="px-5 py-3">
                                <span className="text-sm" style={{ color: "#374151", fontWeight: 500 }}>
                                  {row.opps}
                                </span>
                              </td>
                              <td className="px-5 py-3">
                                <span className="text-sm" style={{ color: "#374151", fontWeight: 500 }}>
                                  {row.visits}
                                </span>
                              </td>
                              <td className="px-5 py-3">
                                <Badge bg={style.bg} text={style.text} border={style.border} size="xs">
                                  {PROPERTY_STATUS_LABEL[row.property.status]}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>

            {/* Insights */}
            {insights.length > 0 && (
              <div className="mt-6">
                <SectionHeader
                  title="Insights"
                  subtitle="Conclusiones accionables calculadas sobre tus datos"
                />
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  {insights.map((ins) => (
                    <div
                      key={ins.label}
                      className="rounded-2xl border overflow-hidden transition-all hover:shadow-md cursor-pointer"
                      style={{ background: "white", borderColor: "#E9E5DE", boxShadow: "var(--shadow-card)" }}
                      onClick={() => navigate(ins.to)}
                    >
                      <div className="h-1" style={{ background: ins.accent }} />
                      <div className="p-5">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 text-xl"
                          style={{ background: ins.accentBg, border: `1px solid ${ins.accentBorder}` }}
                        >
                          {ins.emoji}
                        </div>
                        <p className="text-sm mb-1.5" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                          {ins.label}
                        </p>
                        <p className="text-xs leading-relaxed mb-4" style={{ color: "#6B7280" }}>
                          {ins.text}
                        </p>
                        <span
                          className="inline-block text-xs px-3 py-1.5 rounded-lg"
                          style={{
                            background: ins.accentBg,
                            color: ins.accent,
                            border: `1px solid ${ins.accentBorder}`,
                            fontWeight: 600,
                          }}
                        >
                          {ins.cta} →
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Equipo */}
            {team.length > 0 && (
              <div className="mt-6">
                <SectionHeader
                  title="Rendimiento del equipo"
                  subtitle="Ranking por oportunidades a cargo"
                />
                <Card>
                  <div className="overflow-x-auto">
                    <table className="w-full" style={{ minWidth: 560 }}>
                      <thead>
                        <tr style={{ background: "#FAF8F5", borderBottom: "1px solid #F0EDE6" }}>
                          {["#", "Agente", "Oportunidades", "Cierres"].map((h) => (
                            <th
                              key={h}
                              className="text-left px-6 py-3 text-xs uppercase tracking-wide"
                              style={{ color: "#6B7280", fontWeight: 600, letterSpacing: "0.06em" }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {team.map((row, idx) => (
                          <tr
                            key={row.agent.id}
                            className="transition-all hover:bg-violet-50"
                            style={{
                              borderBottom: idx < team.length - 1 ? "1px solid #FAF8F5" : undefined,
                            }}
                          >
                            <td className="px-6 py-4">
                              <div
                                className="w-7 h-7 rounded-full flex items-center justify-center text-sm"
                                style={
                                  idx === 0
                                    ? { background: "var(--gradient-brand)", color: "white", fontWeight: 800 }
                                    : { background: "#F7F0FF", color: "#6B7280", fontWeight: 700 }
                                }
                              >
                                {idx + 1}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div
                                  className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarGradient(row.agent.full_name)} flex items-center justify-center text-white flex-shrink-0`}
                                  style={{ fontWeight: 700, fontSize: 11 }}
                                >
                                  {initials(row.agent.full_name)}
                                </div>
                                <div>
                                  <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 600 }}>
                                    {row.agent.full_name}
                                  </p>
                                  <p className="text-xs" style={{ color: "#6B7280" }}>
                                    {row.agent.role === "owner" ? "Dueño" : "Agente inmobiliario"}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="max-w-[120px]">
                                <span className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                                  {row.opps}
                                </span>
                                <div className="h-1.5 rounded-full mt-1" style={{ background: "#F7F0FF" }}>
                                  <div
                                    className="h-full rounded-full"
                                    style={{
                                      width: `${(row.opps / Math.max(1, team[0].opps)) * 100}%`,
                                      background: "var(--gradient-brand-h)",
                                    }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                                {row.conv}
                              </span>
                              <span
                                className="text-xs ml-2 px-2 py-0.5 rounded-full"
                                style={{ background: "#F0FDF4", color: "#15803D", fontWeight: 600 }}
                              >
                                {row.rate}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function ReportKpi({
  value,
  label,
  sub,
  trend,
  grad,
  iconBg,
  icon,
  series,
  color,
}: {
  value: string;
  label: string;
  sub: string;
  /** Variación real contra el período anterior, o null si no hay con qué comparar. */
  trend: { text: string; up: boolean } | null;
  grad: string;
  iconBg: string;
  icon: React.ReactNode;
  series: number[];
  color: string;
}) {
  const max = Math.max(1, ...series);
  const points = series
    .map((v, i) => {
      const x = (i / Math.max(1, series.length - 1)) * 120;
      const y = 28 - (v / max) * 24;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div
      className="rounded-2xl border overflow-hidden transition-all hover:shadow-lg"
      style={{ background: "white", borderColor: "#E9E5DE", boxShadow: "var(--shadow-card-lg)" }}
    >
      <div className="px-5 pt-5 pb-4 flex items-start justify-between">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: iconBg }}>
          {icon}
        </div>
        {trend && (
          <span
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full whitespace-nowrap"
            style={
              trend.up
                ? { background: "#F0FDF4", color: "#15803D", fontWeight: 700 }
                : { background: "#FFF1F2", color: "#E11D48", fontWeight: 700 }
            }
          >
            <span style={{ display: "inline-flex", transform: trend.up ? undefined : "rotate(180deg)" }}>
              <TrendUpIcon />
            </span>
            {trend.text}
          </span>
        )}
      </div>
      <div className="px-5 pb-3">
        <p
          className="text-3xl tracking-tight leading-none"
          style={{
            fontWeight: 800,
            background: grad,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {value}
        </p>
        <p className="text-sm mt-1.5" style={{ color: "#374151", fontWeight: 600 }}>
          {label}
        </p>
        <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
          {sub}
        </p>
      </div>
      <div className="px-5 pb-4">
        <svg width="100%" height="32" viewBox="0 0 120 32" preserveAspectRatio="none">
          <polyline
            points={points}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}

function ConversionRing({ pct }: { pct: number }) {
  const size = 140;
  const sw = 12;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(100, pct) / 100) * circ;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id="convGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#9B21FF" />
            <stop offset="100%" stopColor="#FF5ECA" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E9E5DE" strokeWidth={sw} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#convGrad)"
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-gradient-brand" style={{ fontSize: 32, fontWeight: 800, lineHeight: 1 }}>
          {pct}%
        </span>
        <span style={{ color: "#6B7280", fontWeight: 600, fontSize: 11, marginTop: 2 }}>
          conversión
        </span>
      </div>
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{ background: "white", border: "1px solid #E9E5DE", boxShadow: "var(--shadow-pop)" }}
    >
      <p className="text-xs mb-2" style={{ color: "#6B7280", fontWeight: 600 }}>
        {label}
      </p>
      {payload.map((e) => (
        <div key={e.name} className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: e.color }} />
          <span className="text-xs" style={{ color: "#6B7280" }}>
            {e.name}:
          </span>
          <span className="text-xs" style={{ color: "#1A1A1A", fontWeight: 700 }}>
            {e.value}
          </span>
        </div>
      ))}
    </div>
  );
}
