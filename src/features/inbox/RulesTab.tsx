import { useState } from "react";
import { OPERATION_LABEL } from "@/lib/format";
import type { Property } from "@/types/db";
import { newId, newRule, RULE_TEMPLATES, DEFAULT_SIGNATURE } from "./automationDefaults";
import { composeText, summarizeHours } from "./automationEngine";
import { CHANNEL_META, SOON_CHANNELS } from "./conversations";
import { TRIGGER_META, type AutomationConfig, type AutomationRule, type OperationFilter, type TriggerType } from "./automationTypes";
import { btnGhost, btnGhostStyle, btnPrimaryStyle, Field, inputCls, INK, LILAC, Pill, Switch } from "./automationUi";
import { TemplateEditor, type EditorEnv } from "./TemplateEditor";
import { validateTemplate } from "./templates";

type Update = (fn: (c: AutomationConfig) => AutomationConfig) => void;

const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function summarizeRule(r: AutomationRule): string {
  const when =
    r.trigger === "first_message"
      ? `Cuando alguien te escribe por primera vez → responder ${r.delayMin === 0 ? "enseguida" : `tras ${r.delayMin} min`}`
      : r.trigger === "off_hours"
        ? "Cuando te escriben fuera de horario → avisar (máx. 1 vez cada 12 h por conversación)"
        : r.trigger === "new_match"
          ? "Cuando hay un nuevo interesado sin mensajes → mandar un saludo"
          : `Si el cliente no contesta en ${r.afterHours} h → enviar 1 recordatorio`;
  const f: string[] = [];
  if (r.filters.operations.length) f.push(r.filters.operations.map((o) => OPERATION_LABEL[o].toLowerCase()).join(" / "));
  if (r.filters.propertyIds.length) f.push(`${r.filters.propertyIds.length} propiedad${r.filters.propertyIds.length > 1 ? "es" : ""}`);
  return f.length ? `${when}. Solo: ${f.join(", ")}.` : `${when}.`;
}

