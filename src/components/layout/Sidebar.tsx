import { NavLink } from "react-router-dom";
import { useStore } from "@/data/store";
import { countUnanswered, useInboxFeed } from "@/features/inbox/inboxFeed";
import {
  AgendaIcon,
  ContactsIcon,
  HomeIcon,
  InboxIcon,
  MailIcon,
  MatchesIcon,
  OpportunitiesIcon,
  OperacionesIcon,
  PropertiesIcon,
  InstagramIcon,
  ReportesIcon,
  SettingsIcon,
  LogoutIcon,
  type IconProps,
} from "@/components/ui/icons";
import { MercadoIcon } from "@/features/mercado/MercadoIcon";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { usePromoGrant } from "@/features/promo/usePromoGrant";
import { formatPromoDate } from "../../../shared/promo";

interface NavItem {
  to: string;
  label: string;
  icon: (p: IconProps) => React.ReactElement;
  badge?: "matches" | "offers" | "inbox";
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Inicio", icon: HomeIcon },
  { to: "/inbox", label: "Inbox", icon: InboxIcon, badge: "inbox" },
  { to: "/contactos", label: "Contactos", icon: ContactsIcon },
  { to: "/propiedades", label: "Propiedades", icon: PropertiesIcon },
  { to: "/mercado", label: "Mercado", icon: MercadoIcon },
  { to: "/oportunidades", label: "Oportunidades", icon: OpportunitiesIcon },
  { to: "/publicador", label: "Publicaciones", icon: PropertiesIcon },
  { to: "/instagram", label: "Instagram", icon: InstagramIcon },
  { to: "/marketing", label: "Marketing", icon: MailIcon },
  { to: "/ofertas", label: "Ofertas", icon: OperacionesIcon, badge: "offers" },
  { to: "/operaciones", label: "Operaciones", icon: OperacionesIcon },
  { to: "/matches", label: "Matches", icon: MatchesIcon, badge: "matches" },
  { to: "/agenda", label: "Agenda", icon: AgendaIcon },
  { to: "/reportes", label: "Reportes", icon: ReportesIcon },
];

export function Sidebar() {
  const { profile, agency, matches, appOffers, signOut } = useStore();
  const pendingMatches = matches.filter((m) => !m.is_reviewed && !m.is_dismissed).length;
  const pendingOffers = appOffers.filter((o) => o.status === "pending").length;
  const unanswered = countUnanswered(useInboxFeed(agency.id));
  const promo = usePromoGrant();

  return (
    <aside
      className="hidden lg:flex w-64 flex-shrink-0 flex-col border-r overflow-y-auto"
      style={{ borderColor: "#E9E5DE", backgroundColor: "#FAF8F5" }}
    >
      {/* Logo */}
      <div className="px-6 py-6">
        <BrandLogo size={28} />
        {agency.name && (
          <p className="text-xs truncate mt-1.5" style={{ color: "#6B7280" }}>
            {agency.name}
          </p>
        )}
        {promo && (
          <span
            className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] text-white"
            style={{ background: "var(--gradient-brand)", fontWeight: 700 }}
            title={`Promo de lanzamiento: ${promo.months} meses gratis, hasta el ${formatPromoDate(promo.until)}`}
          >
            {promo.plan} · hasta {formatPromoDate(promo.until)}
          </span>
        )}
      </div>

      {/* Etiqueta de sección */}
      <div className="px-6 mb-2">
        <span
          className="uppercase"
          style={{ color: "#6B7280", fontSize: "10px", letterSpacing: "0.12em", fontWeight: 600 }}
        >
          Menú principal
        </span>
      </div>

      {/* Navegación */}
      <nav className="flex-1 px-3 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const badgeCount =
            item.badge === "matches"
              ? pendingMatches
              : item.badge === "offers"
                ? pendingOffers
                : item.badge === "inbox"
                  ? unanswered
                  : 0;

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 text-left"
              style={({ isActive }) =>
                isActive
                  ? {
                    background: "var(--gradient-nav-active)",
                    color: "#9B21FF",
                    fontWeight: 600,
                  }
                  : { color: "#6B7280", fontWeight: 500 }
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className="w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 transition-all"
                    style={
                      isActive ? { background: "var(--gradient-brand)" } : { background: "#F3F4F6" }
                    }
                  >
                    <Icon size={16} color={isActive ? "#fff" : "#9CA3AF"} />
                  </span>
                  <span>{item.label}</span>
                  {badgeCount > 0 && (
                    <span
                      className="ml-auto px-2 py-0.5 rounded-full"
                      style={{
                        background: "var(--gradient-brand)",
                        color: "white",
                        fontSize: "10px",
                        fontWeight: 700,
                      }}
                    >
                      {badgeCount}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Pie */}
      <div className="px-3 pb-4 space-y-0.5 border-t pt-4" style={{ borderColor: "#E9E5DE" }}>
        <NavLink
          to="/configuracion"
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left transition-all duration-150"
          style={({ isActive }) =>
            isActive
              ? { background: "var(--gradient-nav-active)", color: "#9B21FF", fontWeight: 600 }
              : { color: "#6B7280", fontWeight: 500 }
          }
        >
          {({ isActive }) => (
            <>
              <span
                className="w-8 h-8 flex items-center justify-center rounded-lg transition-all"
                style={isActive ? { background: "var(--gradient-brand)" } : { background: "#F3F4F6" }}
              >
                <SettingsIcon size={16} color={isActive ? "#fff" : "#9CA3AF"} />
              </span>
              <span>Configuración</span>
            </>
          )}
        </NavLink>

        {/* Usuario */}
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all hover:bg-violet-50">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs flex-shrink-0"
            style={{ background: "var(--gradient-brand)", color: "white", fontWeight: 700 }}
          >
            {profile.initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm truncate" style={{ color: "#1F2937", fontWeight: 600 }}>
              {profile.full_name}
            </p>
            <p className="text-xs truncate" style={{ color: "#9CA3AF" }}>
              {profile.role === "owner"
                ? "Dueño"
                : profile.role === "admin"
                  ? "Administrador"
                  : "Agente inmobiliario"}
            </p>
          </div>
          <button
            onClick={signOut}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-violet-100 flex-shrink-0"
          >
            <LogoutIcon size={14} color="#D4AAFF" />
          </button>
        </div>
      </div>
    </aside>
  );
}
