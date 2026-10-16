import type { CSSProperties, ReactNode } from "react";

/**
 * Card estándar de PropMatch.
 * Mismo borde (#E9E5DE), mismo radio (2xl) y misma sombra que el prototipo,
 * que los repetía inline en cada uno de los ~60 contenedores.
 */
export function Card({
  children,
  className = "",
  padded = false,
  hover = false,
  style,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  hover?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      className={[
        "rounded-2xl border overflow-hidden",
        padded ? "p-5" : "",
        hover ? "transition-all hover:shadow-md" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        background: "white",
        borderColor: "#E9E5DE",
        boxShadow: "var(--shadow-card)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Cabecera de sección: título + subtítulo + acción opcional a la derecha. */
export function SectionHeader({
  title,
  subtitle,
  action,
  className = "",
  inCard = false,
}: {
  title: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
  /** `true` cuando va dentro de una Card (agrega padding y borde inferior). */
  inCard?: boolean;
}) {
  return (
    <div
      className={[
        "flex items-center justify-between gap-4",
        inCard ? "px-5 py-4 border-b" : "mb-4",
        className,
      ].join(" ")}
      style={inCard ? { borderColor: "#F0EDE6", background: "white" } : undefined}
    >
      <div className="min-w-0">
        <h2 className="text-base" style={{ color: "#1A1A1A", fontWeight: 700 }}>
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
            {subtitle}
          </p>
        )}
      </div>
      {action && (
        <button
          onClick={action.onClick}
          className="text-xs px-3 py-1.5 rounded-lg transition-all hover:bg-violet-100 flex-shrink-0"
          style={{ color: "#9B21FF", background: "#F7F0FF", fontWeight: 600 }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/** Badge de estado (Disponible, Reservada, Activo, …). */
export function Badge({
  children,
  bg,
  text,
  border,
  size = "sm",
}: {
  children: ReactNode;
  bg: string;
  text: string;
  border?: string;
  size?: "xs" | "sm";
}) {
  return (
    <span
      className={`text-xs rounded-full whitespace-nowrap ${
        size === "xs" ? "px-2 py-0.5" : "px-3 py-1"
      } ${border ? "border" : ""}`}
      style={{ background: bg, color: text, borderColor: border, fontWeight: 600 }}
    >
      {children}
    </span>
  );
}
