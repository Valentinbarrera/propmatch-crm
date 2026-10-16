import { useId, useMemo, useRef, useState } from "react";
import type { Conversation } from "./conversations";
import { buildTemplateContext, sampleContext, validateTemplate, VARIABLES, type TemplateContext, type TemplateEnv } from "./templates";
import { btnGhostStyle, INK, LILAC } from "./automationUi";

export interface EditorEnv extends TemplateEnv {
  conversations: Conversation[];
}

const MAX = 1000;

/**
 * Textarea con chips de variables (insertan en el cursor), validación y vista
 * previa en vivo. `compose` arma el texto final (con firma, si aplica).
 */
export function TemplateEditor({
  value,
  onChange,
  env,
  compose,
  label = "Mensaje",
}: {
  value: string;
  onChange: (v: string) => void;
  env: EditorEnv;
  compose: (ctx: TemplateContext) => string;
  label?: string;
}) {
  const id = useId();
  const area = useRef<HTMLTextAreaElement>(null);
  const [previewId, setPreviewId] = useState("");

  const issues = useMemo(() => validateTemplate(value), [value]);
  const conv = env.conversations.find((c) => c.matchId === previewId);
  const ctx = conv ? buildTemplateContext(conv, env) : sampleContext(env);
  const preview = compose(ctx);

  function insert(name: string) {
    const el = area.current;
    const token = `{{${name}}}`;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor={id} className="block text-xs" style={{ color: INK, fontWeight: 700 }}>
          {label}
        </label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Insertar variable">
          {VARIABLES.map((v) => (
            <button
              key={v.name}
              type="button"
              title={v.help}
              onClick={() => insert(v.name)}
              className="min-h-[44px] md:min-h-[32px] px-2.5 rounded-full text-xs border hover:border-violet-300"
              style={{ ...btnGhostStyle, background: "#FAF8F5", borderColor: "#DDD8CF" }}
            >
              {`{{${v.name}}}`}
            </button>
          ))}
        </div>
        <textarea
          id={id}
          ref={area}
          rows={5}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={`${id}-count ${id}-issues`}
          className="w-full px-3.5 py-2.5 rounded-xl text-sm border outline-none resize-y bg-white text-[#1A1A1A] border-[#E9E5DE] focus:border-[#9B21FF] focus-visible:ring-2 focus-visible:ring-[#9B21FF]/30 min-h-[110px]"
        />
        <div className="flex items-start justify-between gap-3">
          <ul id={`${id}-issues`} className="text-xs space-y-0.5" aria-live="polite">
            {issues.map((i) => (
              <li key={i.message} role={i.level === "error" ? "alert" : undefined} style={{ color: i.level === "error" ? "#BE123C" : "#92400E", fontWeight: 600 }}>
                {i.message}
              </li>
            ))}
          </ul>
          <span id={`${id}-count`} className="text-xs flex-shrink-0" style={{ color: value.length > MAX ? "#BE123C" : LILAC, fontWeight: 600 }}>
            {value.length}/{MAX}
          </span>
        </div>
      </div>

      <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: "#E9E5DE", background: "#FAF8F5" }}>
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <p className="text-xs" style={{ color: INK, fontWeight: 700 }}>
            Vista previa
          </p>
          <label className="flex items-center gap-2 text-xs" style={{ color: "#6B7280" }}>
            Previsualizar con…
            <select
              value={previewId}
              onChange={(e) => setPreviewId(e.target.value)}
              className="min-h-[44px] md:min-h-[32px] px-2 rounded-lg border bg-white text-xs max-w-[180px]"
              style={{ borderColor: "#E9E5DE", color: INK }}
            >
              <option value="">Datos de ejemplo</option>
              {env.conversations.slice(0, 40).map((c) => (
                <option key={c.matchId} value={c.matchId}>
                  {c.name}
                  {c.property ? ` · ${c.property.title}` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-[11px]" style={{ color: LILAC, fontWeight: 700 }}>
          {conv ? `Conversación real: ${conv.name}` : "Ejemplo"} · así lo verá quien lo reciba
        </p>
        <div className="flex justify-end" aria-live="polite">
          <div className="max-w-[90%] rounded-2xl px-3.5 py-2" style={{ background: "#9B21FF", color: "white", borderBottomRightRadius: 6 }}>
            {preview ? (
              <p className="text-sm whitespace-pre-wrap break-words">{preview}</p>
            ) : (
              <p className="text-sm italic" style={{ color: "rgba(255,255,255,0.8)" }}>
                El mensaje quedaría vacío.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
