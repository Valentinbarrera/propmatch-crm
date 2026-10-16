import { useMemo, useState } from "react";
import { SampleBadge } from "@/components/ui/SampleBadge";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/states";
import { FilterTabs } from "@/components/ui/FilterTabs";
import { OpportunitiesIcon } from "@/components/ui/icons";
import { useStore } from "@/data/store";
import { money } from "@/lib/format";
import { docProgress, nextStep, stepProgress } from "@/lib/deals";
import { dealNumberLabel } from "@/lib/dealRoom";
import type { Deal, DealStatus, Opportunity, OpportunityStage } from "@/types/db";
import { NewDealModal } from "./NewDealModal";

export const DEAL_STATUS_LABEL: Record<DealStatus, string> = {
  en_curso: "En curso",
  cerrada: "Cerrada",
  caida: "Caída",
};

export const DEAL_STATUS_STYLE: Record<DealStatus, { bg: string; text: string }> = {
  en_curso: { bg: "#F7F0FF", text: "#9B21FF" },
  cerrada: { bg: "#F0FDF4", text: "#15803D" },
  caida: { bg: "#FFF1F2", text: "#BE123C" },
};

type Filter = "todas" | DealStatus;

/**
 * Operaciones: cada venta o alquiler en marcha, con qué falta para cerrarla.
 */
