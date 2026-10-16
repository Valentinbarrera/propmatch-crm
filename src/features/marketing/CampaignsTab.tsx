import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/states";
import { MailIcon, WhatsAppIcon } from "@/components/ui/icons";
import { newCampaign } from "@/lib/marketing/actions";
import type { Campaign, CampaignStatus } from "@/lib/marketing/types";
import { useMarketingCtx } from "./useMarketingCtx";
import { Btn, fmtDate, pct } from "./ui";

export const CAMPAIGN_STATUS: Record<CampaignStatus, { label: string; bg: string; text: string }> = {
  borrador: { label: "Borrador", bg: "#F3F4F6", text: "#4B5563" },
  programada: { label: "Programada", bg: "#EFF6FF", text: "#1D4ED8" },
  enviando: { label: "Enviando", bg: "#F7F0FF", text: "#9B21FF" },
  enviada: { label: "Enviada", bg: "#F0FDF4", text: "#15803D" },
  pausada: { label: "Pausada", bg: "#FFFBEB", text: "#B45309" },
  cancelada: { label: "Cancelada", bg: "#FFF1F2", text: "#BE123C" },
};

export function CampaignsTab() {
  const { m, agencyId } = useMarketingCtx();
  const navigate = useNavigate();
  const create = (ch: "email" | "whatsapp") => navigate(`/marketing/campanas/${newCampaign(agencyId, ch).id}`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Btn onClick={() => create("whatsapp")}>Campaña por WhatsApp</Btn>
        <Btn kind="primary" onClick={() => create("email")}>
          Campaña por email
        </Btn>
      </div>
      {m.campaigns.length === 0 ? (
        <Card>
          <EmptyState
            icon={<MailIcon size={22} />}
            title="Todavía no hay campañas"
            description="Elegí una audiencia, una plantilla y mandá propiedades recomendadas a cada contacto."
            action={{ label: "Campaña por email", onClick: () => create("email") }}
          />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y" style={{ borderColor: "#F0EDE6" }}>
            {m.campaigns.map((c) => (
              <CampaignRow key={c.id} c={c} onOpen={() => navigate(`/marketing/campanas/${c.id}`)} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function CampaignRow({ c, onOpen }: { c: Campaign; onOpen: () => void }) {
  const s = CAMPAIGN_STATUS[c.status];
  const st = c.stats;
  const sent = (st.total ?? 0) - (st.queued ?? 0) - (st.skipped ?? 0);
  return (
    <li>
      <button onClick={onOpen} className="w-full text-left px-4 md:px-5 py-4 hover:bg-violet-50/40 transition-all flex flex-wrap items-center gap-3">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: c.channel === "email" ? "#F7F0FF" : "#DCFCE7" }}>
          {c.channel === "email" ? <MailIcon size={15} color="#9B21FF" /> : <WhatsAppIcon size={15} color="#16A34A" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm truncate" style={{ color: "#1A1A1A", fontWeight: 700 }}>
            {c.name}
          </p>
          <p className="text-xs" style={{ color: "#6B7280" }}>
            {c.status === "programada" && c.scheduledAt ? `Sale el ${fmtDate(c.scheduledAt)}` : `Creada ${fmtDate(c.created_at)}`}
            {c.audienceSize !== null ? ` · ${c.audienceSize} destinatarios` : ""}
          </p>
        </div>
        {st.total ? (
          <div className="flex gap-3 text-xs" style={{ color: "#4B5563" }}>
            <Metric label="Enviados" value={String(Math.max(0, sent))} />
            <Metric label="Entregados" value={pct(st.delivered_any, sent)} />
            <Metric label={c.channel === "email" ? "Abiertos" : "Leídos"} value={pct(st.opened_any, sent)} />
            {c.channel === "email" ? <Metric label="Clicks" value={pct(st.clicked_any, sent)} /> : <Metric label="Respondieron" value={pct(st.replied_any, sent)} />}
            <Metric label="Bajas" value={String(st.unsubscribed ?? 0)} />
          </div>
        ) : null}
        <Badge bg={s.bg} text={s.text}>
          {s.label}
        </Badge>
      </button>
    </li>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-center">
      <span className="block" style={{ fontWeight: 800, color: "#1A1A1A" }}>
        {value}
      </span>
      <span style={{ fontSize: 10 }}>{label}</span>
    </span>
  );
}
