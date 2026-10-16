import { useState } from "react";
import type { VozData, VozKind } from "../../../shared/voz";
import { MicIcon } from "./icons";
import { VozModal } from "./VozModal";

/** Botón "Dictar" que abre la carga por voz. `onApply` recibe lo revisado; nunca guarda. */
export function DictarButton({
  kind,
  onApply,
  label = "Dictar",
  applyLabel,
  className,
}: {
  kind: VozKind;
  onApply: (r: VozData) => void;
  label?: string;
  applyLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        title={kind === "propiedad" ? "Dictá los datos y se completa la ficha" : "Dictá qué busca el cliente y se completa la búsqueda"}
        className={
          className ??
          "flex items-center gap-1.5 px-4 min-h-11 rounded-xl text-sm whitespace-nowrap transition-all hover:bg-violet-50 active:scale-[0.98]"
        }
        style={{ background: "white", color: "#9B21FF", fontWeight: 600, border: "1px solid #DDD8CF" }}
      >
        <MicIcon size={16} color="#9B21FF" />
        {label}
      </button>
      {open && <VozModal kind={kind} applyLabel={applyLabel} onApply={onApply} onClose={() => setOpen(false)} />}
    </>
  );
}
