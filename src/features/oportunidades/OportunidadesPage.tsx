import { useMemo, useState } from "react";
import { SampleBadge } from "@/components/ui/SampleBadge";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Card, SectionHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/states";
import {
  ActivityIcon,
  AlertCircleIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  ContactsIcon,
  MapPinIcon,
  MatchesSolidIcon,
  OpportunitiesIcon,
  PlusIcon,
  StarOutlineIcon,
} from "@/components/ui/icons";
import { useStore, STAGE_LABEL } from "@/data/store";
import { OpportunityFormModal } from "./OpportunityFormModal";
import {
  PROPERTY_TYPE_LABEL,
  avatarGradient,
  daysInStage,
  initials,
  money,
  moneyCompact,
  relativeTime,
} from "@/lib/format";
import type { Opportunity, OpportunityStage } from "@/types/db";

/** Las cinco etapas del pipeline, con los colores del diseño. */
const STAGES: {
  id: OpportunityStage;
  accent: string;
  lightBg: string;
  tagBg: string;
  tagText: string;
}[] = [
  { id: "nuevos", accent: "#9B21FF", lightBg: "#F7F0FF", tagBg: "#E9E5DE", tagText: "#9B21FF" },
  { id: "contactados", accent: "#3B82F6", lightBg: "#EFF6FF", tagBg: "#DBEAFE", tagText: "#1D4ED8" },
  { id: "visita", accent: "#06B6D4", lightBg: "#ECFEFF", tagBg: "#CFFAFE", tagText: "#0E7490" },
  { id: "negociacion", accent: "#F59E0B", lightBg: "#FFFBEB", tagBg: "#FEF3C7", tagText: "#B45309" },
  { id: "cierre", accent: "#10B981", lightBg: "#F0FDF4", tagBg: "#D1FAE5", tagText: "#047857" },
];

const ORDER: OpportunityStage[] = ["nuevos", "contactados", "visita", "negociacion", "cierre"];

interface Card_ {
  opp: Opportunity;
  contactName: string;
  propertyTitle: string;
  propertyType: string;
  matchScore: number | null;
}

