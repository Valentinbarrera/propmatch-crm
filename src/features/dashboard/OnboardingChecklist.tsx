import { useState } from "react";
import { useNavigate } from "react-router-dom";

const STORAGE_KEY = "pm_onboarding_skipped";

interface Step {
  id: string;
  label: string;
  action: string;
  path: string;
  done: boolean;
}

interface Props {
  hasProperties: boolean;
  hasContacts: boolean;
  hasMeli: boolean;
  hasAppPublications: boolean;
}

export function OnboardingChecklist({ hasProperties, hasContacts, hasMeli, hasAppPublications }: Props) {
  const navigate = useNavigate();
  const [skipped, setSkipped] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
  });

  if (skipped) return null;

  const steps: Step[] = [
    { id: "property", label: "Cargá tu primera propiedad", action: "Empezar", path: "/propiedades/nueva", done: hasProperties },
    { id: "contact",  label: "Registrá tu primer contacto",  action: "Empezar", path: "/contactos",        done: hasContacts },
    { id: "meli",     label: "Conectá MercadoLibre",         action: "Conectar", path: "/configuracion",   done: hasMeli },
    { id: "app",      label: "Publicá en la app PropMatch",  action: "Publicar", path: "/propiedades",     done: hasAppPublications },
  ];

  const allDone = steps.every((s) => s.done);
  if (allDone) return null;

  function skip() {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* noop */ }
    setSkipped(true);
  }

  return (
    <div
      className="mt-6 md:mt-8 rounded-2xl overflow-hidden pm-enter"
      style={{ border: "1px solid #E9E5DE", background: "white", boxShadow: "var(--shadow-card)" }}
    >
      <div
        className="px-5 py-4 flex items-center justify-between"
        style={{ background: "var(--gradient-soft)", borderBottom: "1px solid #E9E5DE" }}
      >
        <div>
          <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
            Bienvenido a PropMatch CRM
          </p>
          <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
            Completá estos pasos para empezar a trabajar con tu inmobiliaria.
          </p>
        </div>
        <span
          className="text-xs px-2 py-1 rounded-lg"
          style={{ background: "#F7F0FF", color: "#9B21FF", fontWeight: 600 }}
        >
          {steps.filter((s) => s.done).length}/{steps.length}
        </span>
      </div>

      <div className="divide-y" style={{ borderColor: "#FAF8F5" }}>
        {steps.map((step) => (
          <div key={step.id} className="flex items-center gap-4 px-5 py-3.5">
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                background: step.done ? "var(--gradient-brand)" : "white",
                border: step.done ? "none" : "2px solid #DDD8CF",
              }}
            >
              {step.done && (
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <p
              className="flex-1 text-sm"
              style={{ color: step.done ? "#9CA3AF" : "#1A1A1A", fontWeight: step.done ? 400 : 500, textDecoration: step.done ? "line-through" : "none" }}
            >
              {step.label}
            </p>
            {!step.done && (
              <button
                onClick={() => navigate(step.path)}
                className="text-xs px-3 py-1.5 rounded-lg transition-all hover:opacity-80 flex-shrink-0"
                style={{ background: "var(--gradient-brand)", color: "white", fontWeight: 600 }}
              >
                {step.action} →
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="px-5 py-3 flex justify-end" style={{ borderTop: "1px solid #FAF8F5" }}>
        <button
          onClick={skip}
          className="text-xs transition-all hover:opacity-70"
          style={{ color: "#BF7FFF" }}
        >
          Saltear por ahora
        </button>
      </div>
    </div>
  );
}
