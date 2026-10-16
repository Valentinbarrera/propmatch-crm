import { LAUNCH_PROMO, formatPromoDate, type PromoGrant } from "../../../shared/promo";

/**
 * Voucher de la promo de lanzamiento (6 meses gratis de Premium).
 *
 * - `offer`: lo que te llevás si creás la cuenta (login y registro: es a donde
 *   lleva el QR del banner). Tiene que sentirse como un beneficio que se
 *   adquiere, no como "registrate y tenés acceso".
 * - `granted`: el beneficio ya activado, con la fecha hasta la que vale.
 */
export default function PromoTicket({
  variant = "offer",
  grant,
  agencyName,
  compact = false,
}: {
  variant?: "offer" | "granted";
  grant?: PromoGrant | null;
  agencyName?: string;
  compact?: boolean;
}) {
  const granted = variant === "granted";
  return (
    <div className="rounded-[22px] p-[1.5px]" style={{ background: "var(--gradient-brand)", boxShadow: "var(--shadow-cta)" }}>
      <div className="relative rounded-[21px] bg-white overflow-hidden">
        {/* Brillo suave de marca */}
        <div aria-hidden className="absolute inset-0 opacity-70" style={{ background: "var(--gradient-soft)" }} />

        <div className={`relative ${compact ? "px-4 pt-4 pb-3.5" : "px-5 pt-5 pb-4"}`}>
          <div className="flex items-center justify-between gap-3">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] uppercase tracking-[0.08em] text-white"
              style={{ background: "var(--gradient-brand)", fontWeight: 800 }}
            >
              {granted ? <CheckIcon /> : <GiftIcon />}
              {granted ? "Beneficio activado" : "Beneficio de lanzamiento"}
            </span>
            <span className="text-[11px] uppercase tracking-[0.08em] text-ink-soft" style={{ fontWeight: 700 }}>
              {LAUNCH_PROMO.plan}
            </span>
          </div>

          <p
            className={`mt-3 leading-[0.95] tracking-tight text-gradient-brand-h ${compact ? "text-[30px]" : "text-[38px]"}`}
            style={{ fontWeight: 900 }}
          >
            {LAUNCH_PROMO.months} MESES GRATIS
          </p>
          <p className="mt-1.5 text-sm text-ink" style={{ fontWeight: 700 }}>
            PropMatch {LAUNCH_PROMO.plan} + CRM completo
          </p>
        </div>

        {/* Troquel del voucher */}
        <div className="relative flex items-center" aria-hidden>
          <span className="absolute -left-2.5 h-5 w-5 rounded-full" style={{ background: "var(--color-background)" }} />
          <span className="mx-4 flex-1 border-t-2 border-dashed" style={{ borderColor: "var(--color-lilac)" }} />
          <span className="absolute -right-2.5 h-5 w-5 rounded-full" style={{ background: "var(--color-background)" }} />
        </div>

        <div className={`relative ${compact ? "px-4 pt-3 pb-4" : "px-5 pt-3.5 pb-5"}`}>
          {granted && grant ? (
            <div className="flex flex-col gap-1">
              {agencyName && (
                <p className="text-xs text-ink-soft">
                  Para <span className="text-ink" style={{ fontWeight: 700 }}>{agencyName}</span>
                </p>
              )}
              <p className="text-sm text-ink">
                Válido hasta el <span style={{ fontWeight: 800 }}>{formatPromoDate(grant.until)}</span>
              </p>
            </div>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {LAUNCH_PROMO.includes.map((item) => (
                <li
                  key={item}
                  className="inline-flex items-center gap-1 rounded-full border bg-white/80 px-2.5 py-1 text-[11px] text-ink"
                  style={{ borderColor: "var(--color-lilac)", fontWeight: 600 }}
                >
                  <CheckIcon small />
                  {item}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2.5 text-[11px] text-ink-soft">
            {granted ? "Sin tarjeta de crédito: al terminar no se cobra nada." : "Sin tarjeta de crédito · Se activa al crear tu cuenta"}
          </p>
        </div>
      </div>
    </div>
  );
}

function GiftIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5" />
    </svg>
  );
}

function CheckIcon({ small = false }: { small?: boolean }) {
  return (
    <svg
      width={small ? 10 : 12}
      height={small ? 10 : 12}
      viewBox="0 0 24 24"
      fill="none"
      stroke={small ? "var(--color-violet-ink)" : "currentColor"}
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
