import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/data/store";
import { BrandLogo } from "@/components/brand/BrandLogo";
import PromoTicket from "@/features/promo/PromoTicket";
import { LAUNCH_PROMO, promoGrant, type PromoGrant } from "../../../shared/promo";

type Field = "agencyName" | "fullName" | "email" | "password";
type FieldErrors = Partial<Record<Field, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Registro de inmobiliaria = activar la promo de lanzamiento (6 meses gratis de
 * Premium, el QR del banner lleva al login y de ahí acá). Tiene que sentirse
 * como un beneficio que se adquiere, no como "registrate y tenés acceso".
 *
 * - Validación propia en castellano (antes era la del navegador, en inglés:
 *   "Please fill out this field.").
 * - Al terminar, pantalla de "beneficio activado" con la fecha hasta la que
 *   vale, y "Entrar a mi CRM" inicia sesión directo: /api/saas/signup crea el
 *   usuario ya confirmado, no hace falta volver a tipear email y contraseña.
 */
export default function RegistroPage() {
  const { signIn } = useStore();
  const [agencyName, setAgencyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<"email_exists" | string | null>(null);
  const [grant, setGrant] = useState<PromoGrant | null>(null);
  const [entering, setEntering] = useState(false);
  const [enterError, setEnterError] = useState<string | null>(null);
  const refs = {
    agencyName: useRef<HTMLInputElement>(null),
    fullName: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
  };

  function validate(): FieldErrors {
    const e: FieldErrors = {};
    if (!agencyName.trim()) e.agencyName = "Poné el nombre de tu inmobiliaria.";
    if (!fullName.trim()) e.fullName = "Poné tu nombre y apellido.";
    if (!email.trim()) e.email = "Ingresá tu email.";
    else if (!EMAIL_RE.test(email.trim())) e.email = "Ese email no parece válido. Revisalo.";
    if (password.length < 8) e.password = "La contraseña tiene que tener al menos 8 caracteres.";
    return e;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const errs = validate();
    setFieldErrors(errs);
    const first = (Object.keys(errs) as Field[])[0];
    if (first) {
      refs[first].current?.focus();
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/saas/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyName: agencyName.trim(), fullName: fullName.trim(), email: email.trim(), password }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok) {
        // El server guarda el beneficio en la cuenta; si por algún motivo no lo
        // devuelve, se muestra con la misma regla (shared/promo.ts).
        setGrant(body?.promo ?? (LAUNCH_PROMO.active ? promoGrant() : null));
      } else if (res.status === 409) {
        setError("email_exists");
      } else if (body?.error === "invalid_email") {
        setFieldErrors({ email: "Ese email no parece válido. Revisalo." });
        refs.email.current?.focus();
      } else if (body?.error === "password_too_short") {
        setFieldErrors({ password: "La contraseña tiene que tener al menos 8 caracteres." });
        refs.password.current?.focus();
      } else {
        setError("Algo salió mal. Intentá de nuevo en unos segundos.");
      }
    } catch {
      setError("No se pudo conectar con el servidor. Revisá tu conexión.");
    } finally {
      setBusy(false);
    }
  }

  async function enterCrm() {
    if (entering) return;
    setEntering(true);
    setEnterError(null);
    // Con sesión, <PublicOnly> redirige solo al Inicio del CRM.
    let err: string | null = null;
    try {
      err = await signIn(email, password);
    } catch {
      err = "error";
    }
    if (err) {
      setEnterError("Tu cuenta quedó creada, pero no pudimos iniciar sesión automáticamente.");
      setEntering(false);
    }
  }

  const done = grant !== null;
  const firstName = fullName.trim().split(/\s+/)[0] ?? "";

  return (
    <div className="min-h-full flex bg-background">
      {/* Panel de marca (desktop) */}
      <div
        className="hidden lg:flex w-[46%] flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: "var(--gradient-brand-wide)" }}
      >
        <div className="absolute -right-16 -top-16 w-72 h-72 rounded-full opacity-20" style={{ background: "white" }} />
        <div className="absolute right-24 bottom-10 w-40 h-40 rounded-full opacity-10" style={{ background: "white" }} />

        <div className="relative z-10">
          <BrandLogo size={32} light />
        </div>

        <div className="relative z-10 pm-enter">
          <p className="text-white/80 text-sm uppercase tracking-[0.14em]" style={{ fontWeight: 700 }}>
            Beneficio de lanzamiento
          </p>
          <h1 className="text-white text-[56px] leading-[0.95] tracking-tight mt-3" style={{ fontWeight: 900 }}>
            {LAUNCH_PROMO.months} meses
            <br />
            gratis
          </h1>
          <p className="text-white text-lg mt-4 max-w-md" style={{ fontWeight: 600 }}>
            PropMatch {LAUNCH_PROMO.plan} + el CRM completo para tu inmobiliaria.
          </p>
          <p className="text-white/80 text-base mt-2 max-w-md">
            {LAUNCH_PROMO.includes.join(", ").toLowerCase().replace(/, ([^,]*)$/, " y $1")}.
          </p>
          <p className="text-white/90 text-sm mt-8" style={{ fontWeight: 600 }}>
            Sin tarjeta de crédito.
          </p>
        </div>

        <p className="relative z-10 text-white text-xs" style={{ opacity: 0.6 }}>
          © {new Date().getFullYear()} PropMatch
        </p>
      </div>

      {/* Formulario */}
      <div className="flex-1 flex items-start lg:items-center justify-center px-5 py-8 sm:px-8 lg:py-10">
        <div className="w-full max-w-[420px] pm-enter">
          <div className="lg:hidden mb-6">
            <BrandLogo size={30} />
          </div>

          {done ? (
            <div className="pm-enter" role="status">
              <h2 className="text-[1.9rem] leading-tight tracking-tight text-ink" style={{ fontWeight: 900 }}>
                ¡Listo{firstName ? `, ${firstName}` : ""}!
              </h2>
              <p className="text-base mt-1.5 text-ink">
                Activaste <span style={{ fontWeight: 800 }}>{LAUNCH_PROMO.months} meses gratis</span> de PropMatch{" "}
                {LAUNCH_PROMO.plan}.
              </p>

              <div className="mt-6 pm-modal">
                <PromoTicket variant="granted" grant={grant} agencyName={agencyName.trim()} />
              </div>

              {enterError && (
                <p
                  role="alert"
                  className="pm-enter mt-5 text-xs rounded-xl px-3 py-2.5"
                  style={{ background: "#FFF1F2", color: "#BE123C", border: "1px solid #FECDD3" }}
                >
                  {enterError}{" "}
                  <Link to="/login" style={{ color: "#BE123C", fontWeight: 700 }}>
                    Ingresá con tu email y contraseña
                  </Link>
                  .
                </p>
              )}

              <button
                type="button"
                onClick={enterCrm}
                disabled={entering}
                className="mt-6 w-full py-3.5 rounded-xl text-[15px] text-white transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ background: "var(--gradient-brand)", fontWeight: 700, boxShadow: "var(--shadow-cta)" }}
              >
                {entering && <Spinner />}
                {entering ? "Entrando…" : "Entrar a mi CRM"}
              </button>
            </div>
          ) : (
            <>
              <PromoTicket compact />

              <h2 className="mt-7 text-[1.6rem] leading-tight tracking-tight text-ink" style={{ fontWeight: 800 }}>
                Activá tus {LAUNCH_PROMO.months} meses gratis
              </h2>
              <p className="text-sm mt-1 text-ink-soft">Creá la cuenta de tu inmobiliaria. Te lleva un minuto.</p>

              <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
                <TextField
                  label="Nombre de la inmobiliaria"
                  inputRef={refs.agencyName}
                  value={agencyName}
                  onChange={setAgencyName}
                  error={fieldErrors.agencyName}
                  placeholder="Ej: García Propiedades"
                  autoComplete="organization"
                />
                <TextField
                  label="Tu nombre y apellido"
                  inputRef={refs.fullName}
                  value={fullName}
                  onChange={setFullName}
                  error={fieldErrors.fullName}
                  placeholder="Ej: Carlos García"
                  autoComplete="name"
                />
                <TextField
                  label="Email"
                  type="email"
                  inputRef={refs.email}
                  value={email}
                  onChange={setEmail}
                  error={fieldErrors.email}
                  placeholder="vos@inmobiliaria.com"
                  autoComplete="username"
                  inputMode="email"
                />
                <TextField
                  label="Contraseña"
                  type={showPassword ? "text" : "password"}
                  inputRef={refs.password}
                  value={password}
                  onChange={setPassword}
                  error={fieldErrors.password}
                  placeholder="Mínimo 8 caracteres"
                  autoComplete="new-password"
                  trailing={
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                      aria-pressed={showPassword}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-lavender text-ink-soft"
                    >
                      <EyeIcon off={showPassword} />
                    </button>
                  }
                />

                {error === "email_exists" ? (
                  <p
                    role="alert"
                    className="pm-enter text-xs rounded-xl px-3 py-2.5"
                    style={{ background: "#FFF1F2", color: "#BE123C", border: "1px solid #FECDD3" }}
                  >
                    Ese email ya tiene una cuenta.{" "}
                    <Link to="/login" style={{ color: "#BE123C", fontWeight: 700 }}>
                      Ingresá desde acá
                    </Link>
                    . Si la creaste en la app o la web de PropMatch para buscar dónde vivir, registrá tu
                    inmobiliaria con otro email.
                  </p>
                ) : error ? (
                  <p
                    role="alert"
                    className="pm-enter text-xs rounded-xl px-3 py-2.5"
                    style={{ background: "#FFF1F2", color: "#BE123C", border: "1px solid #FECDD3" }}
                  >
                    {error}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-3.5 rounded-xl text-[15px] text-white transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ background: "var(--gradient-brand)", fontWeight: 700, boxShadow: "var(--shadow-cta)" }}
                >
                  {busy && <Spinner />}
                  {busy ? "Activando…" : `Activar mis ${LAUNCH_PROMO.months} meses gratis`}
                </button>
              </form>

              <p className="text-sm mt-6 text-center text-ink-soft">
                ¿Ya tenés cuenta?{" "}
                <Link to="/login" className="text-violet-ink" style={{ fontWeight: 700 }}>
                  Ingresar
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  error,
  inputRef,
  type = "text",
  trailing,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  type?: string;
  trailing?: React.ReactNode;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  const id = `f-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div>
      <label htmlFor={id} className="block text-xs mb-1.5 text-ink-soft" style={{ fontWeight: 600 }}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          ref={inputRef}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={inputClass + (trailing ? " pr-11" : "") + (error ? " !border-[#FB7185]" : "")}
          {...rest}
        />
        {trailing}
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-xs" style={{ color: "#BE123C" }}>
          {error}
        </p>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.35)" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="white" strokeWidth="3" strokeLinecap="round" />
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
  "border-lilac bg-white text-ink placeholder:text-[#9CA3AF] " +
  "focus:border-[#A855FF] focus:ring-4 focus:ring-lavender";
