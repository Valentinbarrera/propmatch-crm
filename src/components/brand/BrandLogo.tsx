import { useId } from "react";

/*
 * Isotipo real de PropMatch: la casa y el corazón en una sola línea, el dibujo
 * del ícono de la app en el App Store y del banner del evento. Mismo vector que
 * la web (web/src/components/ui/logo.tsx en el repo de la app), reconstruido
 * contra los píxeles de app/assets/icon.png, con los colores medidos del ícono.
 */
const PATH =
  "M512 526C500 496 461 472 433 472C400 472 349 510 349 557C349 641 436 726 512 776C550 799 609 833 655 833L750 833C763 833 818 809 818 735L818 483C818 449 801 420 784 400L584 216C564.4 198 538.6 188 512 188M512 526C524 496 563 472 591 472C624 472 675 510 675 557C675 641 588 726 512 776C474 799 415 833 369 833L274 833C261 833 206 809 206 735L206 483C206 449 223 420 240 400L440 216C459.6 198 485.4 188 512 188";

const STOPS = [
  ["0", "#3C7FFA"],
  ["0.23", "#6962E4"],
  ["0.37", "#8332C3"],
  ["0.5", "#C642D3"],
  ["0.62", "#EE45D0"],
  ["0.77", "#FE6A8E"],
  ["1", "#FF805B"],
] as const;

export function Isotipo({ size = 28, strokeWidth = 40, white = false }: { size?: number; strokeWidth?: number; white?: boolean }) {
  const id = `pm-iso-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const pad = Math.max(0, (strokeWidth - 27) / 2);
  const w = 644 + pad * 2;
  const h = 678 + pad * 2;
  return (
    <svg width={Math.round((size * w) / h)} height={size} viewBox={`${190 - pad} ${172 - pad} ${w} ${h}`} fill="none" aria-hidden="true" className="shrink-0">
      {!white && (
        <defs>
          <linearGradient id={id} x1="207" y1="0" x2="818" y2="0" gradientUnits="userSpaceOnUse">
            {STOPS.map(([o, c]) => (
              <stop key={o} offset={o} stopColor={c} />
            ))}
          </linearGradient>
        </defs>
      )}
      <path d={PATH} stroke={white ? "#fff" : `url(#${id})`} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Isotipo + "PropMatch" (como el banner y la app). */
export function BrandLogo({ size = 30, light = false }: { size?: number; light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Isotipo size={size} white={light} />
      <span
        className="tracking-tight"
        style={{ fontWeight: 800, fontSize: Math.round(size * 0.74), letterSpacing: "-0.02em", color: light ? "#fff" : "var(--color-ink)" }}
      >
        PropMatch
      </span>
    </span>
  );
}
