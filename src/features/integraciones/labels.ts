import type { PortalStatus } from "./api";

export type Label = { text: string; bg: string; fg: string };

export const LABEL: Record<string, Label> = {
  connected: { text: "Conectado", bg: "#DCFCE7", fg: "#15803D" },
  not_connected: { text: "No conectado", bg: "#F3F4F6", fg: "#4B5563" },
  error: { text: "Error", bg: "#FFE4E6", fg: "#BE123C" },
  needs_reauth: { text: "Requiere reconectar", bg: "#FEF3C7", fg: "#92400E" },
  coming_soon: { text: "Próximamente", bg: "#E9E5DE", fg: "#7C0BD8" },
  needs_approval: { text: "Requiere aprobación", bg: "#FEF3C7", fg: "#92400E" },
  not_configured: { text: "No disponible", bg: "#F3F4F6", fg: "#4B5563" },
};

/** Etiqueta a mostrar: primero la conexión de la agencia, si no, la disponibilidad del portal. */
export function stateLabel(s: PortalStatus): Label {
  if (s.state === "connected" || s.state === "needs_reauth" || s.state === "error") {
    if (s.state === "connected" && s.authMethod === "credentials" && !s.lastCheckedAt) return { ...LABEL.connected, text: "Conectado (sin verificar)" };
    return LABEL[s.state];
  }
  if (s.availability.state !== "available") return LABEL[s.availability.state];
  return LABEL.not_connected;
}

