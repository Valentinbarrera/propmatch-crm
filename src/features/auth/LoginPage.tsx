import { useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/data/store";
import { supabase } from "@/lib/supabase";
import BrandPanel from "./BrandPanel";
import { BrandLogo } from "@/components/brand/BrandLogo";
import PromoTicket from "@/features/promo/PromoTicket";
import { LAUNCH_PROMO } from "../../../shared/promo";

export default function LoginPage() {
  const { signIn, pendingLinkEmail, dismissPendingLink, enterDemo } = useStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [busy, setBusy] = useState(false);
  const [linkError, setLinkError] = useState<LinkErrorKind | null>(readLinkErrorFromUrl);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    // Validación propia en castellano: antes era la del navegador, en inglés
    // ("Please fill out this field.").
    const errs: { email?: string; password?: string } = {};
    if (!email.trim()) errs.email = "Ingresá tu email.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = "Ese email no parece válido. Revisalo.";
    if (!password) errs.password = "Ingresá tu contraseña.";
    setFieldErrors(errs);
    if (errs.email || errs.password) return;
    setBusy(true);
    setError(await signIn(email, password));
    setBusy(false);
  }

  if (pendingLinkEmail !== null) {
    return (
      <Shell>
        <PendingLink
          email={pendingLinkEmail}
          onBack={dismissPendingLink}
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="lg:hidden mb-6">
        <BrandLogo size={30} />
      </div>

      {linkError && (
        <LinkErrorNotice
          kind={linkError}
          email={email}
          onEmailChange={setEmail}
          onDismiss={() => setLinkError(null)}
        />
      )}

      {/* Promo de lanzamiento: el QR del banner del evento trae acá. */}
      {LAUNCH_PROMO.active && (
        <>
          <PromoTicket compact />
          <Link
            to="/registro"
            className="mt-3 w-full py-3 rounded-xl text-[15px] text-white transition-all hover:brightness-110 active:scale-[0.99] flex items-center justify-center gap-2"
            style={{ background: "var(--gradient-brand)", fontWeight: 700, boxShadow: "var(--shadow-cta)" }}
          >
            Activar mis {LAUNCH_PROMO.months} meses gratis
            <span aria-hidden="true">→</span>
          </Link>

          <div className="flex items-center gap-3 mt-5 mb-4" aria-hidden="true">
            <span className="flex-1 h-px bg-lilac" />
            <span className="text-xs text-ink-soft" style={{ fontWeight: 600 }}>
              ¿Ya tenés cuenta?
            </span>
            <span className="flex-1 h-px bg-lilac" />
          </div>
        </>
      )}

      <h2 className="text-[1.4rem] leading-tight tracking-tight text-ink" style={{ fontWeight: 800 }}>
        Ingresá a tu CRM
      </h2>
      <p className="text-sm mt-1 mb-5 text-ink-soft">Qué bueno verte de nuevo.</p>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            inputMode="email"
            placeholder="vos@inmobiliaria.com"
            aria-invalid={fieldErrors.email ? true : undefined}
            className={inputClass + (fieldErrors.email ? " !border-[#FB7185]" : "")}
          />
          {fieldErrors.email && <FieldError>{fieldErrors.email}</FieldError>}
        </Field>

        <label className="block">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs" style={{ color: "#6B7280", fontWeight: 600 }}>Contraseña</span>
            <ForgotPassword email={email} />
          </div>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="Tu contraseña"
              aria-invalid={fieldErrors.password ? true : undefined}
              className={inputClass + " pr-11" + (fieldErrors.password ? " !border-[#FB7185]" : "")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              aria-pressed={showPassword}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[#F7F0FF] outline-none focus-visible:ring-2 focus-visible:ring-[#9B21FF]"
              style={{ color: "#6B7280" }}
            >
              <EyeIcon off={showPassword} />
            </button>
          </div>
          {fieldErrors.password && <FieldError>{fieldErrors.password}</FieldError>}
        </label>

        {error && (
          <p
            role="alert"
            className="pm-enter text-xs rounded-xl px-3 py-2.5"
            style={{ background: "#FFF1F2", color: "#E11D48", border: "1px solid #FECDD3" }}
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full py-3 rounded-xl text-sm text-white transition-all hover:brightness-110 hover:-translate-y-px active:translate-y-0 active:scale-[0.99] disabled:opacity-60 disabled:hover:translate-y-0 flex items-center justify-center gap-2 outline-none focus-visible:ring-4 focus-visible:ring-[#DDD8CF]"
          style={{
            background: "var(--gradient-brand)",
            fontWeight: 600,
            boxShadow: "var(--shadow-cta)",
          }}
        >
          {busy && <Spinner />}
          {busy ? "Un momento…" : "Ingresar"}
        </button>
      </form>

      {!LAUNCH_PROMO.active && (
        <p className="text-sm mt-6 text-center text-ink-soft">
          ¿No tenés cuenta?{" "}
          <Link to="/registro" className="text-violet-ink" style={{ fontWeight: 600 }}>
            Crear inmobiliaria gratis →
          </Link>
        </p>
      )}

      {/* La demo queda, pero como opción secundaria: antes era el primer botón
          y competía con registrarse. */}
      <p className="text-sm mt-6 text-center text-ink-soft">
        ¿Querés mirarlo primero?{" "}
        <button
          type="button"
          onClick={enterDemo}
          disabled={busy}
          className="underline underline-offset-2 text-violet-ink disabled:opacity-60"
          style={{ fontWeight: 600 }}
        >
          Ver la demo
        </button>
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full flex bg-background">
      <BrandPanel />
      <div className="flex-1 flex items-start lg:items-center justify-center px-5 py-6 sm:px-8 lg:py-5">
        <div className="w-full max-w-[400px] pm-enter">{children}</div>
      </div>
    </div>
  );
}

function PendingLink({
  email,
  onBack,
}: {
  email: string;
  onBack: () => void;
}) {
  return (
    <div className="text-center lg:text-left" role="status">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto lg:mx-0"
        style={{ background: "var(--gradient-brand)", boxShadow: "var(--shadow-cta)" }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="text-[1.75rem] leading-tight tracking-tight mt-6" style={{ color: "#1A1A1A", fontWeight: 800 }}>
        Cuenta creada
      </h2>
      <p className="text-sm mt-2 leading-relaxed" style={{ color: "#6B7280" }}>
        Confirmá tu email y ya podés ingresar.
      </p>

      <ul className="mt-6 space-y-3 text-left">
        <Step
          title="Confirmá tu email"
          text={
            <>
              Te mandamos un mensaje a <strong style={{ color: "#1A1A1A" }}>{email}</strong>. Abrilo y
              tocá el enlace para activar la cuenta.
            </>
          }
        />
        <Step
          title="Ingresá"
          text={
            email ? (
              <>
                Volvé al inicio y entrá con <strong style={{ color: "#1A1A1A" }}>{email}</strong>.
              </>
            ) : (
              "Volvé al inicio y entrá con tu cuenta."
            )
          }
        />
      </ul>

      <button
        type="button"
        onClick={onBack}
        className="mt-8 w-full py-3 rounded-xl text-sm border bg-white transition-all hover:bg-[#F7F0FF] active:scale-[0.99] outline-none focus-visible:ring-4 focus-visible:ring-[#E9E5DE] focus-visible:border-[#9B21FF]"
        style={{ borderColor: "#E9E5DE", color: "#56148F", fontWeight: 600 }}
      >
        Volver al inicio
      </button>
    </div>
  );
}

function ForgotPassword({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error" | "need_email">("idle");

  async function send() {
    if (!email.trim()) {
      setState("need_email");
      return;
    }
    setState("sending");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    setState(error ? "error" : "sent");
  }

  return (
    <div aria-live="polite">
      {state === "sent" ? (
        <span className="text-xs" style={{ color: "#166534", fontWeight: 600 }}>
          ¡Listo! Revisá tu casilla.
        </span>
      ) : (
        <span className="inline-flex flex-col items-end gap-0.5">
          <button
            type="button"
            onClick={send}
            disabled={state === "sending"}
            className="text-xs underline decoration-dotted underline-offset-2 transition-colors hover:opacity-80 disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-[#9B21FF] rounded"
            style={{ color: "#9B21FF", fontWeight: 600 }}
          >
            {state === "sending" ? "Enviando…" : "¿Olvidaste tu contraseña?"}
          </button>
          {state === "need_email" && (
            <span className="text-xs" style={{ color: "#E11D48" }}>Escribí tu email primero.</span>
          )}
          {state === "error" && (
            <span className="text-xs" style={{ color: "#E11D48" }}>No se pudo enviar. Intentá de nuevo.</span>
          )}
        </span>
      )}
    </div>
  );
}

type LinkErrorKind = "expired" | "other";

function readLinkErrorFromUrl(): LinkErrorKind | null {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  const params = new URLSearchParams(hash);
  if (!params.get("error")) return null;
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  return params.get("error_code") === "otp_expired" ? "expired" : "other";
}

function LinkErrorNotice({
  kind,
  email,
  onEmailChange,
  onDismiss,
}: {
  kind: LinkErrorKind;
  email: string;
  onEmailChange: (v: string) => void;
  onDismiss: () => void;
}) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function resend(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || state === "sending") return;
    setState("sending");
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setState(error ? "error" : "sent");
  }

  return (
    <div role="alert" className="mb-6 rounded-2xl p-4 border" style={{ background: "#FFFBEB", borderColor: "#FDE68A" }}>
      <p className="text-sm" style={{ color: "#92400E", fontWeight: 700 }}>
        {kind === "expired" ? "El link del email venció o ya se usó" : "No pudimos validar el link del email"}
      </p>
      <p className="text-xs mt-1 leading-relaxed" style={{ color: "#92400E" }}>
        Pasa si el link es viejo o si se abrió dos veces (algunos correos lo abren solos para revisarlo). Pedí uno
        nuevo y abrilo una sola vez. Si tu cuenta ya está confirmada, ingresá directamente.
      </p>
      {state === "sent" ? (
        <p className="text-xs mt-3" style={{ color: "#166534", fontWeight: 700 }}>
          Listo: te mandamos un email nuevo a {email.trim()}. Revisá también spam.
        </p>
      ) : (
        <form onSubmit={resend} className="mt-3 flex flex-col sm:flex-row gap-2">
          <label className="sr-only" htmlFor="resend-email">
            Email de la cuenta
          </label>
          <input
            id="resend-email"
            type="email"
            required
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="tu@email.com"
            className="flex-1 min-h-11 px-3 rounded-xl text-sm border bg-white outline-none focus-visible:ring-4 focus-visible:ring-[#E9E5DE]"
            style={{ borderColor: "#FDE68A" }}
          />
          <button
            type="submit"
            disabled={state === "sending"}
            className="min-h-11 px-4 rounded-xl text-sm text-white disabled:opacity-60"
            style={{ background: "var(--gradient-brand)", fontWeight: 700 }}
          >
            {state === "sending" ? "Enviando…" : "Reenviar email"}
          </button>
        </form>
      )}
      {state === "error" && (
        <p className="text-xs mt-2" style={{ color: "#E11D48" }}>
          No se pudo reenviar. Esperá un minuto y probá de nuevo (hay un límite de envíos).
        </p>
      )}
      <button type="button" onClick={onDismiss} className="mt-2 text-xs underline" style={{ color: "#92400E" }}>
        Cerrar
      </button>
    </div>
  );
}

function Step({ title, text }: { title: string; text: React.ReactNode }) {
  return (
    <li className="flex gap-3 rounded-xl p-3.5" style={{ background: "#F7F0FF" }}>
      <span
        className="mt-1 w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: "var(--gradient-brand)" }}
        aria-hidden="true"
      />
      <div>
        <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 600 }}>{title}</p>
        <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "#6B7280" }}>{text}</p>
      </div>
    </li>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <span className="block mt-1.5 text-xs" style={{ color: "#BE123C" }}>
      {children}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs mb-1.5" style={{ color: "#6B7280", fontWeight: 600 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function Spinner({ dark = false }: { dark?: boolean }) {
  return (
    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke={dark ? "#DADCE0" : "rgba(255,255,255,0.35)"} strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke={dark ? "#9B21FF" : "white"} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}

const inputClass =
  "w-full px-4 py-3 rounded-xl text-base border outline-none transition-all " +
  "border-[#E9E5DE] bg-white text-[#1A1A1A] placeholder:text-[#9CA3AF] " +
  "focus:border-[#BF7FFF] focus:ring-4 focus:ring-[#E9E5DE]";
