import { clearSentLog } from "./automationState";
import { MAX_ATTEMPTS } from "./automationEngine";
import type { SentEntry } from "./automationTypes";
import { btnGhost, btnGhostStyle, INK, Pill } from "./automationUi";

export function ActivityTab({ log, agencyId }: { log: SentEntry[]; agencyId: string }) {
  const rows = [...log].sort((a, b) => b.at - a.at).slice(0, 50);
  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: "#374151" }}>
        Últimos envíos automáticos hechos desde este navegador.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm py-8 text-center" style={{ color: "#6B7280" }}>
          Todavía no se envió ningún mensaje automático.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((e) => (
            <li key={e.key} className="rounded-xl border p-3 space-y-1 bg-white" style={{ borderColor: "#E9E5DE" }}>
              <div className="flex items-center gap-2 flex-wrap">
                <Pill tone={e.status === "ok" ? "green" : e.status === "error" ? "red" : "amber"}>
                  {e.status === "ok" ? "Enviado" : e.status === "error" ? "Error" : "Enviando"}
                </Pill>
                <p className="text-sm flex-1 min-w-0 truncate" style={{ color: INK, fontWeight: 700 }}>
                  {e.ruleName}
                </p>
                <time className="text-xs" style={{ color: "#6B7280" }} dateTime={new Date(e.at).toISOString()}>
                  {new Date(e.at).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </time>
              </div>
              <p className="text-xs" style={{ color: "#374151" }}>
                Conversación: {e.conversationName}
              </p>
              {e.status === "error" && (
                <p className="text-xs" style={{ color: "#BE123C", fontWeight: 600 }}>
                  {e.error}
                  {e.attempts >= MAX_ATTEMPTS ? " · Se dejó de reintentar." : ` · Reintento ${e.attempts}/${MAX_ATTEMPTS} más adelante.`}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {rows.length > 0 && (
        <button className={btnGhost} style={btnGhostStyle} onClick={() => clearSentLog(agencyId)}>
          Vaciar historial
        </button>
      )}
      <p className="text-xs" style={{ color: "#6B7280" }}>
        Vaciar el historial también libera a las reglas para volver a responder esas conversaciones.
      </p>
    </div>
  );
}
