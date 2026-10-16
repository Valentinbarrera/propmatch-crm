import { useEffect, useState } from "react";
import { Card, SectionHeader } from "@/components/ui/Card";
import { useStore } from "@/data/store";
import { supabase } from "@/lib/supabase";
import {
  MIN_PASSWORD_LENGTH,
  emailChangeErrorMessage,
  passwordChangeOutcome,
  validateEmailChange,
  validatePasswordChange,
} from "@/lib/accountAuth";
import { Field, inputClass } from "./fields";

/**
 * Mi cuenta: el email y la contraseña con los que se entra (Supabase Auth).
 *
 * Distinto de "Mi perfil", que es local: acá los cambios van a la cuenta real.
 * El email nuevo se aplica recién al confirmar el link del mail; la vuelta la
 * maneja `EmailChangeNotice` (avisa y actualiza el perfil).
 */
export function AccountCard({ onDone }: { onDone: (msg: string) => void }) {
  const { isDemo, profile } = useStore();

  if (isDemo) {
    return (
      <Card>
        <SectionHeader inCard title="Mi cuenta" subtitle="Disponible con tu cuenta" />
        <div className="p-5">
          <p className="text-sm" style={{ color: "#374151" }}>
            Estás en la demo, sin una cuenta real. Cuando entres con tu cuenta vas a poder cambiar acá tu email y
            tu contraseña.
          </p>
          <div className="mt-4 flex flex-wrap gap-2" aria-hidden="true">
            <button disabled className={secondaryButton}>
              Cambiar email
            </button>
            <button disabled className={secondaryButton}>
              Cambiar contraseña
            </button>
          </div>
        </div>
      </Card>
    );
  }

  return <RealAccountCard fallbackEmail={profile.email} onDone={onDone} />;
}

