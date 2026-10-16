import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Property } from "@/types/db";
import { ActivityTab } from "./ActivityTab";
import { summarizeHours } from "./automationEngine";
import { updateConfig, useAutomationState } from "./automationState";
import { INK, LILAC, LINE, Switch } from "./automationUi";
import type { Conversation } from "./conversations";
import { RulesTab } from "./RulesTab";
import { SnippetsTab } from "./SnippetsTab";

type TabId = "rapidas" | "reglas" | "actividad";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';

export function AutomationsDrawer({
  open,
  onClose,
  agencyId,
  agencyName,
  agentName,
  conversations,
  properties,
}: {
  open: boolean;
  onClose: () => void;
  agencyId: string;
  agencyName: string;
  agentName: string;
  conversations: Conversation[];
  properties: Property[];
}) {
  const { config, log, persisted } = useAutomationState(agencyId);
  const [tab, setTab] = useState<TabId>("reglas");
  const [msg, setMsg] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  // Foco: entra al abrir y vuelve al botón que lo abrió al cerrar.
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    panel.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const update = (fn: Parameters<typeof updateConfig>[1]) => updateConfig(agencyId, fn);
  const env = {
    agencyName,
    agentName,
    horario: config.hoursText.trim() || summarizeHours(config.hours),
    conversations,
  };

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: "reglas", label: "Automatizaciones" },
    { id: "rapidas", label: "Respuestas rápidas" },
    { id: "actividad", label: "Actividad" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 bg-[#1A1A1A]/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auto-title"
        className="relative bg-white w-full md:w-[600px] md:max-w-[92vw] h-full flex flex-col shadow-2xl"
      >
        <header className="flex items-center gap-3 px-4 py-3 border-b flex-shrink-0" style={{ borderColor: LINE }}>
          <h2 id="auto-title" className="flex-1 text-base" style={{ color: INK, fontWeight: 800 }}>
            Mensajes y automatizaciones
          </h2>
          <button
            data-autofocus
            onClick={onClose}
            aria-label="Cerrar"
            className="w-11 h-11 rounded-xl flex items-center justify-center text-lg border hover:border-violet-300"
            style={{ borderColor: LINE, color: "#7C0BD8" }}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </header>

        <div className="px-4 py-3 border-b space-y-2 flex-shrink-0" style={{ borderColor: LINE, background: "#FAF8F5" }}>
          <div className="flex items-center gap-2">
            <Switch checked={config.paused} onChange={(v) => update((c) => ({ ...c, paused: v }))} label="Pausar todas las automatizaciones" />
            <div className="min-w-0">
              <p className="text-sm" style={{ color: INK, fontWeight: 700 }}>
                Pausar todas las automatizaciones
              </p>
              <p className="text-xs" style={{ color: config.paused ? "#92400E" : LILAC, fontWeight: 600 }}>
                {config.paused ? "En pausa: no se envía nada automático." : "Funcionando mientras el Inbox esté abierto."}
              </p>
            </div>
          </div>
          <p className="text-xs" style={{ color: "#374151" }}>
            Las automatizaciones se envían mientras alguien de tu equipo tenga PropMatch abierto. El envío 24/7 requiere
            activar el servidor (próximamente).
          </p>
          <p className="text-xs" style={{ color: "#6B7280" }}>
            {persisted
              ? "Por ahora las reglas se guardan en este navegador."
              : "Este navegador no permite guardar: los cambios se pierden al recargar."}
          </p>
        </div>

        <div role="tablist" aria-label="Secciones" className="flex gap-1 px-4 pt-2 border-b flex-shrink-0 overflow-x-auto" style={{ borderColor: LINE }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              id={`auto-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`auto-panel-${t.id}`}
              onClick={() => setTab(t.id)}
              className="min-h-[44px] px-3.5 text-sm whitespace-nowrap border-b-2 -mb-px"
              style={{ borderColor: tab === t.id ? "#9B21FF" : "transparent", color: tab === t.id ? "#7C0BD8" : "#6B7280", fontWeight: 700 }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id={`auto-panel-${tab}`}
          aria-labelledby={`auto-tab-${tab}`}
          className="flex-1 min-h-0 overflow-y-auto px-4 py-4"
        >
          {tab === "reglas" && <RulesTab config={config} update={update} env={env} properties={properties} announce={setMsg} />}
          {tab === "rapidas" && <SnippetsTab config={config} update={update} env={env} announce={setMsg} />}
          {tab === "actividad" && <ActivityTab log={log} agencyId={agencyId} />}
        </div>

        <p role="status" aria-live="polite" className="px-4 py-2 text-xs border-t min-h-[32px] flex-shrink-0" style={{ borderColor: LINE, color: "#166534", fontWeight: 600 }}>
          {msg}
        </p>
      </div>
    </div>
  );
}