export default function OperacionesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { deals, opportunities, propertyById, contactById } = useStore();
  const [filter, setFilter] = useState<Filter>("en_curso");
  const [query, setQuery] = useState("");

  const preProperty = params.get("propiedad");
  const preContact = params.get("contacto");
  const [creating, setCreating] = useState(Boolean(preProperty || preContact));
  // Desde «Iniciar desde una oportunidad»: el alta abre con estos datos ya elegidos.
  // (Pasarlos por la URL no alcanza: el modal se monta antes de que cambien los params.)
  const [startPick, setStartPick] = useState<{ propertyId: string; contactId: string } | null>(null);

  // Accesos directos: oportunidades abiertas (las más avanzadas primero) que
  // todavía no tienen operación. Un clic abre el alta ya completa.
  const startable = useMemo(() => {
    const withDeal = new Set(deals.map((d) => d.opportunity_id).filter(Boolean));
    return opportunities
      .filter((o) => o.stage !== "perdida" && !withDeal.has(o.id) && o.property_id && o.contact_id)
      .sort((a, b) => STAGE_ORDER[b.stage] - STAGE_ORDER[a.stage] || b.updated_at.localeCompare(a.updated_at))
      .slice(0, 6);
  }, [deals, opportunities]);

  const startFrom = (o: Opportunity) => {
    setStartPick({ propertyId: o.property_id!, contactId: o.contact_id });
    setCreating(true);
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return deals.filter((d) => {
      if (filter !== "todas" && d.status !== filter) return false;
      if (!q) return true;
      const hay = [dealNumberLabel(d.number), propertyById(d.property_id)?.title, contactById(d.client_contact_id)?.full_name, d.client.name, d.owner.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [deals, filter, query, propertyById, contactById]);

  const count = (s: DealStatus) => deals.filter((d) => d.status === s).length;

  return (
    <>
      <AppHeader
        title="Operaciones"
        subtitle="Cada venta o alquiler, paso a paso hasta cerrarla."
        search={{ placeholder: "Buscar operación...", value: query, onChange: setQuery }}
        action={{
          label: "Nueva operación",
          onClick: () => {
            setStartPick(null);
            setCreating(true);
          },
        }}
      />

      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-8">
        <div className="mt-6 mb-4">
          <FilterTabs
            options={[
              { value: "en_curso", label: `En curso (${count("en_curso")})` },
              { value: "cerrada", label: `Cerradas (${count("cerrada")})` },
              { value: "caida", label: `Caídas (${count("caida")})` },
              { value: "todas", label: `Todas (${deals.length})` },
            ]}
            value={filter}
            onChange={setFilter}
          />
        </div>

        {filter !== "cerrada" && filter !== "caida" && startable.length > 0 && (
          <Card className="mb-4">
            <div className="px-5 pt-4 pb-2">
              <h3 className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                Iniciar desde una oportunidad
              </h3>
              <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
                Interesados que vienen avanzando y todavía no tienen operación. Se completa sola con el cliente y la propiedad.
              </p>
            </div>
            <div className="px-3 pb-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {startable.map((o) => {
                const contact = contactById(o.contact_id);
                const property = propertyById(o.property_id);
                return (
                  <div key={o.id} className="flex items-center gap-3 rounded-xl border px-3 py-2.5" style={{ borderColor: "#E9E5DE" }}>
                    <button
                      type="button"
                      onClick={() => navigate(`/contactos/${o.contact_id}`)}
                      className="min-w-0 flex-1 text-left"
                      title="Ver ficha del cliente"
                    >
                      <p className="text-sm truncate hover:underline" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                        {contact?.full_name ?? "Sin contacto"}
                      </p>
                      <p className="text-xs truncate" style={{ color: "#6B7280" }}>
                        {STAGE_LABEL[o.stage]} · {property?.title ?? "Propiedad"}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => startFrom(o)}
                      className="px-3 py-1.5 rounded-lg text-xs text-white flex-shrink-0 hover:opacity-90"
                      style={{ background: "var(--gradient-brand)", fontWeight: 700 }}
                    >
                      Iniciar operación
                    </button>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {visible.length === 0 ? (
          <Card>
            <EmptyState
              icon={<OpportunitiesIcon size={24} color="#9B21FF" />}
              title={deals.length === 0 ? "Todavía no hay operaciones" : "No hay operaciones con este filtro"}
              description="Iniciá una operación para llevar los pasos, la documentación y armar la reserva y el contrato desde acá."
              action={{ label: "Nueva operación", onClick: () => setCreating(true) }}
            />
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((d) => (
              <DealCard key={d.id} deal={d} onOpen={() => navigate(`/operaciones/${d.id}`)} />
            ))}
          </div>
        )}
      </div>

      {creating && (
        <NewDealModal
          key={startPick ? `${startPick.propertyId}:${startPick.contactId}` : "nueva"}
          initialPropertyId={startPick?.propertyId ?? preProperty}
          initialContactId={startPick?.contactId ?? preContact}
          onClose={() => {
            setCreating(false);
            setStartPick(null);
            if (preProperty || preContact) setParams({}, { replace: true });
          }}
          onCreated={(id) => navigate(`/operaciones/${id}`)}
        />
      )}
    </>
  );
}

const STAGE_ORDER: Record<OpportunityStage, number> = { nuevos: 0, contactados: 1, visita: 2, negociacion: 3, cierre: 4, perdida: -1 };
const STAGE_LABEL: Record<OpportunityStage, string> = {
  nuevos: "Nuevo",
  contactados: "Contactado",
  visita: "Visita",
  negociacion: "Negociación",
  cierre: "Cierre",
  perdida: "Perdida",
};

function DealCard({ deal, onOpen }: { deal: Deal; onOpen: () => void }) {
  const { propertyById, contactById } = useStore();
  const property = propertyById(deal.property_id);
  const client = contactById(deal.client_contact_id);
  const steps = stepProgress(deal);
  const docs = docProgress(deal);
  const next = nextStep(deal);
  const style = DEAL_STATUS_STYLE[deal.status];
  const pct = Math.round((steps.done / steps.total) * 100);

  return (
    <div
      onClick={onOpen}
      className="rounded-2xl border p-5 cursor-pointer transition-all hover:shadow-md"
      style={{ background: "white", borderColor: "#E9E5DE", boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase" style={{ color: "#6B7280", fontWeight: 700, letterSpacing: "0.08em" }}>
            {dealNumberLabel(deal.number)} · {deal.kind === "venta" ? "Venta" : "Alquiler"} <SampleBadge record={deal} />
          </p>
          <p className="text-sm mt-0.5 truncate" style={{ color: "#1A1A1A", fontWeight: 700 }}>
            {property?.title ?? "Sin propiedad"}
          </p>
          <p className="text-xs truncate" style={{ color: "#6B7280" }}>
            {client?.full_name ?? (deal.client.name || "Sin cliente")}
          </p>
        </div>
        <span
          className="text-xs px-2.5 py-1 rounded-full whitespace-nowrap"
          style={{ background: style.bg, color: style.text, fontWeight: 600 }}
        >
          {DEAL_STATUS_LABEL[deal.status]}
        </span>
      </div>

      <p className="text-base mt-3" style={{ color: "#1A1A1A", fontWeight: 800 }}>
        {money(deal.price, deal.currency)}
        {deal.kind === "alquiler" && (
          <span className="text-xs" style={{ color: "#6B7280", fontWeight: 500 }}>
            {" "}
            / mes
          </span>
        )}
      </p>

      <div className="mt-3">
        <div className="flex justify-between text-xs mb-1" style={{ color: "#6B7280" }}>
          <span>
            Pasos {steps.done}/{steps.total}
          </span>
          <span>
            Documentos {docs.done}/{docs.total}
          </span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#E9E5DE" }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--gradient-brand-h)" }} />
        </div>
      </div>

      {deal.status === "en_curso" && next && (
        <p className="text-xs mt-3" style={{ color: "#9B21FF", fontWeight: 600 }}>
          Sigue: {next.label}
        </p>
      )}
    </div>
  );
}
