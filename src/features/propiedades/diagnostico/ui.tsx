import type { ReactNode } from "react";
import type { Positioning, SignalStatus } from "@/lib/propertyDiagnostic";

/** Colores de estado del sistema (todos AA sobre su fondo). El emoji nunca va solo: siempre con texto. */
export const TONE: Record<SignalStatus, { bg: string; text: string; border: string; dot: string; label: string }> = {
  verde: { bg: "#F0FDF4", text: "#15803D", border: "#BBF7D0", dot: "🟢", label: "Bien" },
  amarillo: { bg: "#FFFBEB", text: "#B45309", border: "#FDE68A", dot: "🟡", label: "Atención" },
  rojo: { bg: "#FFF1F2", text: "#BE123C", border: "#FECDD3", dot: "🔴", label: "Crítico" },
  sin_datos: { bg: "#F8FAFC", text: "#475569", border: "#E2E8F0", dot: "⚪", label: "Sin datos" },
};

export const POSITIONING: Record<Positioning, { tone: SignalStatus; label: string }> = {
  debajo: { tone: "amarillo", label: "Por debajo del rango" },
  dentro: { tone: "verde", label: "Dentro del rango" },
  encima: { tone: "rojo", label: "Por encima del rango" },
};

export function ToneChip({ tone, children }: { tone: SignalStatus; children: ReactNode }) {
  const t = TONE[tone];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border whitespace-nowrap"
      style={{ background: t.bg, color: t.text, borderColor: t.border, fontWeight: 700 }}
    >
      <span aria-hidden="true">{t.dot}</span>
      {children}
    </span>
  );
}

/** Mini-métrica. `value === null` se muestra como "Sin datos" con el motivo, nunca como 0. */
export function Metric({
  label,
  value,
  hint,
  missingReason,
}: {
  label: string;
  value: ReactNode | null;
  hint?: string;
  missingReason?: string;
}) {
  const missing = value === null;
  return (
    <div className="rounded-xl px-3 py-2.5 min-w-0" style={{ background: "#FAF8F5", border: "1px solid #F0EDE6" }}>
      <p className="text-xs" style={{ color: "#6B7280", fontWeight: 600 }}>
        {label}
      </p>
      <p
        className={missing ? "text-sm mt-0.5" : "text-lg"}
        style={{ color: missing ? "#475569" : "#1A1A1A", fontWeight: missing ? 600 : 800 }}
      >
        {missing ? "Sin datos" : value}
      </p>
      {(missing ? missingReason : hint) && (
        <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
          {missing ? missingReason : hint}
        </p>
      )}
    </div>
  );
}

/** Desplegable nativo (`details`): teclado y lector de pantalla sin código extra. */
export function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl border" style={{ borderColor: "#E9E5DE" }}>
      <summary
        className="min-h-11 px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer list-none rounded-xl hover:bg-violet-50"
        style={{ color: "#1A1A1A", fontWeight: 700 }}
      >
        <span className="text-sm">{title}</span>
        <span aria-hidden="true" className="text-xs transition-transform group-open:rotate-180" style={{ color: "#9B21FF" }}>
          ▼
        </span>
      </summary>
      <div className="px-4 pb-4 pt-1">{children}</div>
    </details>
  );
}

export function BlockTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h3 id={id} className="text-xs uppercase mb-3" style={{ color: "#6B7280", fontWeight: 700, letterSpacing: "0.1em" }}>
      {children}
    </h3>
  );
}