export default function OportunidadesPage() {
  const navigate = useNavigate();
  const {
    opportunities,
    contactById,
    propertyById,
    matches,
    moveOpportunity,
    setOpportunityPriority,
    markOpportunityLost,
    reopenOpportunity,
    activities,
  } = useStore();
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  /** Etapa en la que abre el alta manual, o `null` con el modal cerrado. */
  const [newIn, setNewIn] = useState<OpportunityStage | null>(null);

  const cards = useMemo<Card_[]>(() => {
    const scoreByPair = new Map(matches.map((m) => [`${m.contact_id}:${m.property_id}`, m.score]));
    return opportunities.map((opp) => {
      const contact = contactById(opp.contact_id);
      const property = propertyById(opp.property_id);
      return {
        opp,
        contactName: contact?.full_name ?? "Sin contacto",
        propertyTitle: property?.title ?? "Sin propiedad",
        propertyType: property ? PROPERTY_TYPE_LABEL[property.type] : "—",
        matchScore: scoreByPair.get(`${opp.contact_id}:${opp.property_id}`) ?? null,
      };
    });
  }, [opportunities, contactById, propertyById, matches]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter((c) => `${c.contactName} ${c.propertyTitle}`.toLowerCase().includes(q));
  }, [cards, query]);

  const totals = useMemo(() => {
    const open = opportunities.filter((o) => o.stage !== "perdida");
    const pipeline = open.reduce((sum, o) => sum + (o.value ?? 0), 0);
    const negotiating = open.filter((o) => o.stage === "negociacion");
    const closing = open.filter((o) => o.stage === "cierre");
    return {
      pipeline,
      count: open.length,
      negotiating,
      closing,
      negotiatingValue: negotiating.reduce((s, o) => s + (o.value ?? 0), 0),
      closingValue: closing.reduce((s, o) => s + (o.value ?? 0), 0),
    };
  }, [opportunities]);

  const priority = filtered.filter((c) => c.opp.is_priority);
  const lost = filtered.filter((c) => c.opp.stage === "perdida");
  const recentActivity = activities.slice(0, 5);

  function advance(id: string) {
    const opp = opportunities.find((o) => o.id === id);
    if (!opp) return;
    const idx = ORDER.indexOf(opp.stage);
    if (idx < 0 || idx >= ORDER.length - 1) return;
    moveOpportunity(id, ORDER[idx + 1]);
  }

  return (
    <>
      <AppHeader
        title="Oportunidades"
        subtitle="Seguí cada operación y acercate al cierre."
        search={{ placeholder: "Buscar oportunidad...", value: query, onChange: setQuery }}
        action={{ label: "Nueva oportunidad", onClick: () => setNewIn("nuevos") }}
      />

      <div className="flex-1 overflow-y-auto pb-8">
        <div className="px-4 md:px-8">
          <div className="hidden md:grid mt-8 grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              value={moneyCompact(totals.pipeline)}
              label="Valor total del pipeline"
              sub="Operaciones abiertas"
              icon={<StarOutlineIcon size={22} color="#9B21FF" />}
              iconBg="#F7F0FF"
              badge={`${totals.count} activas`}
              badgeBg="#F7F0FF"
              badgeText="#9B21FF"
              bar="var(--gradient-brand-h)"
              barWidth={88}
            />
            <StatCard
              value={String(totals.count)}
              label="Oportunidades activas"
              sub="En todas las etapas"
              icon={<OpportunitiesIcon size={22} color="#FF5ECA" />}
              iconBg="#FFF1FA"
              badge={`${STAGES.length} etapas`}
              badgeBg="#FFF1FA"
              badgeText="#FF5ECA"
              bar="linear-gradient(90deg, #FF5ECA, #FF7ED5)"
              barWidth={72}
            />
            <StatCard
              value={String(totals.negotiating.length)}
              label="En negociación"
              sub={`Valor: ${money(totals.negotiatingValue)}`}
              icon={<ContactsIcon size={22} color="#F59E0B" />}
              iconBg="#FFFBEB"
              badge="Activos"
              badgeBg="#FFFBEB"
              badgeText="#B45309"
              bar="linear-gradient(90deg, #F59E0B, #FCD34D)"
              barWidth={(totals.negotiating.length / Math.max(1, totals.count)) * 100}
            />
            <StatCard
              value={String(totals.closing.length)}
              label="En cierre"
              sub={`${money(totals.closingValue)} por cerrar`}
              icon={<CheckCircleIcon size={22} />}
              iconBg="#F0FDF4"
              badge="Este mes"
              badgeBg="#F0FDF4"
              badgeText="#047857"
              bar="linear-gradient(90deg, #10B981, #34D399)"
              barWidth={(totals.closing.length / Math.max(1, totals.count)) * 100}
            />
          </div>
        </div>

        {opportunities.length === 0 ? (
          <div className="px-4 md:px-8">
            <EmptyState
              icon={<OpportunitiesIcon size={24} color="#9B21FF" />}
              title="El pipeline está vacío"
              description="Las oportunidades nacen de un match: elegí uno y convertilo en operación."
              action={{ label: "Ver matches", onClick: () => navigate("/matches") }}
            />
          </div>
        ) : (
          <>
            <div className="mt-7 px-4 md:px-8">
              <SectionHeader
                title="Pipeline de ventas"
                subtitle={`${filtered.length} oportunidades · arrastrá una tarjeta para moverla de etapa`}
              />
            </div>

            {/* Kanban con scroll horizontal */}
            <div className="overflow-x-auto pb-2">
              <div className="flex gap-4 px-4 md:px-8" style={{ minWidth: "max-content" }}>
                {STAGES.map((stage) => {
                  const stageCards = filtered.filter((c) => c.opp.stage === stage.id);
                  const stageTotal = stageCards.reduce((s, c) => s + (c.opp.value ?? 0), 0);
                  return (
                    <KanbanColumn
                      key={stage.id}
                      stage={stage}
                      cards={stageCards}
                      total={stageTotal}
                      isLast={stage.id === "cierre"}
                      dragging={dragging}
                      onDragStart={setDragging}
                      onDragEnd={() => setDragging(null)}
                      onDrop={(id) => {
                        moveOpportunity(id, stage.id);
                        setDragging(null);
                      }}
                      onAdvance={advance}
                      onAdd={() => setNewIn(stage.id)}
                      onPriority={setOpportunityPriority}
                      onLose={markOpportunityLost}
                      onOpenContact={(contactId) => navigate(`/contactos/${contactId}`)}
                    />
                  );
                })}
              </div>
            </div>

            {lost.length > 0 && (
              <div className="px-4 md:px-8 mt-6">
                <LostSection cards={lost} onReopen={reopenOpportunity} />
              </div>
            )}

            <div className="px-4 md:px-8 mt-8 grid gap-5 grid-cols-1 xl:grid-cols-5">
              <div className="xl:col-span-3">
                <PrioritySection
                  cards={priority}
                  onOpen={(contactId) => navigate(`/contactos/${contactId}`)}
                />
              </div>
              <div className="xl:col-span-2">
                <Card className="h-full">
                  <SectionHeader
                    inCard
                    title="Actividad de ventas"
                    subtitle="Últimas acciones en el pipeline"
                  />
                  <div className="p-5 space-y-4">
                    {recentActivity.map((a, idx) => (
                      <div key={a.id} className="flex gap-3 relative">
                        {idx < recentActivity.length - 1 && (
                          <div
                            className="absolute left-[18px] top-8 w-px"
                            style={{ height: "calc(100% + 8px)", background: "#E9E5DE" }}
                          />
                        )}
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 z-10"
                          style={{ background: "#F7F0FF", color: "#9B21FF" }}
                        >
                          <ActivityIcon type={iconFor(a.type)} />
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5">
                          <p className="text-sm" style={{ color: "#374151", fontWeight: 500 }}>
                            {a.title}
                          </p>
                          {a.detail && (
                            <p
                              className="text-xs truncate mt-0.5"
                              style={{ color: "#1A1A1A", fontWeight: 600 }}
                            >
                              {a.detail}
                            </p>
                          )}
                          <p className="text-xs mt-1" style={{ color: "#6B7280" }}>
                            {relativeTime(a.created_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>
          </>
        )}
      </div>

      {newIn && <OpportunityFormModal stage={newIn} onClose={() => setNewIn(null)} />}
    </>
  );
}

/**
 * Las operaciones perdidas no se borran ni vuelven al tablero: quedan acá,
 * plegadas, con el motivo a la vista y la puerta abierta a reactivarlas. Sin
 * esta lista, marcar "perdida" sería tirar la tarjeta a un agujero negro.
 */
function LostSection({
  cards,
  onReopen,
}: {
  cards: Card_[];
  onReopen: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const total = cards.reduce((sum, c) => sum + (c.opp.value ?? 0), 0);

  return (
    <Card>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-5 py-3.5 flex items-center gap-3 transition-all hover:bg-rose-50/40"
      >
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "#FFF1F2" }}
        >
          <AlertCircleIcon color="#E11D48" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
            Operaciones perdidas
          </p>
          <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
            {cards.length} {cards.length === 1 ? "operación" : "operaciones"} · {money(total)} que
            no entran en el pipeline
          </p>
        </div>
        <span
          className="text-xs px-2.5 py-1 rounded-lg flex-shrink-0"
          style={{ background: "#FFF1F2", color: "#E11D48", fontWeight: 600 }}
        >
          {open ? "Ocultar" : "Ver"}
        </span>
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 grid gap-3 sm:grid-cols-2">
          {cards.map(({ opp, contactName, propertyTitle }) => (
            <div
              key={opp.id}
              className="rounded-xl p-3.5 flex items-start gap-2.5"
              style={{ background: "#FFF8F8", border: "1px solid #FECDD3" }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                  {contactName} <SampleBadge record={opp} />
                </p>
                <p className="text-xs truncate mt-0.5" style={{ color: "#6B7280" }}>
                  {propertyTitle}
                </p>
                <p className="text-xs mt-1.5" style={{ color: "#9F1239" }}>
                  {opp.priority_note ?? "Sin motivo registrado"}
                </p>
                <p className="text-xs mt-1" style={{ color: "#6B7280" }}>
                  {relativeTime(opp.closed_at ?? opp.updated_at)}
                </p>
              </div>
              <button
                onClick={() => onReopen(opp.id)}
                className="text-xs px-2.5 py-1 rounded-lg flex-shrink-0 transition-all hover:opacity-80"
                style={{ background: "#E9E5DE", color: "#9B21FF", fontWeight: 600 }}
                title="Vuelve al pipeline en Nuevos"
              >
                Reactivar
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function iconFor(type: string): string {
  if (type.startsWith("contacto")) return "contact";
  if (type === "propiedad_publicada") return "property";
  if (type === "visita_programada") return "calendar";
  if (type === "etapa_avanzada") return "arrow";
  if (type === "llamada") return "eye";
  return "match";
}

function KanbanColumn({
  stage,
  cards,
  total,
  isLast,
  dragging,
  onDragStart,
  onDragEnd,
  onDrop,
  onAdvance,
  onAdd,
  onPriority,
  onLose,
  onOpenContact,
}: {
  stage: (typeof STAGES)[number];
  cards: Card_[];
  total: number;
  isLast: boolean;
  dragging: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDrop: (id: string) => void;
  onAdvance: (id: string) => void;
  onAdd: () => void;
  onPriority: (id: string, note: string | null) => void;
  onLose: (id: string, reason: string | null) => void;
  onOpenContact: (contactId: string) => void;
}) {
  const [isOver, setIsOver] = useState(false);

  return (
    <div
      className="flex flex-col"
      style={{ width: 232 }}
      onDragOver={(e) => {
        if (!dragging) return;
        e.preventDefault();
        setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsOver(false);
        const id = e.dataTransfer.getData("text/plain") || dragging;
        if (id) onDrop(id);
      }}
    >
      <div
        className="rounded-2xl px-4 py-3 mb-3 flex items-center justify-between transition-all"
        style={{
          background: stage.lightBg,
          border: `1px solid ${stage.accent}${isOver ? "88" : "22"}`,
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: stage.accent }} />
          <span className="text-sm truncate" style={{ color: "#1A1A1A", fontWeight: 700 }}>
            {STAGE_LABEL[stage.id]}
          </span>
          <span
            className="text-xs w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: stage.accent, color: "white", fontWeight: 700, fontSize: 10 }}
          >
            {cards.length}
          </span>
        </div>
        <p className="text-xs whitespace-nowrap" style={{ color: stage.accent, fontWeight: 600 }}>
          {moneyCompact(total)}
        </p>
      </div>

      <div
        className="flex flex-col gap-3 rounded-2xl transition-all"
        style={{
          minHeight: 80,
          background: isOver ? `${stage.accent}0D` : undefined,
          outline: isOver ? `2px dashed ${stage.accent}55` : undefined,
          outlineOffset: 4,
        }}
      >
        {cards.map((card) => (
          <OpportunityCard
            key={card.opp.id}
            card={card}
            stageAccent={stage.accent}
            tagBg={stage.tagBg}
            tagText={stage.tagText}
            isLastStage={isLast}
            onAdvance={() => onAdvance(card.opp.id)}
            onDragStart={() => onDragStart(card.opp.id)}
            onDragEnd={onDragEnd}
            onPriority={(note) => onPriority(card.opp.id, note)}
            onLose={(reason) => onLose(card.opp.id, reason)}
            onOpenContact={() => onOpenContact(card.opp.contact_id)}
          />
        ))}

        <button
          onClick={onAdd}
          className="w-full py-2.5 rounded-xl border-2 border-dashed text-xs transition-all hover:opacity-80 flex items-center justify-center gap-1"
          style={{ borderColor: `${stage.accent}44`, color: stage.accent, fontWeight: 600 }}
        >
          <PlusIcon size={12} color="currentColor" />
          Agregar
        </button>
      </div>
    </div>
  );
}

function OpportunityCard({
  card,
  stageAccent,
  tagBg,
  tagText,
  isLastStage,
  onAdvance,
  onDragStart,
  onDragEnd,
  onPriority,
  onLose,
  onOpenContact,
}: {
  card: Card_;
  stageAccent: string;
  tagBg: string;
  tagText: string;
  isLastStage: boolean;
  onAdvance: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onPriority: (note: string | null) => void;
  onLose: (reason: string | null) => void;
  onOpenContact: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  /** Qué está pidiendo la tarjeta: una nota de urgencia o un motivo de baja. */
  const [asking, setAsking] = useState<"priority" | "lose" | null>(null);
  const [draft, setDraft] = useState("");
  const { opp, contactName, propertyTitle, propertyType, matchScore } = card;

  function cancelAsk() {
    setAsking(null);
    setDraft("");
  }

  function confirmAsk() {
    const note = draft.trim() || null;
    if (asking === "priority") onPriority(note ?? "Sin nota");
    if (asking === "lose") onLose(note);
    cancelAsk();
  }

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", opp.id);
        e.dataTransfer.effectAllowed = "move";
        setIsDragging(true);
        onDragStart();
      }}
      onDragEnd={() => {
        setIsDragging(false);
        onDragEnd();
      }}
      onClick={() => setExpanded((v) => !v)}
      className={`rounded-2xl bg-white border overflow-hidden cursor-grab active:cursor-grabbing transition-all hover:shadow-lg ${isDragging ? "pm-dragging" : ""}`}
      style={{
        borderColor: "#E9E5DE",
        boxShadow: "0 1px 6px rgba(168, 85, 255,0.07)",
        borderLeft: `3px solid ${stageAccent}`,
      }}
    >
      <div className="p-3.5">
        {opp.is_priority && opp.priority_note && (
          <div
            className="flex items-center gap-1.5 mb-2.5 px-2.5 py-1.5 rounded-lg"
            style={{ background: "linear-gradient(135deg, #FFF7ED, #FFF1FA)" }}
          >
            <AlertTriangleIcon />
            <span
              className="text-xs leading-tight"
              style={{ color: "#C2410C", fontWeight: 600, fontSize: "10px" }}
            >
              {opp.priority_note}
            </span>
          </div>
        )}

        <div className="flex items-start gap-2.5 mb-3">
          {/* Avatar y nombre llevan a la ficha del cliente (el resto de la tarjeta la expande). */}
          <button
            type="button"
            aria-label={`Ver la ficha de ${contactName}`}
            title="Ver ficha del cliente"
            onClick={(e) => {
              e.stopPropagation();
              onOpenContact();
            }}
            className={`w-8 h-8 rounded-full bg-gradient-to-br ${avatarGradient(contactName)} flex items-center justify-center text-white flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-violet-300 transition-shadow`}
            style={{ fontSize: "10px", fontWeight: 700 }}
          >
            {initials(contactName)}
          </button>
          <div className="flex-1 min-w-0">
            <button
              type="button"
              title="Ver ficha del cliente"
              className="block max-w-full text-left text-sm truncate cursor-pointer hover:underline decoration-violet-400 underline-offset-2"
              style={{ color: "#1A1A1A", fontWeight: 700 }}
              onClick={(e) => {
                e.stopPropagation();
                onOpenContact();
              }}
            >
              {contactName} <SampleBadge record={opp} />
            </button>
            <p className="text-xs truncate mt-0.5" style={{ color: "#6B7280" }}>
              {propertyTitle}
            </p>
          </div>
          <span
            className="text-xs px-1.5 py-0.5 rounded-md flex-shrink-0"
            style={{ background: tagBg, color: tagText, fontWeight: 600, fontSize: "10px" }}
          >
            {propertyType}
          </span>
        </div>

        <div className="flex items-center justify-between mb-3 gap-2">
          <span className="text-sm" style={{ color: "#1A1A1A", fontWeight: 800 }}>
            {money(opp.value, opp.currency)}
          </span>
          {matchScore !== null && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <div className="h-1.5 rounded-full overflow-hidden" style={{ width: 32, background: "#E9E5DE" }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${matchScore}%`, background: "var(--gradient-brand-h)" }}
                />
              </div>
              <span className="text-xs text-gradient-brand-h" style={{ fontWeight: 700 }}>
                {matchScore}%
              </span>
            </div>
          )}
        </div>

        {expanded && (
          <div
            className="mb-3 p-2.5 rounded-xl text-xs space-y-1.5"
            style={{ background: "#FAF8F5", border: "1px solid #E9E5DE" }}
          >
            <div className="flex items-center gap-2">
              <MapPinIcon size={11} />
              <span style={{ color: "#6B7280" }}>{propertyTitle}</span>
            </div>
            <div className="flex items-center gap-2">
              <ClockIcon size={11} color="#BF7FFF" />
              <span style={{ color: "#6B7280" }}>{daysInStage(opp.stage_since)}</span>
            </div>

            {asking ? (
              <div className="pt-1" onClick={(e) => e.stopPropagation()}>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmAsk();
                    if (e.key === "Escape") cancelAsk();
                  }}
                  placeholder={
                    asking === "priority" ? "¿Por qué es urgente?" : "¿Por qué se cayó?"
                  }
                  autoFocus
                  className="w-full px-2.5 py-1.5 rounded-lg text-xs border outline-none bg-white text-[#1A1A1A] placeholder:text-[#6B7280] border-[#E9E5DE] focus:border-[#9B21FF] focus-visible:ring-2 focus-visible:ring-[#9B21FF]"
                />
                <div className="flex items-center gap-1.5 mt-1.5">
                  <button
                    onClick={confirmAsk}
                    className="px-2.5 py-1 rounded-lg text-xs text-white transition-all hover:opacity-90"
                    style={{
                      background: asking === "lose" ? "#E11D48" : "var(--gradient-brand)",
                      fontWeight: 600,
                      fontSize: "10px",
                    }}
                  >
                    {asking === "lose" ? "Dar de baja" : "Marcar urgente"}
                  </button>
                  <button
                    onClick={cancelAsk}
                    className="px-2.5 py-1 rounded-lg text-xs transition-all hover:bg-violet-50"
                    style={{ color: "#6B7280", fontWeight: 600, fontSize: "10px" }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 pt-1" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => {
                    if (opp.is_priority) {
                      onPriority(null);
                    } else {
                      setDraft("");
                      setAsking("priority");
                    }
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg transition-all hover:opacity-80"
                  style={{
                    background: opp.is_priority ? "#FEF3C7" : "#F7F0FF",
                    color: opp.is_priority ? "#B45309" : "#9B21FF",
                    fontWeight: 600,
                    fontSize: "10px",
                  }}
                >
                  <AlertTriangleIcon color={opp.is_priority ? "#B45309" : "#9B21FF"} />
                  {opp.is_priority ? "Quitar urgencia" : "Marcar urgente"}
                </button>
                <button
                  onClick={() => {
                    setDraft("");
                    setAsking("lose");
                  }}
                  className="px-2 py-1 rounded-lg transition-all hover:opacity-80"
                  style={{ background: "#FFF1F2", color: "#E11D48", fontWeight: 600, fontSize: "10px" }}
                >
                  Perdida
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 min-w-0">
            <ClockIcon />
            <span className="text-xs truncate" style={{ color: "#6B7280" }}>
              {relativeTime(opp.updated_at)}
            </span>
          </div>

          {isLastStage ? (
            <span
              className="text-xs px-2 py-1 rounded-lg flex-shrink-0"
              style={{ background: "#D1FAE5", color: "#047857", fontWeight: 600 }}
            >
              ✓ Cierre
            </span>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAdvance();
              }}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-all hover:opacity-80 flex-shrink-0"
              style={{ background: `${stageAccent}15`, color: stageAccent, fontWeight: 600 }}
              title="Avanzar etapa"
            >
              Avanzar
              <ChevronRightIcon size={10} color="currentColor" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PrioritySection({
  cards,
  onOpen,
}: {
  cards: Card_[];
  onOpen: (contactId: string) => void;
}) {
  return (
    <Card className="h-full">
      <div
        className="px-5 py-4 border-b flex items-center gap-3"
        style={{ borderColor: "#FEF3C7", background: "linear-gradient(135deg, #FFFBEB 0%, #FFF7ED 100%)" }}
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #F97316, #EF4444)" }}
        >
          <AlertTriangleIcon size={16} color="white" />
        </div>
        <div>
          <p className="text-sm" style={{ color: "#92400E", fontWeight: 700 }}>
            Oportunidades que requieren atención
          </p>
          <p className="text-xs mt-0.5" style={{ color: "#B45309" }}>
            {cards.length} {cards.length === 1 ? "espera tu acción" : "esperan tu acción"}
          </p>
        </div>
      </div>

      <div className="p-4 grid gap-3 sm:grid-cols-2">
        {cards.length === 0 ? (
          <div className="sm:col-span-2 py-6 text-center">
            <p className="text-sm" style={{ color: "#6B7280" }}>
              Sin oportunidades urgentes 🎉
            </p>
          </div>
        ) : (
          cards.map(({ opp, contactName, matchScore }) => (
            <div
              key={opp.id}
              onClick={() => onOpen(opp.contact_id)}
              className="rounded-xl p-3.5 cursor-pointer transition-all hover:shadow-md"
              style={{
                background: "linear-gradient(135deg, #FFFBEB 0%, #FFF7ED 100%)",
                border: "1px solid #FDE68A",
              }}
            >
              <div className="flex items-center gap-2.5 mb-2.5">
                <div
                  className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarGradient(contactName)} flex items-center justify-center text-white flex-shrink-0`}
                  style={{ fontSize: "11px", fontWeight: 700 }}
                >
                  {initials(contactName)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                    {contactName}
                  </p>
                  {matchScore !== null && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <div className="h-1 w-8 rounded-full overflow-hidden" style={{ background: "#E9E5DE" }}>
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${matchScore}%`, background: "var(--gradient-brand-h)" }}
                        />
                      </div>
                      <span className="text-xs text-gradient-brand-h" style={{ fontWeight: 700 }}>
                        {matchScore}% Match
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {opp.priority_note && (
                <div
                  className="flex items-start gap-1.5 p-2 rounded-lg"
                  style={{ background: "rgba(249,115,22,0.08)" }}
                >
                  <AlertCircleIcon />
                  <p className="text-xs leading-tight" style={{ color: "#92400E" }}>
                    {opp.priority_note}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between mt-2.5 gap-2">
                <span className="text-xs" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                  {money(opp.value, opp.currency)}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(opp.contact_id);
                  }}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg text-white transition-all hover:opacity-90"
                  style={{ background: "linear-gradient(135deg, #F97316, #FF5ECA)", fontWeight: 600 }}
                >
                  <MatchesSolidIcon size={10} />
                  Atender
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
