import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/states";
import { cancelCampaign, patchCampaign, pauseCampaign, removeCampaign, sendTest, submitCampaign } from "@/lib/marketing/actions";
import { dispatchNow, fetchRecipients, marketingErrorText, refreshServerState, refreshStatus, type ServerRecipient } from "@/lib/marketing/api";
import { renderEmail, renderWhatsApp } from "@/lib/marketing/render";
import { evaluateSegment, EXCLUSION_LABEL } from "@/lib/marketing/segments";
import type { EmailTemplate, WhatsAppTemplate } from "@/lib/marketing/types";
import { clampLimits, fillUnsubscribe, maskEmail, maskPhoneDigits, RECIPIENT_STATUS_LABEL, type RecipientStatus } from "../../../shared/marketing";
import { CAMPAIGN_STATUS } from "./CampaignsTab";
import { AudiencePreview } from "./SegmentsTab";
import { ReadinessBanner } from "./ReadinessBanner";
import { useMarketingCtx } from "./useMarketingCtx";
import { Btn, Field, fmtDate, INPUT, Modal, Notice } from "./ui";

const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
};

export default function CampaignEditorPage() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const { m, agencyId, segmentData, renderData, store } = useMarketingCtx();
  const c = m.campaigns.find((x) => x.id === campaignId);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger" | "info"; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testPhone, setTestPhone] = useState(store.profile.phone ?? "");
  const [previewId, setPreviewId] = useState("");
  const [recipients, setRecipients] = useState<ServerRecipient[] | null>(null);

  useEffect(() => {
    void refreshStatus(agencyId);
  }, [agencyId]);

  const segment = m.segments.find((s) => s.id === c?.segmentId);
  const template = m.templates.find((t) => t.id === c?.templateId && t.channel === c?.channel);
  const audience = useMemo(() => (c && segment ? evaluateSegment(segment.rules, c.channel, segmentData, m) : null), [c, segment, segmentData, m]);
  const editable = c?.status === "borrador";
  const live = c && ["programada", "enviando", "pausada", "enviada", "cancelada"].includes(c.status);

  // Mientras la pantalla está abierta y la campaña "enviando", empuja la próxima tanda cada minuto
  // (además del cron del servidor, si está configurado).
  useEffect(() => {
    if (!c || !live || store.isDemo) return;
    let alive = true;
    const tick = async () => {
      if (c.status === "enviando" || (c.status === "programada" && c.scheduledAt && Date.parse(c.scheduledAt) <= Date.now())) await dispatchNow(c.id);
      await refreshServerState(agencyId);
      const r = await fetchRecipients(c.id);
      if (alive && r.ok && r.data) setRecipients(r.data.recipients);
    };
    void tick();
    const t = setInterval(tick, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [c?.id, c?.status, live, agencyId, store.isDemo]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!c) {
    return (
      <>
        <AppHeader title="Campaña" compact />
        <EmptyState title="No encontramos esta campaña" action={{ label: "Volver a Marketing", onClick: () => navigate("/marketing") }} />
      </>
    );
  }

  const patch = (p: Parameters<typeof patchCampaign>[2]) => patchCampaign(agencyId, c.id, p);
  const templates = m.templates.filter((t) => t.channel === c.channel);
  const previewContact =
    store.contactById(previewId) ?? audience?.eligible[0] ?? audience?.matched[0] ?? store.contacts[0];
  const s = m.status;
  const waTpl = c.channel === "whatsapp" && template ? s.whatsapp?.templates.find((x) => x.name === (template as WhatsAppTemplate).waName && x.language === (template as WhatsAppTemplate).waLanguage) : undefined;

  const blockers: string[] = [];
  if (store.isDemo) blockers.push("Estás en la demo: no se envía nada.");
  else {
    if (!s.configured.db) blockers.push("Falta el servidor de marketing (Supabase del CRM).");
    else if (c.channel === "email" && !s.configured.email) blockers.push("Falta configurar Resend y el dominio de envío.");
    else if (c.channel === "whatsapp" && !s.configured.whatsapp) blockers.push("Falta configurar WhatsApp Cloud API.");
    else if (c.channel === "whatsapp" && !s.whatsapp?.connected) blockers.push("No hay un número de WhatsApp conectado.");
    if (s.configured.db && !s.configured.sendEnabled) blockers.push("Los envíos reales están apagados (MARKETING_SEND_ENABLED).");
    if (s.configured.db && !s.isAdmin) blockers.push("Solo un administrador puede enviar.");
  }
  if (!segment) blockers.push("Elegí una audiencia.");
  if (!template) blockers.push("Elegí una plantilla.");
  if (audience && audience.eligible.length === 0) blockers.push("La audiencia no tiene a nadie que pueda recibir.");
  if (c.channel === "whatsapp" && template && s.whatsapp?.connected) {
    if (!waTpl) blockers.push("La plantilla no existe en tu cuenta de WhatsApp (sincronizá desde el Inbox).");
    else if (waTpl.status !== "APPROVED" || (waTpl.category ?? "").toUpperCase() !== "MARKETING") blockers.push("La plantilla tiene que estar APROBADA y ser de categoría MARKETING.");
  }
  const testBlockers = blockers.filter((b) => !b.startsWith("Elegí una audiencia") && !b.startsWith("La audiencia"));

  async function confirm() {
    if (!c || !segment || !template || !audience) return;
    setBusy(true);
    setMsg(null);
    const r = await submitCampaign(agencyId, c, segment, template, audience.eligible, renderData, store.contacts);
    setBusy(false);
    setConfirming(false);
    if (!r.ok) setMsg({ tone: "danger", text: marketingErrorText(r.error) });
    else {
      const rej = Object.entries(r.rejected)
        .map(([k, v]) => `${v} ${EXCLUSION_LABEL[k as keyof typeof EXCLUSION_LABEL]?.toLowerCase() ?? k}`)
        .join(", ");
      setMsg({ tone: "ok", text: `Listo: ${r.queued} en cola.${rej ? ` El servidor dejó afuera: ${rej}.` : ""}` });
    }
  }

  async function test() {
    if (!c || !template || !previewContact) return;
    setBusy(true);
    const r = await sendTest(agencyId, c, segment, template, previewContact, renderData, c.channel === "whatsapp" ? testPhone : null);
    setBusy(false);
    setTestOpen(false);
    setMsg(r.ok ? { tone: "ok", text: c.channel === "email" ? "Prueba enviada a tu email." : "Prueba enviada a tu WhatsApp." } : { tone: "danger", text: marketingErrorText(r.error) });
  }

  const st = CAMPAIGN_STATUS[c.status];
  return (
    <>
      <AppHeader title={c.name} subtitle={c.channel === "email" ? "Campaña por email" : "Campaña por WhatsApp"} breadcrumb={["Marketing", "Campañas"]} compact />
      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-10">
        <div className="mt-5 space-y-4 max-w-6xl">
          <div className="flex flex-wrap items-center gap-2">
            <Btn kind="ghost" onClick={() => navigate("/marketing")}>
              ← Campañas
            </Btn>
            <Badge bg={st.bg} text={st.text}>
              {st.label}
            </Badge>
            {c.lastError && <span className="text-xs" style={{ color: "#BE123C" }}>{marketingErrorText(c.lastError)}</span>}
          </div>
          <ReadinessBanner />
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

          <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
            <div className="space-y-4">
              <Card padded>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nombre">
                    <input className={INPUT} disabled={!editable} value={c.name} onChange={(e) => patch({ name: e.target.value })} />
                  </Field>
                  <Field label="Audiencia">
                    <select className={INPUT} disabled={!editable} value={c.segmentId ?? ""} onChange={(e) => patch({ segmentId: e.target.value || null })}>
                      <option value="">Elegí una audiencia…</option>
                      {m.segments.map((sg) => (
                        <option key={sg.id} value={sg.id}>
                          {sg.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Plantilla">
                    <select className={INPUT} disabled={!editable} value={c.templateId ?? ""} onChange={(e) => patch({ templateId: e.target.value || null })}>
                      <option value="">Elegí una plantilla…</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Cuándo" hint="Vacío = apenas confirmes (respetando los límites).">
                    <input
                      type="datetime-local"
                      className={INPUT}
                      disabled={!editable}
                      value={toLocalInput(c.scheduledAt)}
                      onChange={(e) => patch({ scheduledAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
                    />
                  </Field>
                </div>
                {(m.segments.length === 0 || templates.length === 0) && (
                  <p className="text-xs mt-3" style={{ color: "#6B7280" }}>
                    Primero armá {m.segments.length === 0 ? "una audiencia" : ""}
                    {m.segments.length === 0 && templates.length === 0 ? " y " : ""}
                    {templates.length === 0 ? `una plantilla de ${c.channel === "email" ? "email" : "WhatsApp"}` : ""} desde las pestañas de Marketing.
                  </p>
                )}
              </Card>

              <Card padded>
                <p className="text-sm mb-3" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                  Límites de envío
                </p>
                <div className="grid gap-3 grid-cols-3">
                  <Field label="Por hora">
                    <input className={INPUT} disabled={!editable} inputMode="numeric" value={c.limits.perHour} onChange={(e) => patch({ limits: clampLimits({ ...c.limits, perHour: Number(e.target.value) }) })} />
                  </Field>
                  <Field label="Por día">
                    <input className={INPUT} disabled={!editable} inputMode="numeric" value={c.limits.perDay} onChange={(e) => patch({ limits: clampLimits({ ...c.limits, perDay: Number(e.target.value) }) })} />
                  </Field>
                  <Field label="Días entre envíos" hint="A un mismo contacto">
                    <input className={INPUT} disabled={!editable} inputMode="numeric" value={c.limits.minDaysBetween} onChange={(e) => patch({ limits: clampLimits({ ...c.limits, minDaysBetween: Number(e.target.value) }) })} />
                  </Field>
                </div>
                {c.channel === "whatsapp" && (
                  <p className="text-xs mt-2" style={{ color: "#6B7280" }}>
                    Meta además limita cuántas personas distintas podés contactar por día según tu nivel (250, 2.000, 10.000…) y baja la calidad del número si
                    muchos bloquean o reportan. Empezá con pocos.
                  </p>
                )}
              </Card>

              <Card padded>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <p className="text-sm flex-1" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                    Vista previa por contacto
                  </p>
                  <select className={`${INPUT} sm:w-64`} value={previewContact?.id ?? ""} onChange={(e) => setPreviewId(e.target.value)}>
                    {(audience?.matched.length ? audience.matched : store.contacts).map((ct) => (
                      <option key={ct.id} value={ct.id}>
                        {ct.full_name}
                        {ct.is_sample ? " (ejemplo)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                {!template || !previewContact ? (
                  <p className="text-sm" style={{ color: "#9CA3AF" }}>
                    Elegí una plantilla para ver cómo le llega a cada contacto.
                  </p>
                ) : template.channel === "email" ? (
                  <EmailPreview t={template} contactId={previewContact.id} />
                ) : (
                  <WaPreview t={template} contactId={previewContact.id} />
                )}
              </Card>

              {c.channel === "whatsapp" && template && audience && audience.eligible.length > 0 && (
                <WaManualLinks audience={audience} template={template as WhatsAppTemplate} />
              )}
              {live && <RecipientsLog recipients={recipients} channel={c.channel} />}
            </div>

            <div className="space-y-3">
              {audience ? <AudiencePreview audience={audience} /> : <Notice tone="info">Elegí una audiencia para ver a quiénes les llega.</Notice>}
              {editable && (
                <Card padded>
                  <div className="space-y-2">
                    {blockers.length > 0 && (
                      <ul className="text-xs space-y-1 mb-2" style={{ color: "#92400E" }}>
                        {blockers.map((b) => (
                          <li key={b}>• {b}</li>
                        ))}
                      </ul>
                    )}
                    <Btn kind="primary" disabled={busy || blockers.length > 0} onClick={() => setConfirming(true)}>
                      {c.scheduledAt ? "Programar envío" : "Enviar campaña"}
                    </Btn>
                    <Btn disabled={busy || testBlockers.length > 0 || !template} onClick={() => setTestOpen(true)}>
                      Enviar prueba a mí
                    </Btn>
                    <p className="text-xs" style={{ color: "#9CA3AF" }}>
                      El borrador se guarda solo en este navegador.
                    </p>
                    <Btn
                      kind="danger"
                      onClick={() => {
                        removeCampaign(agencyId, c.id);
                        navigate("/marketing");
                      }}
                    >
                      Borrar borrador
                    </Btn>
                  </div>
                </Card>
              )}
              {live && c.status !== "enviada" && c.status !== "cancelada" && (
                <Card padded>
                  <div className="flex flex-wrap gap-2">
                    {c.status === "pausada" ? (
                      <Btn onClick={async () => setMsg(errMsg(await pauseCampaign(agencyId, c, false)))}>Reanudar</Btn>
                    ) : (
                      <Btn onClick={async () => setMsg(errMsg(await pauseCampaign(agencyId, c, true)))}>Pausar</Btn>
                    )}
                    <Btn kind="danger" onClick={async () => setMsg(errMsg(await cancelCampaign(agencyId, c)))}>
                      Cancelar lo que falta
                    </Btn>
                  </div>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>

      {confirming && audience && (
        <Modal
          title="Confirmar campaña"
          onClose={() => setConfirming(false)}
          footer={
            <>
              <Btn onClick={() => setConfirming(false)}>Volver</Btn>
              <Btn kind="primary" disabled={busy} onClick={confirm}>
                {busy ? "Subiendo…" : c.scheduledAt ? "Programar" : "Enviar"}
              </Btn>
            </>
          }
        >
          <p className="text-sm" style={{ color: "#1F2937" }}>
            Se va a enviar a <b>{audience.eligible.length}</b> contactos por {c.channel === "email" ? "email" : "WhatsApp"}
            {c.scheduledAt ? ` a partir del ${fmtDate(c.scheduledAt)}` : " apenas confirmes"}, de a {c.limits.perHour} por hora y {c.limits.perDay} por día como máximo.
          </p>
          <p className="text-sm" style={{ color: "#4B5563" }}>
            El servidor vuelve a chequear bajas y consentimientos antes de cada envío. Quien se dé de baja en el medio no recibe nada más.
          </p>
          {c.channel === "whatsapp" && (
            <Notice tone="info">Meta cobra cada plantilla de marketing entregada. Revisá la tarifa vigente para Argentina antes de enviar.</Notice>
          )}
        </Modal>
      )}
      {testOpen && (
        <Modal
          title="Envío de prueba"
          onClose={() => setTestOpen(false)}
          footer={
            <>
              <Btn onClick={() => setTestOpen(false)}>Cancelar</Btn>
              <Btn kind="primary" disabled={busy || (c.channel === "whatsapp" && !testPhone.trim())} onClick={test}>
                Enviar prueba
              </Btn>
            </>
          }
        >
          <p className="text-sm" style={{ color: "#1F2937" }}>
            Se arma con los datos de <b>{previewContact?.full_name}</b> pero se envía a vos:
            {c.channel === "email" ? " al email de tu usuario." : " al número que pongas abajo."}
          </p>
          {c.channel === "whatsapp" && (
            <Field label="Tu WhatsApp">
              <input className={INPUT} value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="+54 9 221 …" />
            </Field>
          )}
        </Modal>
      )}
    </>
  );
}

const errMsg = (e: string | null) => (e ? { tone: "danger" as const, text: marketingErrorText(e) } : { tone: "ok" as const, text: "Listo." });

function EmailPreview({ t, contactId }: { t: EmailTemplate; contactId: string }) {
  const { store, renderData } = useMarketingCtx();
  const contact = store.contactById(contactId);
  const r = useMemo(() => (contact ? renderEmail(t, contact, renderData) : null), [t, contact, renderData]);
  if (!r) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs" style={{ color: "#4B5563" }}>
        <b>Asunto:</b> {r.subject}
      </p>
      {r.missing.length > 0 && <Notice tone="warn">Sin dato para: {r.missing.map((x) => `{{${x}}}`).join(", ")}.</Notice>}
      <iframe title="Vista previa" sandbox="" className="w-full rounded-xl border" style={{ height: 520, borderColor: "#E9E5DE" }} srcDoc={fillUnsubscribe(r.html, "#vista-previa-baja")} />
    </div>
  );
}

function WaPreview({ t, contactId }: { t: WhatsAppTemplate; contactId: string }) {
  const { store, renderData } = useMarketingCtx();
  const contact = store.contactById(contactId);
  if (!contact) return null;
  const r = renderWhatsApp(t, contact, renderData);
  return (
    <div className="rounded-2xl p-4 max-w-md" style={{ background: "#E7F8EE" }}>
      <div className="rounded-xl p-3 text-sm whitespace-pre-wrap" style={{ background: "white" }}>
        {r.preview}
      </div>
      {t.optOut === "button" && (
        <div className="mt-1 rounded-xl py-2 text-center text-sm" style={{ background: "white", color: "#0284C7", fontWeight: 600 }}>
          No recibir más mensajes
        </div>
      )}
      {r.missing.length > 0 && <p className="text-xs mt-2" style={{ color: "#B45309" }}>Faltan datos para {r.missing.join(", ")}: a este contacto le va a fallar.</p>}
    </div>
  );
}

function WaManualLinks({
  audience,
  template,
}: {
  audience: NonNullable<ReturnType<typeof evaluateSegment>>;
  template: WhatsAppTemplate;
}) {
  const { renderData } = useMarketingCtx();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<Set<string>>(() => new Set());

  const links = useMemo(
    () =>
      audience.eligible.map((contact) => {
        const r = renderWhatsApp(template, contact, renderData);
        const digits = (contact.phone ?? "").replace(/\D/g, "");
        const url = digits ? `https://wa.me/${digits}?text=${encodeURIComponent(r.preview)}` : null;
        return { contact, preview: r.preview, url, missing: r.missing };
      }),
    [audience.eligible, template, renderData],
  );

  const total = links.length;
  const done = links.filter((l) => sent.has(l.contact.id)).length;

  return (
    <Card padded>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div>
          <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
            Enviar manualmente por WhatsApp
          </p>
          <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
            Abrí el chat de cada contacto con el mensaje listo — sin servidor ni Meta.
            {done > 0 && (
              <span style={{ color: "#059669", fontWeight: 600 }}> {done}/{total} enviados</span>
            )}
          </p>
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : undefined, transition: "transform .15s" }}
        >
          <path d="M3 6l5 5 5-5" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="mt-4 space-y-2">
          {links.map(({ contact, url, missing }) => {
            const isSent = sent.has(contact.id);
            return (
              <div
                key={contact.id}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 border"
                style={{
                  borderColor: isSent ? "#A7F3D0" : "#E9E5DE",
                  background: isSent ? "#F0FDF4" : "white",
                }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate" style={{ color: "#1A1A1A", fontWeight: 600 }}>
                    {contact.full_name}
                  </p>
                  <p className="text-xs truncate" style={{ color: "#6B7280" }}>
                    {contact.phone ?? "Sin teléfono"}
                    {missing.length > 0 && (
                      <span style={{ color: "#B45309" }}> · faltan: {missing.join(", ")}</span>
                    )}
                  </p>
                </div>
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setSent((s) => new Set([...s, contact.id]))}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all hover:opacity-80"
                    style={{
                      background: isSent ? "#D1FAE5" : "#25D366",
                      color: isSent ? "#065F46" : "white",
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                      <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.998-1.318A9.956 9.956 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a7.946 7.946 0 01-4.073-1.115l-.291-.173-3.017.794.808-2.95-.19-.303A7.96 7.96 0 014 12c0-4.411 3.589-8 8-8s8 3.589 8 8-3.589 8-8 8z" />
                    </svg>
                    {isSent ? "Enviado ✓" : "Abrir chat"}
                  </a>
                ) : (
                  <span className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "#F3F4F6", color: "#9CA3AF" }}>
                    Sin teléfono
                  </span>
                )}
              </div>
            );
          })}
          <p className="text-xs pt-1" style={{ color: "#9CA3AF" }}>
            Cada botón abre WhatsApp con el mensaje listo. El progreso se guarda mientras no recargues la página.
          </p>
        </div>
      )}
    </Card>
  );
}

function RecipientsLog({ recipients, channel }: { recipients: ServerRecipient[] | null; channel: "email" | "whatsapp" }) {
  if (!recipients) return null;
  return (
    <Card>
      <div className="px-5 py-3 border-b" style={{ borderColor: "#F0EDE6" }}>
        <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
          Registro por destinatario ({recipients.length})
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ color: "#6B7280" }}>
              <th className="text-left px-4 py-2">Contacto</th>
              <th className="text-left px-2 py-2">Estado</th>
              <th className="text-left px-2 py-2">Enviado</th>
              <th className="text-left px-2 py-2">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {recipients.map((r) => (
              <tr key={r.id} className="border-t" style={{ borderColor: "#F0EDE6" }}>
                <td className="px-4 py-2">
                  {r.contact_name ?? "—"} <span style={{ color: "#9CA3AF" }}>{channel === "email" ? maskEmail(r.email_norm) : maskPhoneDigits(r.phone_norm)}</span>
                  {r.is_test && <span style={{ color: "#9B21FF" }}> · prueba</span>}
                </td>
                <td className="px-2 py-2">{RECIPIENT_STATUS_LABEL[r.status as RecipientStatus] ?? r.status}</td>
                <td className="px-2 py-2">{fmtDate(r.sent_at)}</td>
                <td className="px-2 py-2" style={{ color: "#6B7280" }}>
                  {r.skip_reason ? `Omitido: ${EXCLUSION_LABEL[r.skip_reason as keyof typeof EXCLUSION_LABEL] ?? r.skip_reason}` : r.error_code ? `Error ${r.error_code}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
