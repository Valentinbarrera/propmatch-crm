import type { ReactNode } from "react";

/** Piezas de formulario compartidas por las tarjetas de Configuración. */

export const inputClass =
  "w-full px-4 py-2.5 rounded-xl text-sm border outline-none transition-all bg-white " +
  "text-[#1A1A1A] placeholder:text-[#6B7280] border-[#E9E5DE] focus:border-[#9B21FF] focus:ring-4 focus:ring-[#E9E5DE] " +
  "disabled:bg-[#FAF8F5] disabled:text-[#6B7280] disabled:cursor-not-allowed";

export function Field({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs mb-1.5" style={{ color: "#6B7280", fontWeight: 600 }}>
        {label}
      </span>
      {children}
    </label>
  );
}
