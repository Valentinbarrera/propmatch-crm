import { BrandLogo } from "@/components/brand/BrandLogo";

/**
 * Panel de marca del login (solo desktop). La mini-vista del producto es
 * decorativa y abstracta a propósito: sin cifras ni nombres que parezcan datos
 * reales de clientes.
 */
export function LogoMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 12L12 3L21 12V21H15V15H9V21H3V12Z" fill="white" fillOpacity="0.9" />
      <circle cx="16" cy="8" r="3" fill="white" fillOpacity="0.7" />
    </svg>
  );
}

const BENEFITS = [
  "Cada propiedad, con los clientes que mejor le encajan",
  "Seguimiento de cada operación en un solo lugar",
  "Todo tu equipo trabajando sobre la misma cartera",
];

function MatchRing() {
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" aria-hidden="true">
      <circle cx="19" cy="19" r="15" fill="none" stroke="#E9E5DE" strokeWidth="4" />
      <circle
        cx="19"
        cy="19"
        r="15"
        fill="none"
        stroke="url(#pm-ring)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="94.2"
        strokeDashoffset="22"
        transform="rotate(-90 19 19)"
      />
      <path d="M13.5 19.5l4 4 7-8" fill="none" stroke="#9B21FF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <defs>
        <linearGradient id="pm-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9B21FF" />
          <stop offset="1" stopColor="#FF5ECA" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function PropertyCard({ tone, className = "", style }: { tone: string; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`rounded-2xl bg-white p-3 w-60 ${className}`}
      style={{ boxShadow: "0 18px 40px -12px rgba(8, 11, 31,0.35)", ...style }}
    >
      <div className="h-24 rounded-xl relative overflow-hidden" style={{ background: tone }}>
        <svg viewBox="0 0 200 96" className="absolute inset-0 w-full h-full" aria-hidden="true">
          <path d="M0 96V70l40-22 36 18 44-30 50 28 30-14v46z" fill="white" fillOpacity="0.28" />
          <path d="M0 96V82l54-20 48 16 46-22 52 24v16z" fill="white" fillOpacity="0.2" />
        </svg>
      </div>
      <div className="flex items-center gap-3 mt-3">
        <div className="flex-1 space-y-1.5">
          <div className="h-2.5 rounded-full w-4/5" style={{ background: "#E9E5DE" }} />
          <div className="h-2 rounded-full w-1/2" style={{ background: "#F0EDE6" }} />
        </div>
        <MatchRing />
      </div>
    </div>
  );
}

export default function BrandPanel() {
  return (
    <div
      className="hidden lg:flex w-[48%] max-w-[760px] flex-col justify-between p-12 xl:p-14 relative overflow-hidden"
      style={{ background: "var(--gradient-brand-wide)" }}
    >
      {/* Keyframes locales: el flotado es solo de esta pantalla. */}
      <style>{`
        @keyframes pm-float-a { 0%,100% { transform: translateY(0) rotate(-4deg); } 50% { transform: translateY(-8px) rotate(-4deg); } }
        @keyframes pm-float-b { 0%,100% { transform: translateY(0) rotate(3deg); } 50% { transform: translateY(8px) rotate(3deg); } }
        .pm-float-a { transform: rotate(-4deg); animation: pm-float-a 7s ease-in-out infinite; }
        .pm-float-b { transform: rotate(3deg); animation: pm-float-b 8s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .pm-float-a, .pm-float-b { animation: none; } }
      `}</style>
      <div
        className="absolute -right-24 -top-24 w-96 h-96 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,255,255,0.28), transparent 68%)" }}
      />
      <div
        className="absolute -left-20 bottom-0 w-80 h-80 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,255,255,0.14), transparent 70%)" }}
      />

      <div className="relative z-10 flex items-center gap-3">
        <BrandLogo size={32} light />
      </div>

      <div className="relative z-10">
        <h1 className="text-white text-[2.5rem] leading-[1.1] tracking-tight" style={{ fontWeight: 800 }}>
          El CRM que entiende
          <br />a cada cliente.
        </h1>
        <p className="text-white text-base mt-4 max-w-md" style={{ opacity: 0.82 }}>
          Organizá tu cartera y encontrá qué propiedad encaja con quién, sin perder oportunidades
          por el camino.
        </p>

        {/* Mini-vista decorativa */}
        <div className="relative h-64 mt-10 select-none" aria-hidden="true">
          <PropertyCard
            tone="linear-gradient(135deg,#D4AAFF,#FFC7EC)"
            className="absolute left-0 top-6 pm-float-a"
          />
          <PropertyCard
            tone="linear-gradient(135deg,#BF7FFF,#9B21FF)"
            className="absolute left-36 top-0 pm-float-b"
          />
          <div
            className="absolute left-12 bottom-0 flex items-center gap-2 rounded-full pl-2 pr-4 py-2 text-xs text-white"
            style={{
              background: "rgba(255,255,255,0.18)",
              border: "1px solid rgba(255,255,255,0.35)",
              backdropFilter: "blur(8px)",
              fontWeight: 600,
            }}
          >
            <span className="w-5 h-5 rounded-full bg-white flex items-center justify-center">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#9B21FF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            Nuevo match encontrado
          </div>
        </div>
      </div>

      <div className="relative z-10">
        <ul className="space-y-3">
          {BENEFITS.map((b) => (
            <li key={b} className="flex items-start gap-3 text-white text-sm" style={{ fontWeight: 500 }}>
              <span
                className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.22)" }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7.5" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span style={{ opacity: 0.92 }}>{b}</span>
            </li>
          ))}
        </ul>
        <p className="text-white text-xs mt-8" style={{ opacity: 0.6 }}>
          © {new Date().getFullYear()} PropMatch
        </p>
      </div>
    </div>
  );
}
