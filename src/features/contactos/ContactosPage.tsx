import { useMemo, useState } from "react";
import { SampleBadge } from "@/components/ui/SampleBadge";
import { ContactNoContactBadge } from "@/features/marketing/ContactNoContactBadge";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { StatCard } from "@/components/ui/StatCard";
import { FilterDropdown, FilterTabs } from "@/components/ui/FilterTabs";
import { Badge, Card } from "@/components/ui/Card";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { EmptyState } from "@/components/ui/states";
import { ContactFormModal } from "./ContactFormModal";
import { useVozPrefill } from "@/features/voz/prefill";
import type { VozData } from "../../../shared/voz";
import {
  ContactsIcon,
  EditIcon,
  MatchesIcon,
  MatchesSolidIcon,
  PropertyTypeIcon,
  SparkIcon,
  UsersIcon,
} from "@/components/ui/icons";
import { useStore } from "@/data/store";
import { ZONES } from "@/data/seed";
import {
  CONTACT_STATUS_LABEL,
  CONTACT_STATUS_STYLE,
  PROPERTY_TYPE_LABEL,
  moneyCompact,
  avatarGradient,
  initials,
  money,
  relativeTime,
} from "@/lib/format";
import type { Contact, ContactRequirement, ContactStatus, PropertyType } from "@/types/db";

type Tab = "todos" | "activos" | "nuevos" | "con_matches";

const TABS = [
  { value: "todos" as const, label: "Todos" },
  { value: "activos" as const, label: "Activos" },
  { value: "nuevos" as const, label: "Nuevos" },
  { value: "con_matches" as const, label: "Con matches" },
];

const TYPE_OPTIONS = (Object.keys(PROPERTY_TYPE_LABEL) as PropertyType[]).map((t) => ({
  value: t,
  label: PROPERTY_TYPE_LABEL[t],
}));
const ZONE_OPTIONS = ZONES.map((z) => ({ value: z, label: z }));
const BUDGET_OPTIONS = [
  { value: "0-100000", label: "Hasta USD 100.000" },
  { value: "100000-200000", label: "USD 100.000 – 200.000" },
  { value: "200000-", label: "Más de USD 200.000" },
];

interface Row {
  contact: Contact;
  requirement: ContactRequirement | undefined;
  matchCount: number;
  bestScore: number;
}

