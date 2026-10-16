/**
 * «Conectar Argenprop»: formulario guiado para pegar las credenciales de
 * integración que Argenprop le manda a la inmobiliaria por mail. Se guardan
 * cifradas en el servidor (como los tokens OAuth) y nunca vuelven al
 * navegador. No se verifican contra Argenprop: no hay un endpoint público
 * documentado para eso (ver docs/integraciones-multitenant.md).
 */
import { useId, useState } from "react";
import { integrationsApi } from "./api";

const INK = "#1A1A1A";
const MUTED = "#6B7280";

export function ArgenpropCredentialsForm({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void | Promise<void> }) {
  const id = useId();
  const [values, setValues] = useState({ user: "", password: "", sellerId: "", originId: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field?: string; text: string } | null>(null);
  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await integrationsApi.saveCredentials("argenprop", values);
    setBusy(false);
    if (!r.ok) return setError({ field: r.field, text: r.message });
    setValues({ user: "", password: "", sellerId: "", originId: "" });
    await onSaved();
  };

  const input = "w-full min-h-[44px] px-3 rounded-xl border text-sm bg-white";
  const field = (k: keyof typeof values, label: string, help: string, type = "text", required = true) => (
    <label className="text-xs block" style={{ color: MUTED, fontWeight: 600 }} htmlFor={`${id}-${k}`}>
      {label}
      <input
        id={`${id}-${k}`}
        type={type}
        required={required}
        autoComplete="off"
        value={values[k]}
        onChange={set(k)}
        aria-invalid={error?.field === k}
        className={input}
        style={{ borderColor: error?.field === k ? "#FDA4AF" : "#DDD8CF", color: INK }}
      />
      <span className="block mt-1" style={{ fontWeight: 400 }}>{help}</span>
    </label>
  );

  return (
    <form onSubmit={submit} className="mt-4 rounded-xl border p-4 flex flex-col gap-3" style={{ borderColor: "#DDD8CF", background: "#FAF8F5" }}>
      <p className="text-sm" style={{ color: INK, fontWeight: 700 }}>Conectar Argenprop</p>
      <ol className="text-xs list-decimal pl-5 space-y-1" style={{ color: "#374151" }}>
        <li>Buscá el mail de Argenprop con los datos de la integración con PropMatch.</li>
        <li>Copiá cada dato en su casillero. Son distintos de tu usuario y contraseña de Argenprop.</li>
        <li>Tocá «Guardar». Quedan guardados de forma segura: ni vos ni tu equipo los van a poder volver a ver.</li>
      </ol>
      {field("user", "Usuario de integración", "Termina en «@api.com».", "email")}
      {field("password", "Contraseña de integración", "La que vino en el mismo mail.", "password")}
      {field("sellerId", "Número de vendedor (IdVendedor o IdAnunciante)", "Son solo números.")}
      {field("originId", "IdOrigen (opcional)", "Si Argenprop no te lo dio, dejalo vacío.", "text", false)}
      {error && <p role="alert" className="text-xs" style={{ color: "#BE123C" }}>{error.text}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="flex-1 min-h-[44px] px-4 rounded-xl text-sm text-white disabled:opacity-60" style={{ background: "#9B21FF", fontWeight: 700 }}>
          {busy ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" onClick={onCancel} className="min-h-[44px] px-4 rounded-xl text-sm border bg-white" style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 700 }}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
