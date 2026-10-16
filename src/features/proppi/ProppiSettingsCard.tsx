import { useState } from "react";
import { Card, SectionHeader } from "@/components/ui/Card";
import { useStore } from "@/data/store";
import { ProppiIcon } from "./ProppiIcon";
import { useProppiSettings, type ProppiSettings } from "./settings";
import { useProppiAvailable } from "./useProppi";

/** Configuración → Proppi. Se guarda por inmobiliaria en este navegador. */
export function ProppiSettingsCard({ onSaved }: { onSaved: (msg: string) => void }) {
  const { agency, profile } = useStore();
  const available = useProppiAvailable();
  const { settings, save, used } = useProppiSettings(agency.id);
  const canEdit = profile.role === "owner" || profile.role === "admin";
  const [form, setForm] = useState<ProppiSettings>(settings);
  const dirty = JSON.stringify(form) !== JSON.stringify(settings);
  const set = <K extends keyof ProppiSettings>(k: K, v: ProppiSettings[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Card className="lg:col-span-2">
      <SectionHeader
        inCard
        title="Proppi, el asistente"
        subtitle={canEdit ? "Cómo responde y qué sabe de tu inmobiliaria" : "Solo el dueño o un administrador puede cambiarlo"}
      />
      <div className="p-5 grid gap-5 md:grid-cols-2">
        <div className="space-y-3">
          {!available && (
            <p className="text-xs rounded-xl px-3 py-2" style={{ background: "#F7F0FF", color: "#7C0BD8", fontWeight: 600 }}>
              Proppi está disponible con tu cuenta de inmobiliaria conectada. En la demo podés ver la configuración, pero no consultar.
            </p>
          )}
          <Toggle label="Proppi activado" checked={form.enabled} disabled={!canEdit} onChange={(v) => set("enabled", v)} />
          <Toggle
            label="Panel de chat en todo el CRM"
            checked={form.panelEnabled}
            disabled={!canEdit || !form.enabled}
            onChange={(v) => set("panelEnabled", v)}
          />
          <Toggle
            label="Respuestas sugeridas en el Inbox"
            checked={form.inboxEnabled}
            disabled={!canEdit || !form.enabled}
            onChange={(v) => set("inboxEnabled", v)}
          />
          <Toggle label="Respuesta automática fuera de horario" checked={false} disabled onChange={() => undefined} badge="Próximamente" />

          <fieldset className="pt-2">
            <legend className="text-xs mb-1.5" style={{ color: "#6B7280", fontWeight: 600 }}>
              Tono de los borradores para clientes
            </legend>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["cercano", "Cercano, con voseo"],
                  ["formal", "Formal, de usted"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className="flex items-center gap-2 min-h-[40px] px-3 rounded-xl border text-sm cursor-pointer"
                  style={{
                    borderColor: form.tone === value ? "#9B21FF" : "#E9E5DE",
                    background: form.tone === value ? "#F7F0FF" : "white",
                    color: "#1A1A1A",
                    fontWeight: 600,
                  }}
                >
                  <input
                    type="radio"
                    name="proppi-tone"
                    value={value}
                    checked={form.tone === value}
                    disabled={!canEdit}
                    onChange={() => set("tone", value)}
                    className="accent-[#9B21FF]"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="block text-xs mb-1.5" style={{ color: "#6B7280", fontWeight: 600 }}>
              Firma de los borradores
            </span>
            <textarea
              rows={2}
              maxLength={300}
              value={form.signature}
              disabled={!canEdit}
              onChange={(e) => set("signature", e.target.value)}
              placeholder={`Ej.: Saludos, el equipo de ${agency.name}`}
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="block text-xs mb-1.5" style={{ color: "#6B7280", fontWeight: 600 }}>
              Tope de consultas por mes (0 = sin tope)
            </span>
            <input
              type="number"
              min={0}
              step={10}
              value={form.monthlyLimit}
              disabled={!canEdit}
              onChange={(e) => set("monthlyLimit", Math.max(0, Math.round(Number(e.target.value) || 0)))}
              className={`${inputClass} max-w-[160px]`}
            />
            <span className="block text-xs mt-1" style={{ color: "#6B7280" }}>
              Este mes, en este navegador: {used} {used === 1 ? "consulta" : "consultas"}.
            </span>
          </label>
        </div>

        <div className="flex flex-col">
          <label className="block flex-1">
            <span className="block text-xs mb-1.5" style={{ color: "#6B7280", fontWeight: 600 }}>
              Conocimiento de la inmobiliaria
            </span>
            <textarea
              rows={12}
              maxLength={6000}
              value={form.knowledge}
              disabled={!canEdit}
              onChange={(e) => set("knowledge", e.target.value)}
              placeholder={
                "Horarios de atención, zonas en las que trabajan, comisiones, requisitos para alquilar (garantías, recibos), " +
                "cómo se coordinan las visitas, preguntas frecuentes…"
              }
              className={`${inputClass} h-full min-h-[220px]`}
            />
            <span className="block text-xs mt-1" style={{ color: "#6B7280" }}>
              Proppi lo usa para responder y para los borradores. {form.knowledge.length}/6000
            </span>
          </label>
          <div className="mt-4 flex gap-3 rounded-xl px-3.5 py-3" style={{ background: "#FAF8F5", border: "1px solid #E9E5DE" }}>
            <ProppiIcon size={20} color="#9B21FF" />
            <p className="text-xs" style={{ color: "#374151" }}>
              <strong style={{ fontWeight: 700 }}>Privacidad:</strong> lo que Proppi lee se envía a Anthropic para generar la
              respuesta. Proppi solo lee: no manda mensajes ni cambia datos, y los borradores siempre los revisás vos.
            </p>
          </div>
        </div>
      </div>
      {canEdit && (
        <div className="px-5 py-3.5 border-t flex items-center justify-end gap-3" style={{ borderColor: "#F0EDE6", background: "#FAF8F5" }}>
          <button
            onClick={() => {
              save(form);
              onSaved("Configuración de Proppi guardada");
            }}
            disabled={!dirty}
            className="px-5 py-2 rounded-xl text-sm text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "var(--gradient-brand)", fontWeight: 600 }}
          >
            Guardar
          </button>
        </div>
      )}
    </Card>
  );
}

function Toggle({
  label,
  checked,
  disabled,
  onChange,
  badge,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  badge?: string;
}) {
  return (
    <label className={`flex items-center justify-between gap-3 min-h-[40px] ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
      <span className="text-sm flex items-center gap-2" style={{ color: disabled ? "#6B7280" : "#1A1A1A", fontWeight: 600 }}>
        {label}
        {badge && (
          <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "#F7F0FF", color: "#7C0BD8", fontWeight: 700 }}>
            {badge}
          </span>
        )}
      </span>
      <span className="relative inline-flex flex-shrink-0">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="w-10 h-6 rounded-full transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#9B21FF] peer-disabled:opacity-50"
          style={{ background: checked ? "#9B21FF" : "#DDD8CF" }}
        />
        <span
          aria-hidden="true"
          className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform"
          style={{ transform: checked ? "translateX(16px)" : undefined, boxShadow: "0 1px 2px rgba(8, 11, 31,0.2)" }}
        />
      </span>
    </label>
  );
}

const inputClass =
  "w-full px-4 py-2.5 rounded-xl text-sm border outline-none transition-all bg-white resize-y " +
  "text-[#1A1A1A] placeholder:text-[#6B7280] border-[#E9E5DE] focus:border-[#9B21FF] focus:ring-4 focus:ring-[#E9E5DE] " +
  "disabled:bg-[#FAF8F5] disabled:text-[#6B7280] disabled:cursor-not-allowed";
