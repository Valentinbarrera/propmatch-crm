import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Al volver del email de "restablecer contraseña", Supabase abre una sesión de
 * recuperación (`#...&type=recovery` en la URL y el evento PASSWORD_RECOVERY).
 * La URL se lee al cargar el módulo, antes de que supabase-js la limpie.
 */
const openedFromRecoveryLink =
  typeof window !== "undefined" && /(^|[#&])type=recovery(&|$)/.test(window.location.hash);

export function PasswordRecovery() {
  const [open, setOpen] = useState(openedFromRecoveryLink);
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setOpen(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!open) return null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Tiene que tener al menos 8 caracteres.");
      return;
    }
    setState("saving");
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setState("error");
      setError(
        /session|expired|jwt/i.test(err.message)
          ? "El link venció. Pedí uno nuevo desde «¿Olvidaste tu contraseña?»."
          : "No se pudo guardar la contraseña. Probá con otra o pedí un link nuevo.",
      );
      return;
    }
    setState("done");
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: "rgba(8, 11, 31,0.45)" }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-title"
        className="w-full max-w-sm rounded-2xl bg-white p-6"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <h2 id="recovery-title" className="text-lg" style={{ color: "#1A1A1A", fontWeight: 800 }}>
          {state === "done" ? "Contraseña actualizada" : "Elegí tu contraseña nueva"}
        </h2>
        {state === "done" ? (
          <>
            <p className="text-sm mt-2" style={{ color: "#374151" }}>
              Listo. La próxima vez entrá con tu email y esta contraseña.
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-5 w-full min-h-11 rounded-xl text-sm text-white"
              style={{ background: "var(--gradient-brand)", fontWeight: 700 }}
            >
              Continuar
            </button>
          </>
        ) : (
          <form onSubmit={save} className="mt-4 space-y-3">
            <label className="block text-xs" style={{ color: "#6B7280", fontWeight: 700 }} htmlFor="recovery-password">
              Contraseña nueva
            </label>
            <input
              id="recovery-password"
              type="password"
              autoComplete="new-password"
              autoFocus
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              className="w-full min-h-11 px-3 rounded-xl text-sm border outline-none focus-visible:ring-4 focus-visible:ring-[#E9E5DE]"
              style={{ borderColor: "#DDD8CF" }}
            />
            {error && (
              <p role="alert" className="text-xs" style={{ color: "#E11D48" }}>
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={state === "saving"}
              className="w-full min-h-11 rounded-xl text-sm text-white disabled:opacity-60"
              style={{ background: "var(--gradient-brand)", fontWeight: 700 }}
            >
              {state === "saving" ? "Guardando…" : "Guardar contraseña"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
