import type { ReactNode } from "react";

export const INK = "#1A1A1A";
export const LILAC = "#6B7280";
export const LINE = "#E9E5DE";

export const btnGhost =
  "min-h-[44px] md:min-h-[36px] px-3.5 rounded-xl text-sm border transition-colors hover:border-violet-300 inline-flex items-center justify-center gap-1.5";
export const btnGhostStyle = { borderColor: LINE, color: "#7C0BD8", fontWeight: 600, background: "white" } as const;
export const btnPrimaryStyle = { background: "var(--gradient-brand)", color: "white", fontWeight: 600 } as const;
export const inputCls =
  "w-full px-3.5 min-h-[44px] rounded-xl text-sm border outline-none bg-white text-[#1A1A1A] placeholder:text-[#6B7280] border-[#E9E5DE] focus:border-[#9B21FF] focus-visible:ring-2 focus-visible:ring-[#9B21FF]/30";

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      // 44px de alto táctil aunque la pista sea más chica.
      className="relative inline-flex items-center justify-center min-w-[52px] min-h-[44px] flex-shrink-0 rounded-xl"
    >
      <span
        aria-hidden="true"
        className="relative block w-11 h-6 rounded-full transition-colors motion-reduce:transition-none"
        style={{ background: checked ? "#9B21FF" : "#D6D1C8" }}
      >
        <span
          className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none"
          style={{ transform: checked ? "translateX(20px)" : "none" }}
        />
      </span>
    </button>
  );
}

export function Pill({
  children,
  tone = "violet",
}: {
  children: ReactNode;
  tone?: "violet" | "green" | "gray" | "red" | "amber";
}) {
  const t = {
    violet: ["#F0EDE6", "#7C0BD8"],
    green: ["#DCFCE7", "#166534"],
    gray: ["#F0EDE6", "#374151"],
    red: ["#FFE4E6", "#BE123C"],
    amber: ["#FEF3C7", "#92400E"],
  }[tone];
  return (
    <span className="text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: t[0], color: t[1], fontWeight: 700 }}>
      {children}
    </span>
  );
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs" style={{ color: INK, fontWeight: 700 }}>
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-xs" style={{ color: "#6B7280" }}>
          {hint}
        </p>
      )}
    </div>
  );
}
