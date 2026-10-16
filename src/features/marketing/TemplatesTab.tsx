import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/states";
import { MailIcon, WhatsAppIcon } from "@/components/ui/icons";
import { removeTemplate, saveTemplate } from "@/lib/marketing/actions";
import { renderEmail, renderWhatsApp, starterEmail, starterWhatsApp } from "@/lib/marketing/render";
import { newId } from "@/lib/marketing/state";
import type { EmailTemplate, MarketingTemplate, WhatsAppTemplate } from "@/lib/marketing/types";
import { fillUnsubscribe, MARKETING_VARIABLES, WA_OPT_OUT_BUTTON, WA_OPT_OUT_FOOTER, isOptOutMessage } from "../../../shared/marketing";
import { useMarketingCtx } from "./useMarketingCtx";
import { Btn, Chip, Field, INPUT, Modal, Notice } from "./ui";

export function TemplatesTab() {
  const { m, agencyId } = useMarketingCtx();
  const [editing, setEditing] = useState<MarketingTemplate | null>(null);
  const create = (ch: "email" | "whatsapp") => {
    const at = new Date().toISOString();
    setEditing(ch === "email" ? starterEmail(at, newId("tpl")) : starterWhatsApp(at, newId("tpl")));
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm" style={{ color: "#6B7280" }}>
          Variables: {MARKETING_VARIABLES.map((v) => `{{${v.key}}}`).join(", ")}. El pie con tus datos y el link de baja se agrega solo.
        </p>
        <div className="flex gap-2">
          <Btn onClick={() => create("whatsapp")}>Plantilla de WhatsApp</Btn>
          <Btn kind="primary" onClick={() => create("email")}>
            Plantilla de email
          </Btn>
        </div>
      </div>
      {m.templates.length === 0 ? (
        <Card>
          <EmptyState icon={<MailIcon size={22} />} title="Sin plantillas todavía" description="Arrancá con una de ejemplo y adaptala." action={{ label: "Plantilla de email", onClick: () => create("email") }} />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {m.templates.map((t) => (
            <Card key={t.id} padded hover>
              <button className="w-full text-left" onClick={() => setEditing(t)}>
                <div className="flex items-center gap-2">
                  {t.channel === "email" ? <MailIcon size={14} color="#9B21FF" /> : <WhatsAppIcon size={14} color="#16A34A" />}
                  <p className="text-sm truncate" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                    {t.name}
                  </p>
                </div>
                <p className="text-xs mt-1 line-clamp-2" style={{ color: "#6B7280" }}>
                  {t.channel === "email" ? t.subject : `Meta: ${t.waName} (${t.waLanguage})`}
                </p>
              </button>
            </Card>
          ))}
        </div>
      )}
      {editing?.channel === "email" && (
        <EmailTemplateEditor
          template={editing}
          onClose={() => setEditing(null)}
          onSave={(t) => {
            saveTemplate(agencyId, t);
            setEditing(null);
          }}
          onDelete={() => {
            removeTemplate(agencyId, editing.id);
            setEditing(null);
          }}
        />
      )}
      {editing?.channel === "whatsapp" && (
        <WhatsAppTemplateEditor
          template={editing}
          onClose={() => setEditing(null)}
          onSave={(t) => {
            saveTemplate(agencyId, t);
            setEditing(null);
          }}
          onDelete={() => {
            removeTemplate(agencyId, editing.id);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function PreviewContactPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { store } = useMarketingCtx();
  return (
    <select className={INPUT} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Vista previa para">
      {store.contacts.map((c) => (
        <option key={c.id} value={c.id}>
          Vista previa para: {c.full_name}
          {c.is_sample ? " (ejemplo)" : ""}
        </option>
      ))}
    </select>
  );
}

function EmailTemplateEditor({ template, onClose, onSave, onDelete }: { template: EmailTemplate; onClose: () => void; onSave: (t: EmailTemplate) => void; onDelete: () => void }) {
  const { store, renderData } = useMarketingCtx();
  const [t, setT] = useState(template);
  const set = (p: Partial<EmailTemplate>) => setT((x) => ({ ...x, ...p }));
  const [contactId, setContactId] = useState(store.contacts[0]?.id ?? "");
  const contact = store.contactById(contactId);
  const preview = useMemo(() => (contact ? renderEmail(t, contact, renderData) : null), [t, contact, renderData]);

  return (
    <Modal
      title="Plantilla de email"
      wide
      onClose={onClose}
      footer={
        <>
          <Btn kind="danger" onClick={onDelete}>
            Borrar
          </Btn>
          <Btn onClick={onClose}>Cancelar</Btn>
          <Btn kind="primary" disabled={!t.name.trim() || !t.subject.trim() || !t.body.trim()} onClick={() => onSave(t)}>
            Guardar plantilla
          </Btn>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <Field label="Nombre interno">
            <input className={INPUT} value={t.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Asunto">
            <input className={INPUT} value={t.subject} onChange={(e) => set({ subject: e.target.value })} maxLength={200} />
          </Field>
          <label className="flex items-start gap-2 text-xs" style={{ color: "#4B5563" }}>
            <input type="checkbox" checked={t.advertisingPrefix} onChange={(e) => set({ advertisingPrefix: e.target.checked })} />
            <span>
              Anteponer «Publicidad:» al asunto. Lo exige la Disposición 4/2009 para publicidad <b>no solicitada</b>; con consentimiento
              previo es opcional (consultalo con tu asesor legal).
            </span>
          </label>
          <Field label="Texto de vista previa (preheader)">
            <input className={INPUT} value={t.preheader} onChange={(e) => set({ preheader: e.target.value })} maxLength={150} />
          </Field>
          <Field label="Mensaje" hint="Separá párrafos con una línea en blanco.">
            <textarea className={INPUT} rows={8} value={t.body} onChange={(e) => set({ body: e.target.value })} />
          </Field>
          <div className="flex flex-wrap gap-1.5">
            {MARKETING_VARIABLES.map((v) => (
              <Chip key={v.key} active={false} onClick={() => set({ body: `${t.body}{{${v.key}}}` })}>
                {`{{${v.key}}}`}
              </Chip>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Botón">
              <input className={INPUT} value={t.ctaLabel} onChange={(e) => set({ ctaLabel: e.target.value })} placeholder="Sin botón" />
            </Field>
            <Field label="Link del botón">
              <input className={INPUT} value={t.ctaUrl} onChange={(e) => set({ ctaUrl: e.target.value })} placeholder="{{link_web}}" />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm" style={{ color: "#1F2937" }}>
            <input type="checkbox" checked={t.includeRecommendations} onChange={(e) => set({ includeRecommendations: e.target.checked })} />
            Agregar propiedades recomendadas por matching
            <select
              className="ml-auto px-2 py-1 rounded-lg border text-sm"
              style={{ borderColor: "#E9E5DE" }}
              value={t.recommendationsCount}
              disabled={!t.includeRecommendations}
              onChange={(e) => set({ recommendationsCount: Number(e.target.value) })}
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="space-y-2">
          <PreviewContactPicker value={contactId} onChange={setContactId} />
          {preview && (
            <>
              <p className="text-xs" style={{ color: "#4B5563" }}>
                <b>Asunto:</b> {preview.subject}
              </p>
              {preview.missing.length > 0 && <Notice tone="warn">Sin dato para: {preview.missing.map((x) => `{{${x}}}`).join(", ")}. Va a quedar vacío.</Notice>}
              {t.includeRecommendations && preview.properties.length === 0 && (
                <Notice tone="info">Este contacto no tiene propiedades compatibles disponibles: el mail sale sin el bloque de recomendaciones.</Notice>
              )}
              <iframe
                title="Vista previa del email"
                sandbox=""
                className="w-full rounded-xl border"
                style={{ height: 560, borderColor: "#E9E5DE", background: "#F3F4F6" }}
                srcDoc={fillUnsubscribe(preview.html, "#vista-previa-baja")}
              />
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function WhatsAppTemplateEditor({
  template,
  onClose,
  onSave,
  onDelete,
}: {
  template: WhatsAppTemplate;
  onClose: () => void;
  onSave: (t: WhatsAppTemplate) => void;
  onDelete: () => void;
}) {
  const { store, renderData, m } = useMarketingCtx();
  const [t, setT] = useState(template);
  const set = (p: Partial<WhatsAppTemplate>) => setT((x) => ({ ...x, ...p }));
  const [contactId, setContactId] = useState(store.contacts[0]?.id ?? "");
  const contact = store.contactById(contactId);
  const count = useMemo(() => {
    const nums = [...t.body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((x) => Number(x[1]));
    return nums.length ? Math.max(...nums) : 0;
  }, [t.body]);
  const params = Array.from({ length: count }, (_, i) => t.params[i] ?? "");
  const preview = contact ? renderWhatsApp({ ...t, params }, contact, renderData) : null;
  const serverTpls = m.status.whatsapp?.templates ?? [];
  const match = serverTpls.find((x) => x.name === t.waName && x.language === t.waLanguage);
  const hasOptOutText = /\bbaja\b/i.test(t.body) || t.body.split("\n").some((l) => isOptOutMessage(l));

  return (
    <Modal
      title="Plantilla de WhatsApp (marketing)"
      wide
      onClose={onClose}
      footer={
        <>
          <Btn kind="danger" onClick={onDelete}>
            Borrar
          </Btn>
          <Btn onClick={onClose}>Cancelar</Btn>
          <Btn kind="primary" disabled={!t.name.trim() || !t.waName.trim()} onClick={() => onSave({ ...t, params })}>
            Guardar plantilla
          </Btn>
        </>
      }
    >
      <Notice tone="info">
        WhatsApp solo permite mensajes de marketing con <b>plantillas aprobadas por Meta</b> de categoría <b>MARKETING</b>, enviadas por la API
        oficial (Cloud API) y a contactos que dieron su consentimiento. Acá se vincula la plantilla y se decide qué va en cada variable.
        Nunca se hacen envíos masivos por wa.me.
      </Notice>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <Field label="Nombre interno">
            <input className={INPUT} value={t.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          {serverTpls.length > 0 && (
            <Field label="Plantillas de tu cuenta de WhatsApp">
              <select
                className={INPUT}
                value={match ? `${match.name}|${match.language}` : ""}
                onChange={(e) => {
                  const x = serverTpls.find((s) => `${s.name}|${s.language}` === e.target.value);
                  if (x) set({ waName: x.name, waLanguage: x.language, body: x.components.find((c) => (c.type ?? "").toUpperCase() === "BODY")?.text ?? t.body });
                }}
              >
                <option value="">Elegí una…</option>
                {serverTpls.map((s) => (
                  <option key={`${s.name}|${s.language}`} value={`${s.name}|${s.language}`}>
                    {s.name} ({s.language}) · {s.category ?? "?"} · {s.status}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Nombre en Meta">
              <input className={INPUT} value={t.waName} onChange={(e) => set({ waName: e.target.value.replace(/[^a-z0-9_]/g, "") })} />
            </Field>
            <Field label="Idioma">
              <input className={INPUT} value={t.waLanguage} onChange={(e) => set({ waLanguage: e.target.value })} placeholder="es_AR" />
            </Field>
          </div>
          {match && (
            <Notice tone={match.status === "APPROVED" && (match.category ?? "").toUpperCase() === "MARKETING" ? "ok" : "danger"}>
              En Meta: {match.status} · categoría {match.category ?? "desconocida"}
              {(match.category ?? "").toUpperCase() !== "MARKETING" && " — para campañas tiene que ser MARKETING."}
              {!match.hasOptOutButton && " · No tiene el botón de baja: sumalo al crearla o dejá el texto «Respondé BAJA»."}
            </Notice>
          )}
          <Field label="Cuerpo (como está en Meta, con {{1}}, {{2}}…)">
            <textarea className={INPUT} rows={6} value={t.body} onChange={(e) => set({ body: e.target.value })} />
          </Field>
          {params.map((p, i) => (
            <Field key={i} label={`Qué va en {{${i + 1}}}`}>
              <input
                className={INPUT}
                value={p}
                onChange={(e) => {
                  const next = [...params];
                  next[i] = e.target.value;
                  set({ params: next });
                }}
                placeholder="{{nombre}}"
              />
            </Field>
          ))}
          <Field label="Cómo se da de baja">
            <div className="flex flex-wrap gap-2">
              <Chip active={t.optOut === "button"} onClick={() => set({ optOut: "button" })}>
                Botón «{WA_OPT_OUT_BUTTON}»
              </Chip>
              <Chip active={t.optOut === "footer"} onClick={() => set({ optOut: "footer" })}>
                Texto «Respondé BAJA»
              </Chip>
            </div>
          </Field>
          {t.optOut === "footer" && !hasOptOutText && <Notice tone="warn">El cuerpo no menciona cómo darse de baja. Agregá: «{WA_OPT_OUT_FOOTER}».</Notice>}
        </div>
        <div className="space-y-3">
          <PreviewContactPicker value={contactId} onChange={setContactId} />
          {preview && (
            <div className="rounded-2xl p-4" style={{ background: "#E7F8EE" }}>
              <div className="rounded-xl p-3 text-sm whitespace-pre-wrap" style={{ background: "white", color: "#111827", boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}>
                {preview.preview}
                {t.optOut === "footer" && !hasOptOutText && <p className="mt-2 text-xs" style={{ color: "#6B7280" }}>{WA_OPT_OUT_FOOTER}</p>}
              </div>
              {t.optOut === "button" && (
                <div className="mt-1 rounded-xl py-2 text-center text-sm" style={{ background: "white", color: "#0284C7", fontWeight: 600 }}>
                  {WA_OPT_OUT_BUTTON}
                </div>
              )}
              {preview.missing.length > 0 && <p className="text-xs mt-2" style={{ color: "#B45309" }}>Sin dato para {preview.missing.join(", ")}: WhatsApp rechaza variables vacías y ese contacto va a fallar.</p>}
            </div>
          )}
          <div className="rounded-2xl border p-4 text-xs space-y-1.5" style={{ borderColor: "#E9E5DE", color: "#4B5563" }}>
            <p style={{ fontWeight: 700, color: "#1A1A1A" }}>Para crearla en Meta (WhatsApp Manager)</p>
            <p>Categoría: MARKETING · Idioma: {t.waLanguage || "es_AR"} · Nombre: {t.waName || "(sin nombre)"}</p>
            <p>Cuerpo: el de la izquierda, con ejemplos para cada variable.</p>
            <p>
              Botón de respuesta rápida: «{WA_OPT_OUT_BUTTON}» (Meta limita el texto del botón a 25 caracteres) o pie: «{WA_OPT_OUT_FOOTER}».
            </p>
            <p>Cuando la aprueben, sincronizá las plantillas desde el Inbox → Canales y elegila arriba.</p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
