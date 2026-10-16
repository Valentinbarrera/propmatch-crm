import { useId } from "react";

/**
 * Anillo de compatibilidad.
 *
 * Estaba escrito tres veces en el prototipo (MatchScoreCard en Contactos,
 * MatchScoreCircle en Matches, OverallScoreRing en VerMatch) con la misma
 * matemática y distinto tamaño. Es un solo componente parametrizado.
 *
 * El id del gradiente se genera con useId(): en el prototipo se armaba con el
 * índice de la lista, así que dos anillos con el mismo índice en pantallas
 * distintas colisionaban y uno se quedaba sin color.
 */
export function ScoreRing({
  score,
  size = 100,
  strokeWidth = 8,
  showLabel = true,
  labelSize,
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
  labelSize?: number;
}) {
  const gradientId = useId();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, score)) / 100) * circumference;
  const fontSize = labelSize ?? Math.round(size * 0.26);

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#9B21FF" />
            <stop offset="100%" stopColor="#FF5ECA" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E9E5DE"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      {showLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="leading-none text-gradient-brand" style={{ fontSize, fontWeight: 800 }}>
            {score}%
          </span>
          {size >= 90 && (
            <span
              style={{ color: "#9B21FF", fontWeight: 800, fontSize: "8px", letterSpacing: "0.1em" }}
            >
              MATCH
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Barra de un factor de compatibilidad ("Ubicación 95%").
 * Idéntica a FactorBar del prototipo.
 */
export function FactorBar({
  label,
  pct,
  color,
}: {
  label: string;
  pct: number;
  color: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
          <span className="text-xs" style={{ color: "#374151", fontWeight: 600 }}>
            {label}
          </span>
        </div>
        <span
          className="text-xs"
          style={{
            fontWeight: 800,
            background: `linear-gradient(90deg, ${color}, #FF5ECA)`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {pct}%
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "#F7F0FF" }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}, #FF5ECA)`,
            transition: "width 0.6s ease",
          }}
        />
      </div>
    </div>
  );
}

/** Los 5 factores del motor, con el color que les asigna el diseño. */
export const MATCH_FACTORS = [
  { key: "score_location", label: "Ubicación", color: "#9B21FF" },
  { key: "score_budget", label: "Presupuesto", color: "#FF5ECA" },
  { key: "score_type", label: "Tipo de propiedad", color: "#3B82F6" },
  { key: "score_size", label: "Ambientes y superficie", color: "#A855FF" },
  { key: "score_features", label: "Características", color: "#06B6D4" },
] as const;