export function RulesTab({
  config,
  update,
  env,
  properties,
  announce,
}: {
  config: AutomationConfig;
  update: Update;
  env: EditorEnv;
  properties: Property[];
  announce: (m: string) => void;
}) {
  const [editing, setEditing] = useState<AutomationRule | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const toggle = (id: string, on: boolean) =>
    update((c) => ({
      ...c,
      rules: c.rules.map((r) => (r.id === id ? { ...r, enabled: on, enabledAt: on ? Date.now() : r.enabledAt } : r)),
    }));

  if (editing) {
    return (
      <RuleEditor
        rule={editing}
        isNew={isNew}
        config={config}
        env={env}
        properties={properties}
        onCancel={() => setEditing(null)}
        onSave={(r) => {
          const saved = { ...r, enabledAt: r.enabled ? (r.enabledAt ?? Date.now()) : r.enabledAt };
          update((c) => ({
            ...c,
            rules: isNew ? [...c.rules, saved] : c.rules.map((x) => (x.id === saved.id ? saved : x)),
          }));
          announce(isNew ? "Regla creada." : "Regla guardada.");
          setEditing(null);
        }}
      />
    );
  }

  const usedTemplates = new Set(config.rules.map((r) => r.name));
  const suggestions = RULE_TEMPLATES.filter((t) => !usedTemplates.has(t.rule.name));

  return (
    <div className="space-y-4">
      <HoursEditor config={config} update={update} />

      <div className="flex flex-wrap gap-2 items-center justify-between">
        <h3 className="text-sm" style={{ color: INK, fontWeight: 800 }}>
          Reglas
        </h3>
        <button
          className="min-h-[44px] px-4 rounded-xl text-sm"
          style={btnPrimaryStyle}
          onClick={() => {
            setIsNew(true);
            setEditing(newRule("first_message", { enabled: true }));
          }}
        >
          Nueva regla
        </button>
      </div>

      {config.rules.length === 0 && (
        <p className="text-sm" style={{ color: "#6B7280" }}>
          Todavía no tenés reglas. Empezá con una plantilla sugerida o creá la tuya.
        </p>
      )}

      <ul className="space-y-2">
        {config.rules.map((r) => (
          <li key={r.id} className="rounded-xl border p-3 space-y-2 bg-white" style={{ borderColor: "#E9E5DE" }}>
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm" style={{ color: INK, fontWeight: 700 }}>
                    {r.name || "Sin nombre"}
                  </p>
                  <Pill tone={r.enabled ? "green" : "gray"}>{r.enabled ? "Activa" : "Pausada"}</Pill>
                  {config.paused && r.enabled && <Pill tone="amber">En pausa general</Pill>}
                </div>
                <p className="text-xs" style={{ color: "#374151" }}>
                  {summarizeRule(r)}
                </p>
                {TRIGGER_META[r.trigger].proactive && (
                  <p className="text-xs" style={{ color: "#92400E", fontWeight: 600 }}>
                    Es un mensaje proactivo: le escribís a alguien que todavía no te escribió.
                  </p>
                )}
              </div>
              <Switch checked={r.enabled} onChange={(v) => toggle(r.id, v)} label={`Regla ${r.name || "sin nombre"}: ${r.enabled ? "activa" : "pausada"}`} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                className={btnGhost}
                style={btnGhostStyle}
                onClick={() => {
                  setIsNew(false);
                  setEditing(structuredClone(r));
                }}
              >
                Editar
              </button>
              <button
                className={btnGhost}
                style={btnGhostStyle}
                onClick={() => {
                  update((c) => ({
                    ...c,
                    rules: [...c.rules, { ...structuredClone(r), id: newId("r"), name: `${r.name} (copia)`, enabled: false, enabledAt: null }],
                  }));
                  announce("Regla duplicada, queda pausada.");
                }}
              >
                Duplicar
              </button>
              {confirmId === r.id ? (
                <>
                  <button
                    className={btnGhost}
                    style={{ ...btnGhostStyle, color: "#BE123C" }}
                    onClick={() => {
                      update((c) => ({ ...c, rules: c.rules.filter((x) => x.id !== r.id) }));
                      setConfirmId(null);
                      announce("Regla borrada.");
                    }}
                  >
                    Sí, borrar
                  </button>
                  <button className={btnGhost} style={btnGhostStyle} onClick={() => setConfirmId(null)}>
                    No
                  </button>
                </>
              ) : (
                <button className={btnGhost} style={{ ...btnGhostStyle, color: "#BE123C" }} onClick={() => setConfirmId(r.id)}>
                  Borrar
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {suggestions.length > 0 && (
        <section aria-label="Plantillas sugeridas" className="space-y-2">
          <h3 className="text-sm" style={{ color: INK, fontWeight: 800 }}>
            Plantillas sugeridas
          </h3>
          <ul className="space-y-2">
            {suggestions.map((t) => (
              <li key={t.id} className="rounded-xl border border-dashed p-3 flex items-center gap-3" style={{ borderColor: "#DDD8CF", background: "#FAF8F5" }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm" style={{ color: INK, fontWeight: 700 }}>
                    {t.title}
                  </p>
                  <p className="text-xs" style={{ color: "#374151" }}>
                    {t.description}
                  </p>
                </div>
                <button
                  className={btnGhost}
                  style={btnGhostStyle}
                  onClick={() => {
                    update((c) => ({
                      ...c,
                      rules: [
                        ...c.rules,
                        newRule(t.rule.trigger, {
                          ...t.rule,
                          enabled: t.defaultEnabled,
                          enabledAt: t.defaultEnabled ? Date.now() : null,
                        }),
                      ],
                    }));
                    announce(t.defaultEnabled ? `${t.title}: agregada y activa.` : `${t.title}: agregada, queda pausada.`);
                  }}
                >
                  {t.defaultEnabled ? "Agregar y activar" : "Agregar (pausada)"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function HoursEditor({ config, update }: { config: AutomationConfig; update: Update }) {
  const setDay = (i: number, patch: Partial<AutomationConfig["hours"]["days"][number]>) =>
    update((c) => ({ ...c, hours: { days: c.hours.days.map((d, k) => (k === i ? { ...d, ...patch } : d)) } }));
  return (
    <details className="rounded-xl border bg-white" style={{ borderColor: "#E9E5DE" }}>
      <summary className="px-3.5 min-h-[44px] flex items-center cursor-pointer text-sm" style={{ color: INK, fontWeight: 700 }}>
        Horario de atención ({summarizeHours(config.hours)})
      </summary>
      <div className="px-3.5 pb-3 space-y-3">
        <p className="text-xs" style={{ color: "#6B7280" }}>
          Hora de Buenos Aires (America/Argentina/Buenos_Aires). Lo usa la regla "Fuera de horario" y la variable{" "}
          <code>{"{{horario}}"}</code>.
        </p>
        <ul className="space-y-1.5">
          {DAY_ORDER.map((i) => {
            const d = config.hours.days[i];
            return (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 min-h-[44px] w-32 text-sm" style={{ color: INK }}>
                  <input type="checkbox" className="w-5 h-5 accent-[#9B21FF]" checked={d.enabled} onChange={(e) => setDay(i, { enabled: e.target.checked })} />
                  {DAYS[i]}
                </label>
                <input type="time" aria-label={`${DAYS[i]}: desde`} disabled={!d.enabled} value={d.from} onChange={(e) => e.target.value && setDay(i, { from: e.target.value })} className={`${inputCls} !w-auto disabled:opacity-50`} />
                <span className="text-xs" style={{ color: "#6B7280" }}>
                  a
                </span>
                <input type="time" aria-label={`${DAYS[i]}: hasta`} disabled={!d.enabled} value={d.to} onChange={(e) => e.target.value && setDay(i, { to: e.target.value })} className={`${inputCls} !w-auto disabled:opacity-50`} />
              </li>
            );
          })}
        </ul>
        <Field label="Texto del horario (opcional)" htmlFor="hours-text" hint={`Lo que reemplaza a {{horario}}. Vacío = "${summarizeHours(config.hours)}".`}>
          <input id="hours-text" className={inputCls} maxLength={200} value={config.hoursText} onChange={(e) => update((c) => ({ ...c, hoursText: e.target.value }))} />
        </Field>
      </div>
    </details>
  );
}

function RuleEditor({
  rule,
  isNew,
  config,
  env,
  properties,
  onCancel,
  onSave,
}: {
  rule: AutomationRule;
  isNew: boolean;
  config: AutomationConfig;
  env: EditorEnv;
  properties: Property[];
  onCancel: () => void;
  onSave: (r: AutomationRule) => void;
}) {
  const [r, setR] = useState(rule);
  const set = (patch: Partial<AutomationRule>) => setR((x) => ({ ...x, ...patch }));
  const tplErrors = validateTemplate(r.template).filter((i) => i.level === "error");
  const sigErrors = r.signature.enabled ? validateTemplate(r.signature.text).filter((i) => i.level === "error") : [];
  const nameOk = r.name.trim().length > 0;
  const valid = nameOk && !tplErrors.length && !sigErrors.length;
  const meta = TRIGGER_META[r.trigger];
  const toggleOp = (o: OperationFilter) =>
    set({
      filters: {
        ...r.filters,
        operations: r.filters.operations.includes(o) ? r.filters.operations.filter((x) => x !== o) : [...r.filters.operations, o],
      },
    });
  const toggleProp = (id: string) =>
    set({
      filters: {
        ...r.filters,
        propertyIds: r.filters.propertyIds.includes(id) ? r.filters.propertyIds.filter((x) => x !== id) : [...r.filters.propertyIds, id],
      },
    });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSave({ ...r, name: r.name.trim() });
      }}
    >
      <h3 className="text-sm" style={{ color: INK, fontWeight: 800 }}>
        {isNew ? "Nueva regla" : "Editar regla"}
      </h3>

      <Field label="Nombre" htmlFor="r-name">
        <input id="r-name" className={inputCls} value={r.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} placeholder="Ej.: Bienvenida" />
      </Field>

      <Field label="Cuándo se dispara" htmlFor="r-trigger" hint={meta.hint}>
        <select id="r-trigger" className={inputCls} value={r.trigger} onChange={(e) => set({ trigger: e.target.value as TriggerType })}>
          {(Object.keys(TRIGGER_META) as TriggerType[]).map((t) => (
            <option key={t} value={t}>
              {TRIGGER_META[t].label}
            </option>
          ))}
        </select>
      </Field>

      {meta.proactive && (
        <p role="note" className="text-xs rounded-xl px-3 py-2" style={{ background: "#FEF3C7", color: "#92400E", fontWeight: 600 }}>
          Atención: es un mensaje proactivo. Le va a escribir a alguien que todavía no te escribió. Usalo con un texto breve y amable.
        </p>
      )}

      {r.trigger === "first_message" && (
        <Field label="Responder después de" htmlFor="r-delay">
          <select id="r-delay" className={inputCls} value={r.delayMin} onChange={(e) => set({ delayMin: Number(e.target.value) })}>
            {[0, 1, 5, 15].map((m) => (
              <option key={m} value={m}>
                {m === 0 ? "Enseguida" : `${m} min`}
              </option>
            ))}
          </select>
        </Field>
      )}
      {r.trigger === "no_reply" && (
        <Field label="Si el cliente no contesta en" htmlFor="r-after" hint="Se manda un solo recordatorio por conversación.">
          <select id="r-after" className={inputCls} value={r.afterHours} onChange={(e) => set({ afterHours: Number(e.target.value) })}>
            {[4, 12, 24, 48, 72].map((h) => (
              <option key={h} value={h}>
                {h} h
              </option>
            ))}
          </select>
        </Field>
      )}
      {r.trigger === "off_hours" && (
        <p className="text-xs" style={{ color: "#374151" }}>
          Horario de atención actual: {summarizeHours(config.hours)}. Se cambia en la solapa Automatizaciones, arriba de la lista.
        </p>
      )}

      <fieldset className="space-y-1.5">
        <legend className="text-xs mb-1.5" style={{ color: INK, fontWeight: 700 }}>
          Canal
        </legend>
        <label className="flex items-center gap-2 min-h-[44px] text-sm" style={{ color: INK }}>
          <input type="radio" checked readOnly className="w-5 h-5 accent-[#9B21FF]" />
          {CHANNEL_META.app.label}
        </label>
        {SOON_CHANNELS.map((ch) => (
          <label key={ch} className="flex items-center gap-2 min-h-[36px] text-sm opacity-60 cursor-not-allowed" style={{ color: "#374151" }}>
            <input type="radio" disabled className="w-5 h-5" />
            {CHANNEL_META[ch].label}
            <span className="text-xs">· Disponible al conectar tu cuenta</span>
          </label>
        ))}
      </fieldset>

      <TemplateEditor
        value={r.template}
        onChange={(template) => set({ template })}
        env={env}
        compose={(ctx) => composeText(r, ctx)}
      />

      <fieldset className="space-y-2">
        <legend className="text-xs mb-1" style={{ color: INK, fontWeight: 700 }}>
          Firma
        </legend>
        <label className="flex items-center gap-2 min-h-[44px] text-sm" style={{ color: INK }}>
          <input type="checkbox" className="w-5 h-5 accent-[#9B21FF]" checked={r.signature.enabled} onChange={(e) => set({ signature: { ...r.signature, enabled: e.target.checked } })} />
          Agregar firma al final
        </label>
        {r.signature.enabled && (
          <input aria-label="Texto de la firma" className={inputCls} maxLength={200} value={r.signature.text} onChange={(e) => set({ signature: { ...r.signature, text: e.target.value } })} />
        )}
        <p className="text-xs" style={{ color: "#6B7280" }}>
          Recomendado: avisa a quien recibe que el mensaje es automático. Por defecto: "{DEFAULT_SIGNATURE}".
        </p>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-xs mb-1" style={{ color: INK, fontWeight: 700 }}>
          Filtros (opcional)
        </legend>
        <p className="text-xs" style={{ color: "#6B7280" }}>
          Sin filtros, la regla aplica a todas las conversaciones.
        </p>
        <div className="flex flex-wrap gap-x-4">
          {(Object.keys(OPERATION_LABEL) as OperationFilter[]).map((o) => (
            <label key={o} className="flex items-center gap-2 min-h-[44px] text-sm" style={{ color: INK }}>
              <input type="checkbox" className="w-5 h-5 accent-[#9B21FF]" checked={r.filters.operations.includes(o)} onChange={() => toggleOp(o)} />
              {OPERATION_LABEL[o]}
            </label>
          ))}
        </div>
        {properties.length > 0 && (
          <details className="rounded-xl border" style={{ borderColor: "#E9E5DE" }}>
            <summary className="px-3 min-h-[44px] flex items-center cursor-pointer text-sm" style={{ color: LILAC, fontWeight: 600 }}>
              Solo ciertas propiedades ({r.filters.propertyIds.length || "todas"})
            </summary>
            <ul className="max-h-48 overflow-y-auto px-3 pb-2">
              {properties.map((p) => (
                <li key={p.id}>
                  <label className="flex items-center gap-2 min-h-[44px] md:min-h-[32px] text-sm" style={{ color: INK }}>
                    <input type="checkbox" className="w-5 h-5 accent-[#9B21FF]" checked={r.filters.propertyIds.includes(p.id)} onChange={() => toggleProp(p.id)} />
                    <span className="truncate">{p.title}</span>
                  </label>
                </li>
              ))}
            </ul>
          </details>
        )}
      </fieldset>

      <div className="flex items-center gap-2">
        <Switch checked={r.enabled} onChange={(v) => set({ enabled: v, enabledAt: v ? Date.now() : r.enabledAt })} label="Regla activa" />
        <span className="text-sm" style={{ color: INK, fontWeight: 600 }}>
          {r.enabled ? "Activa" : "Pausada"}
        </span>
      </div>
      {r.enabled && (
        <p className="text-xs" style={{ color: "#6B7280" }}>
          Solo responde a mensajes que lleguen desde que la activás.
        </p>
      )}

      <div className="flex gap-2 justify-end sticky bottom-0 py-2 bg-white">
        <button type="button" className={btnGhost} style={btnGhostStyle} onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" disabled={!valid} className="min-h-[44px] px-5 rounded-xl text-sm disabled:opacity-50" style={btnPrimaryStyle}>
          Guardar
        </button>
      </div>
      {!nameOk && (
        <p className="text-xs text-right" style={{ color: "#BE123C", fontWeight: 600 }}>
          Poné un nombre para guardar.
        </p>
      )}
    </form>
  );
}