function RealAccountCard({ fallbackEmail, onDone }: { fallbackEmail: string | null; onDone: (msg: string) => void }) {
  const { syncAccountEmail } = useStore();
  /** Email de la cuenta según Supabase, y uno nuevo pendiente de confirmar si lo hay. */
  const [authEmail, setAuthEmail] = useState<string | null>(fallbackEmail);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [section, setSection] = useState<"none" | "email" | "password">("none");

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled || !data.user) return;
      setAuthEmail(data.user.email ?? null);
      setPendingEmail(data.user.new_email ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Si el aviso de "tu email ahora es X" actualiza el perfil, la tarjeta lo acompaña.
  useEffect(() => {
    if (fallbackEmail && fallbackEmail !== authEmail) {
      setAuthEmail(fallbackEmail);
      setPendingEmail(null);
    }
    // Solo cuando cambia el perfil (no cuando cambia `authEmail`).
  }, [fallbackEmail]);

  return (
    <Card>
      <SectionHeader inCard title="Mi cuenta" subtitle="El email y la contraseña con los que entrás" />
      <div className="p-5 space-y-5">
        <div>
          <p className="text-xs" style={{ color: "#6B7280", fontWeight: 600 }}>
            Email de la cuenta
          </p>
          <p className="text-sm mt-1 break-all" style={{ color: "#1A1A1A", fontWeight: 700 }}>
            {authEmail ?? "Sin email"}
          </p>
          {pendingEmail && (
            <p className="text-xs mt-1" style={{ color: "#B45309" }}>
              Cambio pendiente a <strong>{pendingEmail}</strong>: falta confirmar desde el mail.
            </p>
          )}
        </div>

        {section === "email" ? (
          <EmailChangeForm
            currentEmail={authEmail}
            onCancel={() => setSection("none")}
            onRequested={(next, appliedNow) => {
              if (appliedNow) {
                setAuthEmail(next);
                setPendingEmail(null);
                syncAccountEmail(next);
                setSection("none");
                onDone(`Tu email ahora es ${next}`);
              } else {
                setPendingEmail(next);
              }
            }}
          />
        ) : section === "password" ? (
          <PasswordChangeForm
            onCancel={() => setSection("none")}
            onChanged={() => {
              setSection("none");
              onDone("Contraseña actualizada");
            }}
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setSection("email")} className={secondaryButton}>
              Cambiar email
            </button>
            <button type="button" onClick={() => setSection("password")} className={secondaryButton}>
              Cambiar contraseña
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}

function EmailChangeForm({
  currentEmail,
  onCancel,
  onRequested,
}: {
  currentEmail: string | null;
  onCancel: () => void;
  /** `appliedNow`: el proyecto no pide confirmar, el email ya cambió. */
  onRequested: (email: string, appliedNow: boolean) => void;
}) {
  const [email, setEmail] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const invalid = validateEmailChange(email, confirm, currentEmail);
    if (invalid) return setError(invalid);
    const next = email.trim();
    setState("saving");
    setError(null);
    const { data, error: err } = await supabase.auth.updateUser(
      { email: next },
      { emailRedirectTo: window.location.origin },
    );
    if (err) {
      setState("idle");
      setError(emailChangeErrorMessage(err));
      return;
    }
    const appliedNow = data.user?.email?.toLowerCase() === next.toLowerCase();
    onRequested(next, appliedNow);
    if (!appliedNow) {
      setSentTo(next);
      setState("sent");
    }
  }

  if (state === "sent") {
    return (
      <div className="rounded-xl p-4" style={{ background: "#F7F0FF" }} role="status">
        <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
          Revisá tu correo
        </p>
        <p className="text-sm mt-1.5" style={{ color: "#374151" }}>
          Te mandamos un mail a <strong>{sentTo}</strong> con un link para confirmar el cambio.
          {currentEmail && (
            <>
              {" "}
              Según cómo esté configurada la cuenta, puede que también llegue un link a <strong>{currentEmail}</strong>:
              en ese caso tenés que abrir los dos.
            </>
          )}
        </p>
        <p className="text-xs mt-2" style={{ color: "#6B7280" }}>
          Hasta que confirmes, tu email sigue siendo {currentEmail ?? "el actual"} y entrás con ese. Si no llega,
          mirá en spam o pedilo de nuevo en unos minutos.
        </p>
        <button type="button" onClick={onCancel} className={`${secondaryButton} mt-3`}>
          Listo
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Email nuevo">
          <input
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Repetí el email nuevo">
          <input
            type="email"
            autoComplete="email"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      <p className="text-xs" style={{ color: "#6B7280" }}>
        Te vamos a mandar un mail para confirmar. Según la configuración de la cuenta, puede pedirte confirmar
        desde el email actual y desde el nuevo. El cambio se aplica recién cuando confirmes.
      </p>
      <FormActions error={error} saving={state === "saving"} submitLabel="Cambiar email" onCancel={onCancel} />
    </form>
  );
}

function PasswordChangeForm({ onCancel, onChanged }: { onCancel: () => void; onChanged: () => void }) {
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  /** Código que manda Supabase cuando pide reautenticarse ("Secure password change"). */
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function sendCode() {
    const { error: err } = await supabase.auth.reauthenticate();
    if (err) {
      const outcome = passwordChangeOutcome(err);
      setError(outcome.kind === "error" ? outcome.message : "No se pudo mandar el código. Probá de nuevo.");
      return false;
    }
    setInfo("Te mandamos un código a tu email. Ingresalo para confirmar que sos vos.");
    return true;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const invalid = validatePasswordChange(password, repeat);
    if (invalid) return setError(invalid);
    if (needsCode && !code.trim()) return setError("Ingresá el código que te mandamos por mail.");
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser(
      needsCode ? { password, nonce: code.trim() } : { password },
    );
    if (!err) {
      setSaving(false);
      onChanged();
      return;
    }
    const outcome = passwordChangeOutcome(err);
    if (outcome.kind === "reauth" && !needsCode) {
      setNeedsCode(true);
      await sendCode();
    } else {
      setError(outcome.kind === "error" ? outcome.message : "El código no es correcto o venció. Pedí uno nuevo.");
    }
    setSaving(false);
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Contraseña nueva">
          <input
            type="password"
            autoComplete="new-password"
            autoFocus
            minLength={MIN_PASSWORD_LENGTH}
            placeholder={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={needsCode}
            className={inputClass}
          />
        </Field>
        <Field label="Repetí la contraseña">
          <input
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            disabled={needsCode}
            className={inputClass}
          />
        </Field>
        {needsCode && (
          <Field label="Código del mail" className="sm:col-span-2">
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={inputClass}
            />
          </Field>
        )}
      </div>
      {needsCode ? (
        <p className="text-xs" style={{ color: "#6B7280" }} role="status">
          {info ?? "Por seguridad, para cambiar la contraseña tenés que confirmar con un código que te mandamos por mail."}{" "}
          <button
            type="button"
            onClick={() => {
              setError(null);
              void sendCode();
            }}
            className="underline"
            style={{ color: "#9B21FF", fontWeight: 600 }}
          >
            Mandar otro código
          </button>
        </p>
      ) : (
        <p className="text-xs" style={{ color: "#6B7280" }}>
          Vas a seguir con la sesión abierta. La próxima vez entrá con tu email y esta contraseña.
        </p>
      )}
      <FormActions
        error={error}
        saving={saving}
        submitLabel={needsCode ? "Confirmar y guardar" : "Guardar contraseña"}
        onCancel={onCancel}
      />
    </form>
  );
}

function FormActions({
  error,
  saving,
  submitLabel,
  onCancel,
}: {
  error: string | null;
  saving: boolean;
  submitLabel: string;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {error && (
        <p role="alert" className="mr-auto text-xs" style={{ color: "#E11D48", fontWeight: 600 }}>
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={onCancel}
        className="px-4 py-2 rounded-xl text-sm transition-all hover:bg-violet-50"
        style={{ color: "#6B7280", fontWeight: 600 }}
      >
        Cancelar
      </button>
      <button
        type="submit"
        disabled={saving}
        className="px-5 py-2 rounded-xl text-sm text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: "var(--gradient-brand)", fontWeight: 600 }}
      >
        {saving ? "Guardando…" : submitLabel}
      </button>
    </div>
  );
}

const secondaryButton =
  "px-4 py-2 rounded-xl text-sm border transition-all bg-white border-[#DDD8CF] text-[#9B21FF] font-semibold " +
  "hover:bg-violet-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white";
