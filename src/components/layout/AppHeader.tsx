import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "@/data/store";
import { PlusIcon, SearchIcon } from "@/components/ui/icons";
import { NotificationsMenu } from "./NotificationsMenu";

/**
 * Header único de la aplicación.
 *
 * En el prototipo cada pantalla traía su propio header casi idéntico
 * (ContactosHeader, PropiedadesHeader, OportunidadesHeader, MatchesHeader,
 * AgendaHeader, ReportesHeader): ~500 líneas repetidas donde solo cambiaba el
 * título, el subtítulo y el botón de la derecha. Todo eso es este componente.
 *
 * Además el "buscador" de aquel header era un <div> decorativo. Acá es un
 * <input> de verdad, con debounce, que reporta hacia arriba.
 */

export interface AppHeaderProps {
  title: string;
  subtitle?: string;
  /** Migas: "PropMatch / Reportes". Solo Reportes las usaba. */
  breadcrumb?: string[];
  /** Adorno del título (el ✦ del dashboard). */
  titleAccent?: React.ReactNode;
  search?: {
    placeholder: string;
    value: string;
    onChange: (value: string) => void;
  };
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Controles extra a la izquierda del bloque de acciones. */
  children?: React.ReactNode;
  /** Oculta campana y avatar (pantallas de detalle con su propia barra). */
  compact?: boolean;
}

export function AppHeader({
  title,
  subtitle,
  breadcrumb,
  titleAccent,
  search,
  action,
  children,
  compact = false,
}: AppHeaderProps) {

  return (
    // En celular: título + campana/avatar/acción en la primera fila, y buscador
    // y botones extra en una segunda fila a lo ancho. En pantallas muy anchas (2xl), una fila;
    // antes, si hay muchos botones, bajan a una segunda fila en vez de aplastar el título.
    <header
      className="flex flex-wrap 2xl:flex-nowrap items-center justify-between gap-x-4 gap-y-3 px-4 md:px-8 py-3 md:py-5 border-b flex-shrink-0"
      style={{ borderColor: "#E9E5DE", backgroundColor: "#FAF8F5" }}
    >
      <div className="min-w-0 md:min-w-[14rem] flex-1 2xl:flex-initial order-1">
        {breadcrumb && breadcrumb.length > 0 && (
          <p className="hidden md:block text-xs mb-1" style={{ color: "#6B7280", fontWeight: 500 }}>
            {breadcrumb.map((crumb, i) => (
              <span key={crumb}>
                {i > 0 && <span style={{ color: "#DDD8CF" }}> / </span>}
                <span
                  style={
                    i === breadcrumb.length - 1
                      ? { color: "#9B21FF", fontWeight: 600 }
                      : undefined
                  }
                >
                  {crumb}
                </span>
              </span>
            ))}
          </p>
        )}
        <h1 className="text-xl md:text-2xl tracking-tight truncate" style={{ color: "#1A1A1A", fontWeight: 800 }}>
          {title}
          {titleAccent}
        </h1>
        {subtitle && (
          <p className="text-xs md:text-sm mt-0.5 truncate md:whitespace-normal" style={{ color: "#6B7280" }}>
            {subtitle}
          </p>
        )}
      </div>

      {(children || search) && (
        <div className="order-3 2xl:order-2 w-full 2xl:w-auto flex flex-wrap items-center gap-2 md:gap-3 [&>*]:flex-shrink-0">
          {children}
          {search && <HeaderSearch {...search} />}
        </div>
      )}

      <div className="order-2 2xl:order-3 flex items-center gap-2 md:gap-3 flex-shrink-0">
        {!compact && (
          <>
            <NotificationsMenu />

            <AccountMenu />
          </>
        )}

        {action && (
          <button
            onClick={action.onClick}
            aria-label={action.label}
            className="flex items-center gap-2 h-10 px-3 md:px-5 rounded-xl text-sm text-white transition-all hover:opacity-90 active:scale-95 whitespace-nowrap"
            style={{
              background: "var(--gradient-brand)",
              fontWeight: 600,
              boxShadow: "var(--shadow-cta)",
            }}
          >
            <PlusIcon />
            <span className="hidden md:inline">{action.label}</span>
          </button>
        )}
      </div>
    </header>
  );
}

/** Avatar del header: acceso a Configuración y a cerrar sesión. */
function AccountMenu() {
  const { profile, agency, signOut } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const itemClass = "w-full text-left px-4 py-2.5 text-sm transition-all hover:bg-violet-50";

  return (
    <div ref={rootRef} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-10 h-10 rounded-full flex items-center justify-center text-sm transition-all hover:opacity-90"
        style={{ background: "var(--gradient-brand)", color: "white", fontWeight: 700 }}
        aria-label={`Cuenta de ${profile.full_name}`}
        aria-expanded={open}
      >
        {profile.initials}
      </button>

      {open && (
        <div
          className="pm-modal absolute right-0 mt-2 w-60 rounded-2xl border overflow-hidden z-50"
          style={{ background: "white", borderColor: "#E9E5DE", boxShadow: "0 12px 40px rgba(86, 20, 143, 0.15)" }}
        >
          <div className="px-4 py-3 border-b" style={{ borderColor: "#F7F0FF" }}>
            <p className="text-sm truncate" style={{ color: "#1A1A1A", fontWeight: 700 }}>
              {profile.full_name}
            </p>
            <p className="text-xs truncate" style={{ color: "#6B7280" }}>
              {profile.email ?? agency.name}
            </p>
          </div>
          <button
            className={itemClass}
            style={{ color: "#1A1A1A", fontWeight: 500 }}
            onClick={() => {
              setOpen(false);
              navigate("/configuracion");
            }}
          >
            Configuración
          </button>
          <button
            className={itemClass + " border-t"}
            style={{ color: "#E11D48", fontWeight: 600, borderColor: "#F7F0FF" }}
            onClick={signOut}
          >
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

/** Input real, con debounce de 250 ms para no consultar en cada tecla. */
function HeaderSearch({
  placeholder,
  value,
  onChange,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);

  // Si el padre limpia la búsqueda (por ejemplo al cambiar de filtro), seguirlo.
  useEffect(() => setLocal(value), [value]);

  useEffect(() => {
    if (local === value) return;
    const id = setTimeout(() => onChange(local), 250);
    return () => clearTimeout(id);
  }, [local, value, onChange]);

  return (
    <div
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm focus-within:ring-2 focus-within:ring-[#9B21FF] transition-all flex-1 md:flex-none w-full md:w-[220px] !flex-shrink"
      style={{ background: "#F7F0FF" }}
    >
      <SearchIcon />
      <input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        className="bg-transparent outline-none w-full text-[#1A1A1A] placeholder:text-[#6B7280]"
        style={{ fontSize: 14 }}
      />
      {local && (
        <button
          onClick={() => {
            setLocal("");
            onChange("");
          }}
          aria-label="Limpiar búsqueda"
          className="flex-shrink-0"
          style={{ color: "#6B7280", lineHeight: 1 }}
        >
          ×
        </button>
      )}
    </div>
  );
}
