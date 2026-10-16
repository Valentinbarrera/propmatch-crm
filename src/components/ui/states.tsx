import type { ReactNode } from "react";

/**
 * Estados vacío / cargando / error.
 *
 * El prototipo no los tenía (salvo un "Sin oportunidades urgentes 🎉"): con
 * datos mock siempre había algo que mostrar. Con datos reales, una agencia
 * recién creada arranca con todo vacío, así que estos estados son parte del
 * producto, no un extra.
 */

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? "py-8 px-4" : "py-16 px-6"
      }`}
    >
      {icon && (
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: "var(--gradient-soft)", border: "1px solid #E9E5DE" }}
        >
          {icon}
        </div>
      )}
      <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
        {title}
      </p>
      {description && (
        <p className="text-xs mt-1.5 max-w-xs" style={{ color: "#6B7280" }}>
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-5 px-5 py-2.5 rounded-xl text-sm text-white transition-all hover:opacity-90 active:scale-95"
          style={{
            background: "var(--gradient-brand)",
            fontWeight: 600,
            boxShadow: "var(--shadow-cta)",
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: "#FFF1F2", border: "1px solid #FECDD3" }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="#E11D48" strokeWidth="2" />
          <path d="M12 8v4M12 16h.01" stroke="#E11D48" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
        No pudimos cargar esta información
      </p>
      <p className="text-xs mt-1.5 max-w-sm" style={{ color: "#6B7280" }}>
        {message}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-5 px-4 py-2 rounded-xl text-sm border transition-all hover:border-violet-300"
          style={{ borderColor: "#E9E5DE", color: "#9B21FF", fontWeight: 600, background: "#FAF8F5" }}
        >
          Reintentar
        </button>
      )}
    </div>
  );
}

/** Bloque gris animado, con el lila de la marca en lugar del gris por defecto. */
export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`animate-pulse rounded-xl ${className}`}
      style={{ background: "#F7F0FF", ...style }}
    />
  );
}

/** Grilla de skeletons para listados de cards. */
export function SkeletonGrid({ count = 6, columns = 3 }: { count?: number; columns?: number }) {
  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-72" />
      ))}
    </div>
  );
}

/** Filas de skeleton para tablas. */
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="p-5 space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12" />
      ))}
    </div>
  );
}

/** Pantalla completa de carga (arranque de la app). */
export function FullPageLoader() {
  return (
    <div className="h-full flex items-center justify-center" style={{ background: "#FAF8F5" }}>
      <div className="flex flex-col items-center gap-4">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center animate-pulse"
          style={{ background: "var(--gradient-brand)" }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M3 12L12 3L21 12V21H15V15H9V21H3V12Z" fill="white" fillOpacity="0.9" />
            <circle cx="16" cy="8" r="3" fill="white" fillOpacity="0.7" />
          </svg>
        </div>
        <p className="text-xs" style={{ color: "#6B7280", fontWeight: 600 }}>
          Cargando PropMatch…
        </p>
      </div>
    </div>
  );
}