export default function ContactosPage() {
  const navigate = useNavigate();
  const { contacts, requirements, matches } = useStore();

  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("todos");
  const [type, setType] = useState<PropertyType | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  const [budget, setBudget] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  /** Búsqueda dictada desde Proppi: abre el alta precargada (sin guardar). */
  const [vozPrefill, setVozPrefill] = useState<VozData | null>(null);
  useVozPrefill("busqueda", (r) => {
    setVozPrefill(r);
    setCreating(true);
  });
  const [editing, setEditing] = useState<Contact | null>(null);

  const rows = useMemo<Row[]>(() => {
    const reqByContact = new Map<string, ContactRequirement>();
    for (const r of requirements) if (r.is_active) reqByContact.set(r.contact_id, r);

    const stats = new Map<string, { count: number; best: number }>();
    for (const m of matches) {
      const cur = stats.get(m.contact_id) ?? { count: 0, best: 0 };
      stats.set(m.contact_id, { count: cur.count + 1, best: Math.max(cur.best, m.score) });
    }

    return contacts.map((contact) => ({
      contact,
      requirement: reqByContact.get(contact.id),
      matchCount: stats.get(contact.id)?.count ?? 0,
      bestScore: stats.get(contact.id)?.best ?? 0,
    }));
  }, [contacts, requirements, matches]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const [minStr, maxStr] = budget?.split("-") ?? [];
    const budgetMin = minStr ? Number(minStr) : null;
    const budgetMax = maxStr ? Number(maxStr) : null;

    return rows.filter(({ contact, requirement, matchCount }) => {
      if (tab === "activos" && contact.status !== "activo") return false;
      if (tab === "nuevos" && contact.status !== "nuevo") return false;
      if (tab === "con_matches" && matchCount === 0) return false;
      if (type && !requirement?.property_types.includes(type)) return false;
      if (zone && !requirement?.zones.includes(zone)) return false;
      if (budgetMin !== null && (requirement?.budget_max ?? 0) < budgetMin) return false;
      if (budgetMax !== null && (requirement?.budget_min ?? 0) > budgetMax) return false;
      if (q && !`${contact.full_name} ${contact.email ?? ""} ${contact.phone ?? ""}`.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [rows, tab, type, zone, budget, query]);

  const stats = useMemo(() => {
    const monthAgo = Date.now() - 30 * 86_400_000;
    const newThisMonth = contacts.filter((c) => new Date(c.created_at).getTime() > monthAgo);
    const withMatches = rows.filter((r) => r.matchCount > 0);
    return { newThisMonth, withMatches };
  }, [contacts, rows]);

  const topMatches = useMemo(
    () => [...rows].filter((r) => r.matchCount > 0).sort((a, b) => b.bestScore - a.bestScore).slice(0, 3),
    [rows],
  );

  const maxMatches = Math.max(1, ...rows.map((r) => r.matchCount));
  const total = Math.max(1, contacts.length);

  return (
    <>
      <AppHeader
        title="Contactos"
        subtitle="Gestioná y conocé mejor a cada persona."
        search={{ placeholder: "Buscar contacto...", value: query, onChange: setQuery }}
        action={{ label: "Nuevo contacto", onClick: () => setCreating(true) }}
      >
        <button
          onClick={() => navigate("/importar?tipo=contactos")}
          className="px-4 py-2.5 rounded-xl text-sm border transition-all hover:bg-violet-50 whitespace-nowrap"
          style={{ borderColor: "#E9E5DE", color: "#9B21FF", fontWeight: 600, background: "white" }}
        >
          Importar Excel
        </button>
      </AppHeader>

      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-8">
        {/* En celular la lista va primero: los totales ya están en Inicio. */}
        <div className="hidden md:grid mt-8 grid-cols-3 gap-4">
          <StatCard
            value={String(contacts.length)}
            label="Total contactos"
            sub={`${stats.newThisMonth.length} este mes`}
            icon={<UsersIcon size={22} />}
            iconBg="#F7F0FF"
            badge={`+${stats.newThisMonth.length}`}
            bar="var(--gradient-brand-h)"
            barWidth={82}
          />
          <StatCard
            value={String(stats.newThisMonth.length)}
            label="Nuevos este mes"
            sub="Últimos 30 días"
            icon={<UsersIcon size={22} color="#FF5ECA" />}
            iconBg="#FFF1FA"
            badge={`+${stats.newThisMonth.length}`}
            bar="linear-gradient(90deg, #FF5ECA, #FF7ED5)"
            barWidth={(stats.newThisMonth.length / total) * 100}
          />
          <StatCard
            value={String(stats.withMatches.length)}
            label="Contactos con match"
            sub={`${Math.round((stats.withMatches.length / total) * 100)}% del total`}
            icon={<MatchesIcon size={22} color="#A855FF" />}
            iconBg="#F7F0FF"
            badge={`${matches.length} matches`}
            badgeBg="#F7F0FF"
            badgeText="#9B21FF"
            bar="linear-gradient(90deg, #A855FF, #FF5ECA)"
            barWidth={(stats.withMatches.length / total) * 100}
          />
        </div>

        <div className="mt-4 md:mt-7 flex gap-6 items-start flex-col xl:flex-row">
          <div className="flex-1 min-w-0 w-full">
            {/* Filtros */}
            <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
              <FilterTabs options={TABS} value={tab} onChange={setTab} />
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm whitespace-nowrap" style={{ color: "#6B7280" }}>
                  <span style={{ color: "#1A1A1A", fontWeight: 600 }}>{filtered.length}</span> contactos
                </span>
                <FilterDropdown label="Tipo" options={TYPE_OPTIONS} value={type} onChange={setType} />
                <FilterDropdown label="Zona" options={ZONE_OPTIONS} value={zone} onChange={setZone} />
                <FilterDropdown
                  label="Presupuesto"
                  options={BUDGET_OPTIONS}
                  value={budget}
                  onChange={setBudget}
                />
              </div>
            </div>

            {filtered.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<ContactsIcon size={24} color="#9B21FF" />}
                  title={contacts.length === 0 ? "Todavía no hay contactos" : "Sin resultados"}
                  description={
                    contacts.length === 0
                      ? "Cargá a tus clientes y qué buscan: el matching necesita ese dato para funcionar."
                      : "Probá con otros filtros o limpiá la búsqueda."
                  }
                  action={
                    contacts.length === 0
                      ? { label: "Crear el primer contacto", onClick: () => setCreating(true) }
                      : undefined
                  }
                />
              </Card>
            ) : (
              <>
              <div className="md:hidden space-y-2 pm-stagger">
                {filtered.map((row) => (
                  <ContactCardMobile key={row.contact.id} row={row} onOpen={() => navigate(`/contactos/${row.contact.id}`)} />
                ))}
              </div>
              <div
                className="hidden md:block rounded-2xl border overflow-hidden overflow-x-auto"
                style={{ borderColor: "#E9E5DE", boxShadow: "var(--shadow-card)" }}
              >
                <table className="w-full bg-white" style={{ minWidth: 900 }}>
                  <thead>
                    <tr style={{ background: "#FAF8F5", borderBottom: "1px solid #F0EDE6" }}>
                      {["Contacto", "Busca", "Presupuesto", "Estado", "Última actividad", "Matches", ""].map(
                        (h, i) => (
                          <th
                            key={h || `col-${i}`}
                            className="text-left px-5 py-3.5 text-xs uppercase tracking-wide whitespace-nowrap"
                            style={{ color: "#6B7280", letterSpacing: "0.06em", fontWeight: 600 }}
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row, idx) => (
                      <ContactRow
                        key={row.contact.id}
                        row={row}
                        maxMatches={maxMatches}
                        isLast={idx === filtered.length - 1}
                        onOpen={() => navigate(`/contactos/${row.contact.id}`)}
                        onEdit={() => setEditing(row.contact)}
                        onSeeMatches={() => navigate("/matches")}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>

          {/* Panel de mejores matches */}
          <div className="w-full xl:w-72 flex-shrink-0">
            <TopMatchesPanel
              rows={topMatches}
              withMatches={stats.withMatches.length}
              total={contacts.length}
              onSeeAll={() => navigate("/matches")}
              onOpenContact={(id) => navigate(`/contactos/${id}`)}
            />
          </div>
        </div>
      </div>

      {creating && (
        <ContactFormModal
          vozPrefill={vozPrefill}
          onClose={() => {
            setCreating(false);
            setVozPrefill(null);
          }}
          onSaved={(id) => navigate(`/contactos/${id}`)}
        />
      )}
      {editing && <ContactFormModal contact={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function ContactRow({
  row,
  maxMatches,
  isLast,
  onOpen,
  onEdit,
  onSeeMatches,
}: {
  row: Row;
  maxMatches: number;
  isLast: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onSeeMatches: () => void;
}) {
  const { contact, requirement, matchCount } = row;
  const statusStyle = CONTACT_STATUS_STYLE[contact.status];
  const statusLabel = CONTACT_STATUS_LABEL[contact.status as ContactStatus];

  return (
    <tr
      onClick={onOpen}
      className="cursor-pointer transition-all group hover:bg-[#FAF8F5]"
      style={{ borderBottom: isLast ? undefined : "1px solid #FAF8F5" }}
    >
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarGradient(contact.full_name)} flex items-center justify-center text-xs text-white flex-shrink-0`}
            style={{ fontWeight: 700 }}
          >
            {initials(contact.full_name)}
          </div>
          <div className="min-w-0">
            <p className="text-sm truncate" style={{ color: "#1A1A1A", fontWeight: 600 }}>
              {contact.full_name} <SampleBadge record={contact} /> <ContactNoContactBadge contact={contact} size="xs" />
            </p>
            <p className="text-xs truncate" style={{ color: "#6B7280" }}>
              {requirement?.zones[0] ?? contact.email ?? "—"}
            </p>
          </div>
        </div>
      </td>

      <td className="px-5 py-3.5">
        {requirement && requirement.property_types.length > 0 ? (
          <div className="flex items-center gap-2">
            <span
              className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: "#F7F0FF" }}
            >
              <PropertyTypeIcon type={requirement.property_types[0]} />
            </span>
            <span className="text-sm whitespace-nowrap" style={{ color: "#374151", fontWeight: 500 }}>
              {requirement.property_types.map((t) => PROPERTY_TYPE_LABEL[t]).join(" / ")}
            </span>
          </div>
        ) : (
          <span className="text-xs" style={{ color: "#DDD8CF" }}>
            Sin búsqueda cargada
          </span>
        )}
      </td>

      <td className="px-5 py-3.5 whitespace-nowrap">
        {requirement ? (
          <>
            <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 600 }}>
              {money(requirement.budget_min, requirement.currency)}
            </p>
            <p className="text-xs" style={{ color: "#6B7280" }}>
              hasta {money(requirement.budget_max, requirement.currency)}
            </p>
          </>
        ) : (
          <span className="text-xs" style={{ color: "#DDD8CF" }}>
            —
          </span>
        )}
      </td>

      <td className="px-5 py-3.5">
        <Badge bg={statusStyle.bg} text={statusStyle.text} border={statusStyle.border}>
          {statusLabel}
        </Badge>
      </td>

      <td className="px-5 py-3.5 whitespace-nowrap">
        <span className="text-sm" style={{ color: "#6B7280" }}>
          {relativeTime(contact.updated_at)}
        </span>
      </td>

      <td className="px-5 py-3.5">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-14 rounded-full overflow-hidden" style={{ background: "#E9E5DE" }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${(matchCount / maxMatches) * 100}%`,
                background: "var(--gradient-brand-h)",
              }}
            />
          </div>
          <span className="text-sm text-gradient-brand-h" style={{ fontWeight: 700 }}>
            {matchCount}
          </span>
        </div>
      </td>

      <td className="px-5 py-3.5">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            aria-label="Editar contacto"
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-violet-100"
            style={{ background: "#F7F0FF" }}
          >
            <EditIcon />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSeeMatches();
            }}
            aria-label="Ver matches"
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-pink-100"
            style={{ background: "#FFF1FA" }}
          >
            <MatchesIcon size={13} color="#FF5ECA" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function TopMatchesPanel({
  rows,
  withMatches,
  total,
  onSeeAll,
  onOpenContact,
}: {
  rows: Row[];
  withMatches: number;
  total: number;
  onSeeAll: () => void;
  onOpenContact: (id: string) => void;
}) {
  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ borderColor: "#E9E5DE", boxShadow: "var(--shadow-card)" }}
    >
      <div className="px-5 py-4 relative overflow-hidden" style={{ background: "var(--gradient-brand-wide)" }}>
        <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full opacity-20" style={{ background: "white" }} />
        <div className="absolute right-8 bottom-1 w-10 h-10 rounded-full opacity-10" style={{ background: "white" }} />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <MatchesSolidIcon size={16} />
            <p
              className="text-white text-xs uppercase"
              style={{ letterSpacing: "0.1em", fontWeight: 600 }}
            >
              Mejores matches
            </p>
          </div>
          <p className="text-white text-lg" style={{ fontWeight: 800 }}>
            Contactos top
          </p>
          <p className="text-white text-xs mt-0.5" style={{ opacity: 0.75 }}>
            Mayor compatibilidad hoy
          </p>
        </div>
      </div>

      <div className="bg-white p-4 space-y-3">
        {rows.length === 0 ? (
          <p className="text-xs text-center py-4" style={{ color: "#6B7280" }}>
            Todavía no hay matches para mostrar.
          </p>
        ) : (
          rows.map((row, idx) => (
            <div
              key={row.contact.id}
              onClick={() => onOpenContact(row.contact.id)}
              className="flex items-center gap-3 p-3 rounded-xl transition-all cursor-pointer hover:bg-violet-50"
              style={{ border: "1px solid #F0EDE6" }}
            >
              <ScoreRing score={row.bestScore} size={64} strokeWidth={5} labelSize={13} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className={`w-6 h-6 rounded-full bg-gradient-to-br ${avatarGradient(row.contact.full_name)} flex items-center justify-center text-white flex-shrink-0`}
                    style={{ fontSize: "8px", fontWeight: 700 }}
                  >
                    {initials(row.contact.full_name)}
                  </div>
                  <p className="text-sm truncate" style={{ color: "#1A1A1A", fontWeight: 600 }}>
                    {row.contact.full_name} <SampleBadge record={row.contact} />
                  </p>
                </div>
                <p className="text-xs" style={{ color: "#6B7280" }}>
                  <span style={{ color: "#9B21FF", fontWeight: 700 }}>{row.matchCount}</span>{" "}
                  {row.matchCount === 1 ? "propiedad compatible" : "propiedades compatibles"}
                </p>
              </div>

              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0"
                style={
                  idx === 0
                    ? { background: "var(--gradient-brand)", color: "white", fontWeight: 700 }
                    : { background: "#F7F0FF", color: "#6B7280", fontWeight: 600 }
                }
              >
                {idx + 1}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="px-5 pb-4 bg-white">
        <button
          onClick={onSeeAll}
          className="w-full py-2.5 rounded-xl text-sm border transition-all hover:border-violet-300 hover:bg-violet-50"
          style={{ borderColor: "#E9E5DE", color: "#9B21FF", fontWeight: 600 }}
        >
          Ver todos los matches
        </button>
      </div>

      <div
        className="mx-4 mb-4 rounded-xl p-3 flex items-start gap-3"
        style={{ background: "var(--gradient-soft)", border: "1px solid #E9E5DE" }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: "var(--gradient-brand)" }}
        >
          <SparkIcon size={14} color="white" />
        </div>
        <div>
          <p className="text-xs" style={{ color: "#1A1A1A", fontWeight: 600 }}>
            {withMatches} contactos con match activo
          </p>
          <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
            {Math.round((withMatches / Math.max(1, total)) * 100)}% del total de tu cartera
          </p>
        </div>
      </div>
    </div>
  );
}

/** Fila de contacto para celular: lo mínimo para decidir a quién abrir. */
function ContactCardMobile({ row, onOpen }: { row: Row; onOpen: () => void }) {
  const { contact, requirement, matchCount } = row;
  const statusStyle = CONTACT_STATUS_STYLE[contact.status];
  const busca = requirement
    ? [
        requirement.property_types.map((t) => PROPERTY_TYPE_LABEL[t]).join("/"),
        requirement.zones[0],
        requirement.budget_max ? moneyCompact(requirement.budget_max, requirement.currency) : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Sin búsqueda cargada";
  return (
    <button
      onClick={onOpen}
      className="w-full flex items-center gap-3 p-3 rounded-2xl border text-left active:scale-[0.99] transition-all"
      style={{ borderColor: "#E9E5DE", background: "white" }}
    >
      <div
        className={`w-11 h-11 rounded-full bg-gradient-to-br ${avatarGradient(contact.full_name)} flex items-center justify-center text-sm text-white flex-shrink-0`}
        style={{ fontWeight: 700 }}
      >
        {initials(contact.full_name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm truncate" style={{ color: "#1A1A1A", fontWeight: 700 }}>
            {contact.full_name} <SampleBadge record={contact} /> <ContactNoContactBadge contact={contact} size="xs" />
          </p>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-md flex-shrink-0"
            style={{ background: statusStyle.bg, color: statusStyle.text, fontWeight: 700 }}
          >
            {CONTACT_STATUS_LABEL[contact.status as ContactStatus]}
          </span>
        </div>
        <p className="text-xs truncate mt-0.5" style={{ color: "#6B7280" }}>
          {busca}
        </p>
      </div>
      {matchCount > 0 && (
        <span
          className="text-xs px-2 py-1 rounded-full flex-shrink-0"
          style={{ background: "var(--gradient-soft)", color: "#9B21FF", fontWeight: 700 }}
        >
          {matchCount} ♥
        </span>
      )}
    </button>
  );
}
