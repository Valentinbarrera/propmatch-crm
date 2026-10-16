/**
 * Formateo compartido.
 *
 * En el prototipo los precios eran strings ("USD 185.000") y los tiempos
 * también ("Hace 2 horas"). Con datos reales hay que derivarlos, y el formato
 * de salida tiene que quedar idéntico al del diseño.
 */

import type { CurrencyCode, OperationType, PropertyType } from "@/types/db";

/** "USD 185.000" — mismo formato que mostraba el prototipo. */
export function money(
  amount: number | null | undefined,
  currency: CurrencyCode = "USD",
): string {
  if (amount === null || amount === undefined) return "—";
  return `${currency} ${Math.round(amount).toLocaleString("es-AR")}`;
}

/** "USD 1,25M" / "USD 185K" — para KPIs y cabeceras de columna del kanban. */
export function moneyCompact(
  amount: number | null | undefined,
  currency: CurrencyCode = "USD",
): string {
  if (amount === null || amount === undefined) return "—";
  if (amount >= 1_000_000) {
    return `${currency} ${(amount / 1_000_000).toFixed(2).replace(".", ",")}M`;
  }
  if (amount >= 1_000) return `${currency} ${Math.round(amount / 1_000)}K`;
  return `${currency} ${Math.round(amount)}`;
}

/** "Hace 20 min" · "Hoy, 10:42" · "Ayer" · "Hace 3 días" */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const mins = Math.floor(diffMs / 60_000);

  if (mins < 1) return "Recién";
  if (mins < 60) return `Hace ${mins} min`;

  const sameDay = then.toDateString() === now.toDateString();
  if (sameDay) {
    const hours = Math.floor(mins / 60);
    if (hours <= 5) return `Hace ${hours} ${hours === 1 ? "hora" : "horas"}`;
    return `Hoy, ${then.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (then.toDateString() === yesterday.toDateString()) {
    return `Ayer, ${then.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`;
  }

  const days = Math.floor(mins / 1440);
  if (days < 30) return `Hace ${days} ${days === 1 ? "día" : "días"}`;
  return then.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

/** "3d en esta etapa" / "Ingresó hoy" — reemplaza el `daysInStage` hardcodeado. */
export function daysInStage(stageSince: string | null | undefined): string {
  if (!stageSince) return "—";
  const days = Math.floor((Date.now() - new Date(stageSince).getTime()) / 86_400_000);
  return days === 0 ? "Ingresó hoy" : `${days}d en esta etapa`;
}

/** "MR" a partir de "Martín Rodríguez". */
export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

/**
 * Gradiente de avatar estable por nombre.
 *
 * El prototipo guardaba el gradiente junto a cada persona (`avatarGrad`), lo
 * cual no se puede persistir por contacto sin ensuciar el modelo. Se deriva del
 * nombre: la misma persona siempre tiene el mismo color, en toda la app.
 */
const AVATAR_GRADIENTS = [
  "from-violet-400 to-purple-600",
  "from-pink-400 to-rose-600",
  "from-emerald-400 to-teal-600",
  "from-fuchsia-400 to-pink-600",
  "from-amber-400 to-orange-500",
  "from-violet-500 to-indigo-600",
  "from-cyan-400 to-blue-600",
  "from-sky-400 to-blue-600",
  "from-indigo-400 to-violet-500",
  "from-teal-400 to-emerald-600",
];

export function avatarGradient(name: string | null | undefined): string {
  if (!name) return AVATAR_GRADIENTS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

/* ── Etiquetas legibles de los enums ──────────────────────────────────────── */

export const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
  casa: "Casa",
  departamento: "Departamento",
  ph: "PH",
  terreno: "Terreno",
  local: "Local",
  oficina: "Oficina",
};

export const OPERATION_LABEL: Record<OperationType, string> = {
  venta: "Venta",
  alquiler: "Alquiler",
  alquiler_temporal: "Alquiler temporal",
};

export const CONTACT_STATUS_LABEL = {
  nuevo: "Nuevo",
  activo: "Activo",
  en_seguimiento: "En seguimiento",
  visita_programada: "Visita programada",
  cerrado: "Cerrado",
  perdido: "Perdido",
} as const;

export const PROPERTY_STATUS_LABEL = {
  disponible: "Disponible",
  reservada: "Reservada",
  vendida: "Vendida",
  alquilada: "Alquilada",
  pausada: "Pausada",
  en_revision: "En revisión",
} as const;

/** Paletas de badge — los mismos hex que usaba el prototipo. */
type BadgeStyle = { bg: string; text: string; border: string };

export const CONTACT_STATUS_STYLE: Record<string, BadgeStyle> = {
  nuevo: { bg: "#F7F0FF", text: "#9B21FF", border: "#DDD8CF" },
  activo: { bg: "#F0FDF4", text: "#15803D", border: "#BBF7D0" },
  en_seguimiento: { bg: "#FFFBEB", text: "#B45309", border: "#FDE68A" },
  visita_programada: { bg: "#EFF6FF", text: "#2563EB", border: "#BFDBFE" },
  cerrado: { bg: "#F0FDF4", text: "#047857", border: "#D1FAE5" },
  perdido: { bg: "#FFF1F2", text: "#E11D48", border: "#FECDD3" },
};

export const PROPERTY_STATUS_STYLE: Record<string, BadgeStyle> = {
  disponible: { bg: "#F0FDF4", text: "#15803D", border: "#BBF7D0" },
  reservada: { bg: "#FFFBEB", text: "#B45309", border: "#FDE68A" },
  vendida: { bg: "#F7F0FF", text: "#9B21FF", border: "#DDD8CF" },
  alquilada: { bg: "#F7F0FF", text: "#9B21FF", border: "#DDD8CF" },
  pausada: { bg: "#F9FAFB", text: "#6B7280", border: "#E5E7EB" },
  en_revision: { bg: "#EFF6FF", text: "#2563EB", border: "#BFDBFE" },
};

/**
 * Lectura del score. Los umbrales salen tal cual de `getMatchState` en
 * VerMatch.tsx del prototipo.
 */
export function matchState(score: number): BadgeStyle & { label: string } {
  if (score >= 90) return { label: "Match excelente", text: "#15803D", bg: "#F0FDF4", border: "#BBF7D0" };
  if (score >= 70) return { label: "Buen match", text: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" };
  if (score >= 50) return { label: "Match parcial", text: "#B45309", bg: "#FFFBEB", border: "#FDE68A" };
  return { label: "Match bajo", text: "#DC2626", bg: "#FFF1F2", border: "#FECDD3" };
}

/** "Excelente coincidencia" — el copy secundario del panel de compatibilidad. */
export function matchQuality(score: number): string {
  if (score >= 90) return "Excelente coincidencia";
  if (score >= 80) return "Muy buena coincidencia";
  return "Buena coincidencia";
}

/** Saludo del dashboard: el prototipo decía siempre "Buenos días". */
export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return "Buenos días";
  if (h < 20) return "Buenas tardes";
  return "Buenas noches";
}
