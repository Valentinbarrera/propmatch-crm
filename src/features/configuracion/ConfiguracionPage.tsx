import { useEffect, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, SectionHeader } from "@/components/ui/Card";
import { useStore, type AgencyInput, type ProfileInput } from "@/data/store";
import { avatarGradient, initials } from "@/lib/format";
import { ProppiSettingsCard } from "@/features/proppi/ProppiSettingsCard";
import { ChannelsSettings } from "@/features/inbox/channels/ChannelsSettings";
import { SampleDataCard } from "./SampleDataCard";
import { AccountCard } from "./AccountCard";
import { Field, inputClass } from "./fields";
import { IntegracionesLinkCard } from "@/features/integraciones/IntegracionesLinkCard";
import { SampleBadge } from "@/components/ui/SampleBadge";
import { BrandingCard } from "@/features/branding/BrandingCard";
import { DocTemplatesCard } from "@/features/branding/DocTemplatesCard";

/**
 * Configuración.
 *
 * Tres cosas y nada más: los datos de la inmobiliaria (los ve todo el equipo),
 * el perfil propio, la cuenta (email y contraseña, en `AccountCard`) y volver
 * a los datos de ejemplo. Lo demás (roles, invitar
 * agentes, planes) depende de tener backend y no tiene sentido simularlo.
 */

const ROLE_LABEL = { owner: "Dueño", admin: "Administrador", agente: "Agente inmobiliario" } as const;

