/**
 * Iconografía de PropMatch.
 *
 * Todos los SVG vienen tal cual del prototipo de Figma Make (mismos paths,
 * mismos viewBox, mismo strokeWidth). Antes estaban duplicados dentro de cada
 * pantalla; acá viven una sola vez.
 */

export interface IconProps {
  size?: number;
  color?: string;
  className?: string;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none" as const,
});

/* ── Navegación ──────────────────────────────────────────────────────────── */

export function HomeIcon({ size = 20, color = "currentColor", className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M3 12L12 3L21 12V21H15V15H9V21H3V12Z" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function ContactsIcon({ size = 20, color = "currentColor", className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="9" cy="7" r="4" stroke={color} strokeWidth="2" />
      <path d="M2 21C2 17.134 5.134 14 9 14H11" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M16 19H22M19 16V22" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function PropertiesIcon({ size = 20, color = "currentColor", className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="2" y="7" width="20" height="15" rx="2" stroke={color} strokeWidth="2" />
      <path d="M16 7V5C16 3.895 15.105 3 14 3H10C8.895 3 8 3.895 8 5V7" stroke={color} strokeWidth="2" />
      <path d="M12 12V17M9.5 14.5H14.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function OpportunitiesIcon({ size = 20, color = "currentColor", className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M22 12H18L15 21L9 3L6 12H2" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MatchesIcon({ size = 20, color = "currentColor", className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path
        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Variante rellena del corazón/match — usada en banners y botones. */
export function MatchesSolidIcon({ size = 20, color = "white", className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path
        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
        fill={color}
        fillOpacity="0.9"
      />
    </svg>
  );
}

export function AgendaIcon({ size = 20, color = "currentColor", className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="4" width="18" height="18" rx="2" stroke={color} strokeWidth="2" />
      <path d="M16 2V6M8 2V6M3 10H21" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="16" r="2" stroke={color} strokeWidth="2" />
    </svg>
  );
}

export function ReportesIcon({ size = 20, color = "currentColor", className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M18 20V10M12 20V4M6 20V14" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function SettingsIcon({ size = 20, color = "currentColor", className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="3" stroke={color} strokeWidth="2" />
      <path
        d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ── Acciones y utilidades ───────────────────────────────────────────────── */

export function SearchIcon({ size = 16, color = "#BF7FFF", className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="11" cy="11" r="8" stroke={color} strokeWidth="2" />
      <path d="M21 21L16.65 16.65" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function BellIcon({ size = 18, color = "#9B21FF", className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function PlusIcon({ size = 14, color = "white", className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 5V19M5 12H19" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 12, color = "#D4AAFF", className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M6 9L12 15L18 9" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 14, color = "#D1D5DB", className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M9 18L15 12L9 6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronLeftIcon({ size = 14, color = "currentColor", className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M15 18L9 12L15 6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CheckIcon({ size = 12, color = "currentColor", className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M20 6L9 17L4 12" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MapPinIcon({ size = 12, color = "#BF7FFF", className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 21C12 21 5 13.5 5 9a7 7 0 0 1 14 0c0 4.5-7 12-7 12z" stroke={color} strokeWidth="2" />
      <circle cx="12" cy="9" r="2.5" stroke={color} strokeWidth="2" />
    </svg>
  );
}

export function ClockIcon({ size = 11, color = "#D4AAFF", className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2" />
      <path d="M12 6v6l4 2" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function CalendarIcon({ size = 16, color = "currentColor", className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="4" width="18" height="18" rx="2" stroke={color} strokeWidth="2" />
      <path d="M16 2V6M8 2V6M3 10H21" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function PhoneIcon({ size = 13, color = "currentColor", className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path
        d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.72 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.63 1.29h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6.16 6.16l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.01z"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MailIcon({ size = 13, color = "currentColor", className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="2" y="4" width="20" height="16" rx="2" stroke={color} strokeWidth="2" />
      <path d="M22 7L12 13L2 7" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function EditIcon({ size = 13, color = "#9B21FF", className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function StarIcon({ size = 12, color = "white", className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill={color} />
    </svg>
  );
}

export function StarOutlineIcon({ size = 22, color = "#A855FF", className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function SparkIcon({ size = 16, color = "currentColor", className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 2L8 8H3L7 13L5 19L12 16L19 19L17 13L21 8H16L12 2Z" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function UserIcon({ size = 16, color = "currentColor", className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="8" r="4" stroke={color} strokeWidth="2" />
      <path d="M4 20C4 16.686 7.582 14 12 14C16.418 14 20 16.686 20 20" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function UsersIcon({ size = 22, color = "#9B21FF", className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="9" cy="7" r="4" stroke={color} strokeWidth="2" />
      <circle cx="17" cy="9" r="3" stroke={color} strokeWidth="2" />
      <path d="M2 21C2 17.134 5.134 14 9 14H13C17 14 20 17 20 21" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function EyeIcon({ size = 16, color = "currentColor", className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke={color} strokeWidth="2" />
      <circle cx="12" cy="12" r="3" stroke={color} strokeWidth="2" />
    </svg>
  );
}

export function ArrowRightIcon({ size = 16, color = "currentColor", className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M5 12h14M12 5l7 7-7 7" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TrendUpIcon({ size = 10, color = "currentColor", className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 19V5M5 12L12 5L19 12" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AlertTriangleIcon({ size = 11, color = "#F97316", className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" fill={color} fillOpacity="0.8" />
    </svg>
  );
}

export function AlertCircleIcon({ size = 11, color = "#F97316", className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2" />
      <path d="M12 8v4M12 16h.01" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function CheckCircleIcon({ size = 22, color = "#10B981", className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 4L12 14.01l-3-3" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DownloadIcon({ size = 14, color = "currentColor", className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LogoutIcon({ size = 16, color = "currentColor", className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 17l5-5-5-5M21 12H9" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Tipos de propiedad ──────────────────────────────────────────────────── */

export function PropertyTypeIcon({ type, size = 14 }: { type: string; size?: number }) {
  const t = type.toLowerCase();
  if (t === "casa" || t === "house")
    return (
      <svg {...base(size)}>
        <path d="M3 12L12 3L21 12V21H15V15H9V21H3V12Z" stroke="#9B21FF" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    );
  if (t === "departamento" || t === "apartment")
    return (
      <svg {...base(size)}>
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="#FF5ECA" strokeWidth="2" />
        <path d="M9 9H9.01M15 9H15.01M9 15H9.01M15 15H15.01" stroke="#FF5ECA" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  if (t === "terreno" || t === "lote" || t === "land")
    return (
      <svg {...base(size)}>
        <path d="M3 20L21 20M5 20V10L12 4L19 10V20" stroke="#A855FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  return (
    <svg {...base(size)}>
      <rect x="3" y="6" width="18" height="15" rx="2" stroke="#A855FF" strokeWidth="2" />
      <path d="M3 11H21M8 6V3M16 6V3" stroke="#A855FF" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* ── Iconos de actividad (feed y timeline) ───────────────────────────────── */

export function ActivityIcon({ type, size = 16 }: { type: string; size?: number }) {
  switch (type) {
    case "contact":
      return <UserIcon size={size} />;
    case "property":
      return <HomeIcon size={size} />;
    case "calendar":
      return <CalendarIcon size={size} />;
    case "eye":
      return <EyeIcon size={size} />;
    case "arrow":
      return <ArrowRightIcon size={size} />;
    default:
      return <SparkIcon size={size} />;
  }
}

/* ── Iconos por tipo de evento de agenda ─────────────────────────────────── */

export function EventTypeIcon({ type, color, size = 14 }: { type: string; color: string; size?: number }) {
  if (type === "visita") return <HomeIcon size={size} color={color} />;
  if (type === "llamada") return <PhoneIcon size={size} color={color} />;
  if (type === "reunion")
    return (
      <svg {...base(size)}>
        <circle cx="9" cy="7" r="4" stroke={color} strokeWidth="2" />
        <circle cx="17" cy="9" r="3" stroke={color} strokeWidth="2" />
        <path d="M2 21C2 17.134 5.134 14 9 14H11" stroke={color} strokeWidth="2" strokeLinecap="round" />
        <path d="M17 14C19.761 14 22 16.239 22 19V21" stroke={color} strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  if (type === "publicacion") return <InstagramIcon size={size} color={color} />;
  return <ClockIcon size={size} color={color} />;
}

/** Cámara genérica (cuadrado redondeado + lente). No es el logo de Instagram. */
export function InstagramIcon({ size = 20, color = "currentColor", className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" stroke={color} strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4" stroke={color} strokeWidth="1.8" />
      <circle cx="17.2" cy="6.8" r="1.1" fill={color} />
    </svg>
  );
}

/** Logo de WhatsApp (glifo simplificado, un solo color). */
export function WhatsAppIcon({ size = 16, color = "currentColor", className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill={color}
        d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.23 8.23 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.54.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.13-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.16-.48-.29Z"
      />
    </svg>
  );
}

/** Expediente: hoja con renglones y tilde. */
export function OperacionesIcon({ size = 20, color = "currentColor", className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M7 3h7l5 5v12a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M14 3v5h5" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9 14l2 2 4-4" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function InboxIcon({ size = 20, color = "currentColor", className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path
        d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
