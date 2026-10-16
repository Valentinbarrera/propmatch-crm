import type { ReactNode } from "react";

/**
 * Card de KPI.
 *
 * Aparecía cuatro veces en el prototipo (dashboard, Contactos, Propiedades,
 * Oportunidades) con el mismo layout: icono con fondo tintado, badge de
 * tendencia, número grande, etiqueta, sub-etiqueta y barra de progreso.
 * Los valores ahora llegan calculados desde la base.
 */
export function StatCard({
  value,
  label,
  sub,
  icon,
  iconBg,
  badge,
  badgeBg = "#F0FDF4",
  badgeText = "#15803D",
  bar,
  barWidth,
  loading = false,
}: {
  value: string;
  label: string;
  sub?: string;
  icon: ReactNode;
  iconBg: string;
  badge?: string;
  badgeBg?: string;
  badgeText?: string;
  /** Gradiente de la barra inferior. */
  bar: string;
  /** 0–100. Se calcula contra el máximo del período, no se hardcodea. */
  barWidth: number;
  loading?: boolean;
}) {
  return (
    <div
      className="rounded-2xl p-5 border flex flex-col gap-4 transition-all hover:shadow-md"
      style={{ background: "white", borderColor: "#E9E5DE", boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-start justify-between">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: iconBg }}
        >
          {icon}
        </div>
        {badge && !loading && (
          <span
            className="text-xs px-2.5 py-1 rounded-full whitespace-nowrap"
            style={{ background: badgeBg, color: badgeText, fontWeight: 600 }}
          >
            {badge}
          </span>
        )}
      </div>

      <div>
        {loading ? (
          <div className="h-8 w-24 rounded-lg animate-pulse" style={{ background: "#F7F0FF" }} />
        ) : (
          <p
            className="tracking-tight"
            style={{
              color: "#1A1A1A",
              fontWeight: 800,
              // El prototipo achicaba la tipografía cuando el valor era largo
              // ("USD 1.250.000"). Se conserva el mismo umbral.
              fontSize: value.length > 8 ? "1.1rem" : "1.5rem",
            }}
          >
            {value}
          </p>
        )}
        <p className="text-sm mt-0.5" style={{ color: "#9CA3AF" }}>
          {label}
        </p>
        {sub && (
          <p className="text-xs mt-1" style={{ color: "#6B7280" }}>
            {sub}
          </p>
        )}
      </div>

      <div className="h-1.5 rounded-full" style={{ background: "#F7F0FF" }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(100, Math.max(0, barWidth))}%`, background: bar }}
        />
      </div>
    </div>
  );
}
