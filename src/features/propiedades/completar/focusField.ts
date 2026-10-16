/**
 * Lleva la pantalla a un control concreto, le da foco y lo resalta un momento.
 * Lo usan los botones "Completar" del editor y del publicador.
 */

const FOCUSABLE = "input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]";

/** `true` si encontró el elemento. */
export function focusField(id: string): boolean {
  const target = document.getElementById(id);
  if (!target) return false;
  const focusable = target.matches(FOCUSABLE) ? target : target.querySelector<HTMLElement>(FOCUSABLE) ?? target;
  // Lo que se resalta es la caja completa (label + control), no solo el input.
  const box = (focusable.closest("label, [role=group]") as HTMLElement | null) ?? target;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  box.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  focusable.focus({ preventScroll: true });

  if (typeof box.animate === "function") {
    box.animate(
      [
        { boxShadow: "0 0 0 4px rgba(168, 85, 255, 0.45)", background: "#F7F0FF", borderRadius: "12px" },
        { boxShadow: "0 0 0 4px rgba(168, 85, 255, 0.45)", background: "#F7F0FF", borderRadius: "12px", offset: 0.7 },
        { boxShadow: "0 0 0 0 rgba(168, 85, 255, 0)", background: "transparent", borderRadius: "12px" },
      ],
      { duration: reduce ? 1200 : 1800, easing: "ease-out" },
    );
  }
  return true;
}
