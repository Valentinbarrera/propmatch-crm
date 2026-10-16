import { useState } from "react";
import { newId } from "./automationDefaults";
import { restoreFactorySnippets } from "./automationState";
import type { AutomationConfig, Snippet } from "./automationTypes";
import { btnGhost, btnGhostStyle, btnPrimaryStyle, Field, inputCls, INK, Pill } from "./automationUi";
import { TemplateEditor, type EditorEnv } from "./TemplateEditor";
import { renderTemplate, validateTemplate } from "./templates";

type Update = (fn: (c: AutomationConfig) => AutomationConfig) => void;

export function SnippetsTab({
  config,
  update,
  env,
  announce,
}: {
  config: AutomationConfig;
  update: Update;
  env: EditorEnv;
  announce: (m: string) => void;
}) {
  const [editing, setEditing] = useState<Snippet | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const move = (i: number, d: -1 | 1) =>
    update((c) => {
      const list = [...c.snippets];
      const j = i + d;
      if (j < 0 || j >= list.length) return c;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...c, snippets: list };
    });

  const canRestore = config.snippets.length < 99 && restoreFactorySnippets(config).snippets.length > config.snippets.length;

  if (editing) {
    const errors = validateTemplate(editing.text).filter((i) => i.level === "error");
    const titleOk = editing.title.trim().length > 0;
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (errors.length || !titleOk) return;
          update((c) => ({
            ...c,
            snippets: isNew
              ? [...c.snippets, { ...editing, title: editing.title.trim() }]
              : c.snippets.map((s) => (s.id === editing.id ? { ...editing, title: editing.title.trim() } : s)),
          }));
          announce(isNew ? "Respuesta rápida creada." : "Respuesta rápida guardada.");
          setEditing(null);
        }}
      >
        <h3 className="text-sm" style={{ color: INK, fontWeight: 800 }}>
          {isNew ? "Nueva respuesta rápida" : "Editar respuesta rápida"}
        </h3>
        <Field label="Título" htmlFor="sn-title">
          <input
            id="sn-title"
            className={inputCls}
            value={editing.title}
            maxLength={60}
            onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            placeholder="Ej.: Confirmar visita"
          />
        </Field>
        <TemplateEditor
          value={editing.text}
          onChange={(text) => setEditing({ ...editing, text })}
          env={env}
          compose={(ctx) => renderTemplate(editing.text, ctx)}
        />
        <div className="flex gap-2 justify-end">
          <button type="button" className={btnGhost} style={btnGhostStyle} onClick={() => setEditing(null)}>
            Cancelar
          </button>
          <button
            type="submit"
            disabled={errors.length > 0 || !titleOk}
            className="min-h-[44px] px-5 rounded-xl text-sm disabled:opacity-50"
            style={btnPrimaryStyle}
          >
            Guardar
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: "#374151" }}>
        Aparecen como botones arriba del cuadro de mensaje. Al tocarlas, el texto se arma con los datos de la conversación y
        lo revisás antes de enviar.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          className="min-h-[44px] px-4 rounded-xl text-sm"
          style={btnPrimaryStyle}
          onClick={() => {
            setIsNew(true);
            setEditing({ id: newId("s"), title: "", text: "" });
          }}
        >
          Nueva respuesta
        </button>
        {canRestore && (
          <button
            className={btnGhost}
            style={btnGhostStyle}
            onClick={() => {
              update(restoreFactorySnippets);
              announce("Respuestas de fábrica restauradas.");
            }}
          >
            Restaurar las de fábrica
          </button>
        )}
      </div>
      {config.snippets.length === 0 && (
        <p className="text-sm py-6 text-center" style={{ color: "#6B7280" }}>
          No tenés respuestas rápidas. Creá una o restaurá las de fábrica.
        </p>
      )}
      <ul className="space-y-2">
        {config.snippets.map((s, i) => (
          <li key={s.id} className="rounded-xl border p-3 space-y-2 bg-white" style={{ borderColor: "#E9E5DE" }}>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm flex-1 min-w-0 truncate" style={{ color: INK, fontWeight: 700 }}>
                {s.title}
              </p>
              {s.factoryId && <Pill tone="gray">De fábrica</Pill>}
            </div>
            <p className="text-xs whitespace-pre-wrap break-words line-clamp-3" style={{ color: "#374151" }}>
              {s.text}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button className={btnGhost} style={btnGhostStyle} aria-label={`Subir ${s.title}`} disabled={i === 0} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button
                className={btnGhost}
                style={btnGhostStyle}
                aria-label={`Bajar ${s.title}`}
                disabled={i === config.snippets.length - 1}
                onClick={() => move(i, 1)}
              >
                ↓
              </button>
              <button
                className={btnGhost}
                style={btnGhostStyle}
                onClick={() => {
                  setIsNew(false);
                  setEditing({ ...s });
                }}
              >
                Editar
              </button>
              {confirmId === s.id ? (
                <>
                  <button
                    className={btnGhost}
                    style={{ ...btnGhostStyle, color: "#BE123C" }}
                    onClick={() => {
                      update((c) => ({ ...c, snippets: c.snippets.filter((x) => x.id !== s.id) }));
                      setConfirmId(null);
                      announce("Respuesta rápida borrada.");
                    }}
                  >
                    Sí, borrar
                  </button>
                  <button className={btnGhost} style={btnGhostStyle} onClick={() => setConfirmId(null)}>
                    No
                  </button>
                </>
              ) : (
                <button className={btnGhost} style={{ ...btnGhostStyle, color: "#BE123C" }} onClick={() => setConfirmId(s.id)}>
                  Borrar
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