export default function ConfiguracionPage() {
  const { agency, profile, profiles, updateAgency, updateProfile, reset, isDemo } = useStore();
  const canEditAgency = profile.role === "owner" || profile.role === "admin";
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  return (
    <>
      <AppHeader title="Configuración" subtitle="Datos de la inmobiliaria, tu perfil y el equipo." />

      <div className="flex-1 overflow-y-auto">
        <div className="pm-stagger px-4 md:px-8 py-8 grid gap-6 lg:grid-cols-2 max-w-6xl">
          <AgencyCard
            key={`agency-${agency.name}-${agency.phone}-${agency.email}-${agency.city}-${agency.province}`}
            initial={agency}
            disabled={!canEditAgency}
            onSave={(input) => {
              updateAgency(input);
              setToast("Datos de la inmobiliaria guardados");
            }}
          />

          <BrandingCard key={`brand-${agency.id}`} onSaved={setToast} />
          <DocTemplatesCard key={`docs-${agency.id}`} onSaved={setToast} />

          <ProfileCard
            key={`profile-${profile.id}-${profile.full_name}-${profile.email}-${profile.phone}`}
            initial={profile}
            roleLabel={ROLE_LABEL[profile.role]}
            emailFromAccount={!isDemo}
            onSave={(input) => {
              updateProfile(profile.id, input);
              setToast("Perfil guardado");
            }}
          />

          <AccountCard onDone={setToast} />

          <Card>
            <SectionHeader inCard title="Equipo" subtitle={`${profiles.length} personas en ${agency.name}`} />
            <div className="p-3">
              {profiles.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-2.5 rounded-xl">
                  <div
                    className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarGradient(p.full_name)} flex items-center justify-center text-xs text-white flex-shrink-0`}
                    style={{ fontWeight: 700 }}
                  >
                    {p.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate" style={{ color: "#1A1A1A", fontWeight: 600 }}>
                      {p.full_name} <SampleBadge record={p} />
                      {p.id === profile.id && (
                        <span className="ml-1.5 text-xs" style={{ color: "#6B7280", fontWeight: 500 }}>
                          (vos)
                        </span>
                      )}
                    </p>
                    <p className="text-xs truncate" style={{ color: "#6B7280" }}>
                      {p.email ?? "Sin email"}
                    </p>
                  </div>
                  <span
                    className="text-xs px-2.5 py-1 rounded-lg flex-shrink-0"
                    style={{ background: "#F7F0FF", color: "#9B21FF", fontWeight: 600 }}
                  >
                    {ROLE_LABEL[p.role]}
                  </span>
                </div>
              ))}
            </div>
            <p className="px-5 pb-4 text-xs" style={{ color: "#6B7280" }}>
              Invitar agentes y cambiar roles va a estar disponible cuando el CRM tenga backend.
            </p>
          </Card>

          <IntegracionesLinkCard />
          <ChannelsSettings />
          <SampleDataCard onDone={setToast} />

          <ResetCard onReset={reset} />

          <ProppiSettingsCard key={`proppi-${agency.id}`} onSaved={setToast} />
        </div>
      </div>

      {toast && (
        <div
          className="pm-toast fixed bottom-6 right-6 z-50 rounded-2xl px-5 py-3.5 text-sm text-white"
          style={{ background: "#1A1A1A", fontWeight: 600, boxShadow: "var(--shadow-pop)" }}
          role="status"
        >
          ✓ {toast}
        </div>
      )}
    </>
  );
}

function AgencyCard({
  initial,
  disabled,
  onSave,
}: {
  initial: AgencyInput;
  disabled: boolean;
  onSave: (input: AgencyInput) => void;
}) {
  const [form, setForm] = useState<AgencyInput>({
    name: initial.name,
    phone: initial.phone,
    email: initial.email,
    city: initial.city,
    province: initial.province,
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof AgencyInput) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const dirty = (Object.keys(form) as (keyof AgencyInput)[]).some((k) => (form[k] ?? "") !== (initial[k] ?? ""));

  function save() {
    if (!form.name?.trim()) return setError("La inmobiliaria necesita un nombre");
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) return setError("Revisá el email");
    setError(null);
    onSave({
      name: form.name.trim(),
      phone: form.phone?.trim() || null,
      email: form.email?.trim() || null,
      city: form.city?.trim() || null,
      province: form.province?.trim() || null,
    });
  }

  return (
    <Card>
      <SectionHeader
        inCard
        title="Inmobiliaria"
        subtitle={disabled ? "Solo el dueño o un administrador puede editarla" : "Aparece en el menú y en los reportes"}
      />
      <div className="p-5 grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" className="sm:col-span-2">
          <input value={form.name ?? ""} onChange={(e) => set("name")(e.target.value)} disabled={disabled} className={inputClass} />
        </Field>
        <Field label="Teléfono">
          <input value={form.phone ?? ""} onChange={(e) => set("phone")(e.target.value)} disabled={disabled} className={inputClass} />
        </Field>
        <Field label="Email">
          <input type="email" value={form.email ?? ""} onChange={(e) => set("email")(e.target.value)} disabled={disabled} className={inputClass} />
        </Field>
        <Field label="Ciudad">
          <input value={form.city ?? ""} onChange={(e) => set("city")(e.target.value)} disabled={disabled} className={inputClass} />
        </Field>
        <Field label="Provincia">
          <input value={form.province ?? ""} onChange={(e) => set("province")(e.target.value)} disabled={disabled} className={inputClass} />
        </Field>
      </div>
      {!disabled && <SaveBar dirty={dirty} error={error} onSave={save} />}
    </Card>
  );
}

function ProfileCard({
  initial,
  roleLabel,
  emailFromAccount,
  onSave,
}: {
  initial: ProfileInput;
  roleLabel: string;
  /** Con cuenta real el email es el de la cuenta: se cambia en "Mi cuenta", no acá. */
  emailFromAccount: boolean;
  onSave: (input: ProfileInput) => void;
}) {
  const [form, setForm] = useState<ProfileInput>({
    full_name: initial.full_name,
    email: initial.email,
    phone: initial.phone,
  });
  const [error, setError] = useState<string | null>(null);
  const dirty = (Object.keys(form) as (keyof ProfileInput)[]).some((k) => (form[k] ?? "") !== (initial[k] ?? ""));

  function save() {
    if (!form.full_name.trim()) return setError("Ingresá tu nombre");
    if (!form.email?.trim() || !/^\S+@\S+\.\S+$/.test(form.email)) {
      // Sin email no se puede volver a entrar: el login busca por email.
      return setError("Necesitás un email válido para iniciar sesión");
    }
    setError(null);
    onSave({ full_name: form.full_name.trim(), email: form.email.trim(), phone: form.phone?.trim() || null });
  }

  return (
    <Card>
      <SectionHeader inCard title="Mi perfil" subtitle={roleLabel} />
      <div className="p-5 flex items-center gap-4">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-lg text-white flex-shrink-0"
          style={{ background: "var(--gradient-brand)", fontWeight: 700 }}
        >
          {initials(form.full_name)}
        </div>
        <p className="text-xs" style={{ color: "#6B7280" }}>
          Tu nombre aparece en "a cargo de", en la agenda y en el ranking del equipo.
        </p>
      </div>
      <div className="px-5 pb-5 grid gap-4 sm:grid-cols-2">
        <Field label="Nombre completo" className="sm:col-span-2">
          <input
            value={form.full_name}
            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
            className={inputClass}
          />
        </Field>
        <Field label={emailFromAccount ? "Email (se cambia en Mi cuenta)" : "Email (para iniciar sesión)"}>
          <input
            type="email"
            value={form.email ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            readOnly={emailFromAccount}
            disabled={emailFromAccount}
            className={inputClass}
          />
        </Field>
        <Field label="Teléfono">
          <input
            value={form.phone ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className={inputClass}
          />
        </Field>
      </div>
      <SaveBar dirty={dirty} error={error} onSave={save} />
    </Card>
  );
}

function ResetCard({ onReset }: { onReset: () => void }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <Card>
      <SectionHeader inCard title="Restablecer este navegador" subtitle="Solo afecta a este navegador" />
      <div className="p-5">
        <p className="text-sm" style={{ color: "#374151" }}>
          Mientras el CRM no tenga backend, todo lo que cargás se guarda en este navegador. Volver a los datos
          de ejemplo borra los contactos, propiedades, oportunidades y eventos que agregaste o editaste, y
          cierra la sesión.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {confirming ? (
            <>
              <span className="text-sm" style={{ color: "#E11D48", fontWeight: 600 }}>
                ¿Seguro? No se puede deshacer.
              </span>
              <button
                onClick={onReset}
                className="px-4 py-2 rounded-xl text-sm text-white transition-all hover:opacity-90"
                style={{ background: "#E11D48", fontWeight: 600 }}
              >
                Sí, restablecer
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="px-4 py-2 rounded-xl text-sm transition-all hover:bg-violet-50"
                style={{ color: "#6B7280", fontWeight: 600 }}
              >
                Cancelar
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="px-4 py-2 rounded-xl text-sm border transition-all hover:bg-rose-50"
              style={{ borderColor: "#FECDD3", color: "#E11D48", fontWeight: 600, background: "white" }}
            >
              Volver a los datos de ejemplo
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ── Piezas ──────────────────────────────────────────────────────────────── */

function SaveBar({ dirty, error, onSave }: { dirty: boolean; error: string | null; onSave: () => void }) {
  return (
    <div
      className="px-5 py-3.5 border-t flex items-center justify-end gap-3"
      style={{ borderColor: "#F0EDE6", background: "#FAF8F5" }}
    >
      {error && (
        <span className="mr-auto text-xs" style={{ color: "#E11D48", fontWeight: 600 }}>
          {error}
        </span>
      )}
      <button
        onClick={onSave}
        disabled={!dirty}
        className="px-5 py-2 rounded-xl text-sm text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
        style={{ background: "var(--gradient-brand)", fontWeight: 600 }}
      >
        Guardar
      </button>
    </div>
  );
}
