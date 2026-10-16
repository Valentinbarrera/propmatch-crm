/**
 * Promo de lanzamiento: 6 meses gratis de PropMatch Premium para las
 * inmobiliarias que crean su cuenta (el QR del banner del evento con
 * inmobiliarias del 16/10/2026 lleva al login).
 *
 * Una sola fuente para el front (login, registro, sidebar) y el server
 * (api/saas.ts guarda el beneficio en la metadata del usuario al registrarlo,
 * así queda constancia de quién lo activó y hasta cuándo vale). Para cortar la
 * promo: `active: false` (las cuentas que ya la activaron la conservan).
 */
export const LAUNCH_PROMO = {
  active: true,
  code: "lanzamiento-6m",
  plan: "Premium",
  months: 6,
  /** Lo que incluye, igual que el banner. */
  includes: ["Matching", "Propiedades", "Leads", "Visitas", "Propuestas", "Seguimiento"],
} as const;

export type PromoGrant = {
  code: string;
  plan: string;
  months: number;
  started_at: string;
  until: string;
};

/** El beneficio que se le otorga a una cuenta que se registra ahora. */
export function promoGrant(now: Date = new Date()): PromoGrant {
  const until = new Date(now);
  const day = until.getDate();
  until.setMonth(until.getMonth() + LAUNCH_PROMO.months);
  // 31/08 + 6 meses no es "3 de marzo": se queda en el último día de febrero.
  if (until.getDate() !== day) until.setDate(0);
  return {
    code: LAUNCH_PROMO.code,
    plan: LAUNCH_PROMO.plan,
    months: LAUNCH_PROMO.months,
    started_at: now.toISOString(),
    until: until.toISOString(),
  };
}

/** Lee el beneficio de la metadata de un usuario de Supabase (o null). */
export function readPromoGrant(metadata: unknown): PromoGrant | null {
  const promo = (metadata as { promo?: Partial<PromoGrant> } | null | undefined)?.promo;
  if (!promo || typeof promo.until !== "string" || typeof promo.plan !== "string") return null;
  return promo as PromoGrant;
}

/** "16 de abril de 2027" */
export function formatPromoDate(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}
