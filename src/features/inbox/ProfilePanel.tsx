import { useNavigate } from "react-router-dom";
import { Badge, Card } from "@/components/ui/Card";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { STAGE_LABEL, useStore } from "@/data/store";
import { usePublications } from "@/features/propiedades/usePublications";
import { CONTACT_STATUS_LABEL, CONTACT_STATUS_STYLE, money } from "@/lib/format";
import type { Match } from "@/types/db";
import type { Conversation } from "./conversations";
import { Avatar } from "./ConversationList";
import { addressOf } from "./snippets";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: "#FAF8F5", border: "1px solid #F0EDE6" }}>
      <p className="text-[11px]" style={{ color: "#6B7280", fontWeight: 600 }}>
        {label}
      </p>
      <p className="text-sm mt-0.5" style={{ color: "#1A1A1A", fontWeight: 700 }}>
        {value}
      </p>
    </div>
  );
}

export function ProfilePanel({
  conversation,
  crmMatch,
  onBack,
}: {
  conversation: Conversation;
  crmMatch: Match | undefined;
  onBack: () => void;
}) {
  const navigate = useNavigate();
  const { requirementOf, opportunities, matches, events, coverPhoto } = useStore();
  const { channelsOf } = usePublications();
  const { contact, property } = conversation;

  const req = contact ? requirementOf(contact.id) : undefined;
  const opp = contact
    ? (opportunities.find((o) => o.match_id === conversation.matchId) ??
      opportunities
        .filter((o) => o.contact_id === contact.id)
        .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0])
    : undefined;
  const compatible = contact ? matches.filter((m) => m.contact_id === contact.id && !m.is_dismissed).length : 0;
  const nextVisit = contact
    ? events
        .filter((e) => e.contact_id === contact.id && e.type === "visita" && Date.parse(e.starts_at) >= Date.now())
        .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))[0]
    : undefined;
  const statusStyle = contact ? CONTACT_STATUS_STYLE[contact.status] : undefined;
  const publishedCount = property ? channelsOf(property).filter((c) => c.status === "published").length : 0;
  const cover = property ? coverPhoto(property.id) : null;
  const address = addressOf(property);
  const action =
    "w-full min-h-[44px] md:min-h-[40px] rounded-xl text-sm border transition-all hover:border-violet-300";

  return (
    <aside className="h-full overflow-y-auto bg-white p-4 space-y-4" aria-label="Perfil del comprador">
      <button
        onClick={onBack}
        className="xl:hidden flex items-center gap-1 min-h-[44px] text-sm"
        style={{ color: "#9B21FF", fontWeight: 600 }}
      >
        <ChevronLeftIcon size={16} /> Volver a la conversación
      </button>

      <Card padded>
        <div className="flex flex-col items-center text-center">
          <Avatar name={conversation.name} size={64} />
          {contact && statusStyle && (
            <div className="mt-3">
              <Badge bg={statusStyle.bg} text={statusStyle.text} border={statusStyle.border}>
                {CONTACT_STATUS_LABEL[contact.status as keyof typeof CONTACT_STATUS_LABEL] ?? contact.status}
              </Badge>
            </div>
          )}
          <h2 className="text-base mt-2" style={{ color: "#1A1A1A", fontWeight: 800 }}>
            {conversation.name}
          </h2>
          <p className="text-xs mt-1" style={{ color: "#6B7280" }}>
            Teléfono: {contact?.phone ?? "No disponible"}
          </p>
          <p className="text-xs break-all" style={{ color: "#6B7280" }}>
            Email: {contact?.email ?? "No disponible"}
          </p>
        </div>

        {contact ? (
          <div className="grid grid-cols-2 gap-2 mt-4">
            <Stat label="Presupuesto máx." value={req?.budget_max ? money(req.budget_max, req.currency) : "Sin definir"} />
            <Stat label="Etapa CRM" value={opp ? STAGE_LABEL[opp.stage] : "Sin oportunidad"} />
            <Stat label="Propiedades compatibles" value={String(compatible)} />
            {nextVisit && (
              <Stat
                label="Próxima visita"
                value={new Date(nextVisit.starts_at).toLocaleString("es-AR", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              />
            )}
          </div>
        ) : (
          <p className="text-xs mt-4 text-center" style={{ color: "#6B7280" }}>
            Este interesado todavía no está en tus contactos; aparece cuando se sincroniza.
          </p>
        )}

        <div className="mt-4 space-y-2">
          <button
            onClick={() => navigate("/oportunidades")}
            className={action}
            style={{ borderColor: "#E9E5DE", color: "#9B21FF", fontWeight: 600, background: "#FAF8F5" }}
          >
            Ver en pipeline
          </button>
          {contact && (
            <button
              onClick={() => navigate(`/contactos/${contact.id}`)}
              className={action}
              style={{ borderColor: "#E9E5DE", color: "#9B21FF", fontWeight: 600 }}
            >
              Ver ficha del contacto
            </button>
          )}
        </div>
      </Card>

      {property && (
        <Card>
          <div className="h-36 w-full" style={{ background: "var(--gradient-soft)" }}>
            {cover && <img src={cover} alt={`Portada de ${property.title}`} className="w-full h-full object-cover" />}
          </div>
          <div className="p-4">
            <p className="text-[11px] uppercase" style={{ color: "#6B7280", fontWeight: 700, letterSpacing: "0.1em" }}>
              Inmueble de interés
            </p>
            <p className="text-lg mt-1" style={{ color: "#1A1A1A", fontWeight: 800 }}>
              {money(property.price, property.currency)}
            </p>
            <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 600 }}>
              {property.title}
            </p>
            {address && (
              <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
                {address}
              </p>
            )}
            {crmMatch && (
              <p className="text-xs mt-2" style={{ color: "#7C0BD8", fontWeight: 700 }}>
                Match {Math.round(crmMatch.score)}%
              </p>
            )}
            {publishedCount > 0 && (
              <p className="text-xs mt-1" style={{ color: "#6B7280" }}>
                Publicada en {publishedCount} {publishedCount === 1 ? "canal" : "canales"}
              </p>
            )}
            <button
              onClick={() => navigate(`/propiedades/${property.id}`)}
              className={`${action} mt-3`}
              style={{ borderColor: "#E9E5DE", color: "#9B21FF", fontWeight: 600 }}
            >
              Ver propiedad
            </button>
          </div>
        </Card>
      )}
    </aside>
  );
}
