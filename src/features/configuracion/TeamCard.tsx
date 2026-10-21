import { useCallback, useEffect, useState } from "react";
import { Card, SectionHeader } from "@/components/ui/Card";
import { avatarGradient, initials } from "@/lib/format";
import { Field, inputClass } from "./fields";
import {
  inviteMember,
  listMembers,
  memberLink,
  removeMember,
  setMemberRole,
  type TeamMember,
} from "@/lib/team/api";
import type { MemberRole } from "../../../shared/crmVisibility";

/**
 * Equipo de la inmobiliaria: quién está, con qué rol, e invitar vendedores.
 * Solo el administrador lo ve (los agentes ven la lista simple de Configuración).
 *
 * Invitar no manda mails: crea la cuenta y devuelve un link para que la persona
 * elija su contraseña; el administrador se lo pasa (WhatsApp, por ejemplo).
 */

const ROLE_LABEL: Record<MemberRole, string> = { admin: "Administrador", agente: "Agente" };

const secondaryButton =
  "px-3 py-1.5 rounded-lg text-xs border transition-all bg-white border-[#DDD8CF] text-[#9B21FF] font-semibold " +
  "hover:bg-violet-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white";

const primaryButton =
  "px-4 py-2 rounded-xl text-sm text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed";

export function TeamCard({ onToast }: { onToast: (message: string) => void }) {
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [link, setLink] = useState<{ name: string; url: string } | null>(null);

  const load = useCallback(async () => {
    const r = await listMembers();
    if (r.ok) {
      setMembers(r.data.members);
      setError(null);
    } else {
      setError(r.message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeRole(m: TeamMember, role: MemberRole) {
    setBusy(m.userId);
    const r = await setMemberRole(m.userId, role);
    setBusy(null);
    if (!r.ok) return onToast(r.message);
    onToast(`${m.fullName} ahora es ${ROLE_LABEL[role].toLowerCase()}`);
    void load();
  }

  async function newLink(m: TeamMember) {
    setBusy(m.userId);
    const r = await memberLink(m.userId);
    setBusy(null);
    if (!r.ok) return onToast(r.message);
    setLink({ name: m.fullName, url: r.data.link });
  }

  async function remove(m: TeamMember) {
    if (!window.confirm(`¿Sacar a ${m.fullName} del equipo? Deja de ver la inmobiliaria; lo que cargó queda.`)) return;
    setBusy(m.userId);
    const r = await removeMember(m.userId);
    setBusy(null);
    if (!r.ok) return onToast(r.message);
    onToast(`${m.fullName} ya no está en el equipo`);
    void load();
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      onToast("Link copiado");
    } catch {
      onToast("No se pudo copiar: seleccionalo y copialo a mano");
    }
  }

  return (
    <Card>
      <SectionHeader
        inCard
        title="Equipo"
        subtitle={members ? `${members.length} ${members.length === 1 ? "persona" : "personas"}` : "Cargando…"}
      />
      <div className="p-3">
        {error && (
          <p className="px-2.5 py-2 text-sm" style={{ color: "#B42318" }} role="alert">
            {error}
          </p>
        )}
        {members?.map((m) => (
          <div key={m.userId} className="flex flex-wrap items-center gap-3 p-2.5 rounded-xl">
            <div
              className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarGradient(m.fullName)} flex items-center justify-center text-xs text-white flex-shrink-0`}
              style={{ fontWeight: 700 }}
            >
              {initials(m.fullName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm truncate" style={{ color: "#1A1A1A", fontWeight: 600 }}>
                {m.fullName}
                {m.isYou && (
                  <span className="ml-1.5 text-xs" style={{ color: "#6B7280", fontWeight: 500 }}>
                    (vos)
                  </span>
                )}
              </p>
              <p className="text-xs truncate" style={{ color: "#6B7280" }}>
                {m.email ?? "Sin email"}
                {!m.lastSignInAt && " · todavía no entró"}
              </p>
            </div>
            {m.isYou ? (
              <span
                className="text-xs px-2.5 py-1 rounded-lg flex-shrink-0"
                style={{ background: "#F7F0FF", color: "#9B21FF", fontWeight: 600 }}
              >
                {ROLE_LABEL[m.role]}
              </span>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label={`Rol de ${m.fullName}`}
                  value={m.role}
                  disabled={busy === m.userId}
                  onChange={(e) => void changeRole(m, e.target.value as MemberRole)}
                  className="px-2.5 py-1.5 rounded-lg text-xs border bg-white border-[#DDD8CF] text-[#1A1A1A] font-semibold"
                >
                  <option value="agente">{ROLE_LABEL.agente}</option>
                  <option value="admin">{ROLE_LABEL.admin}</option>
                </select>
                {!m.lastSignInAt && (
                  <button type="button" disabled={busy === m.userId} onClick={() => void newLink(m)} className={secondaryButton}>
                    Link de acceso
                  </button>
                )}
                <button type="button" disabled={busy === m.userId} onClick={() => void remove(m)} className={secondaryButton}>
                  Sacar
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {link && (
        <div className="mx-5 mb-4 rounded-xl p-4" style={{ background: "#F7F0FF" }} role="status">
          <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
            Link de acceso para {link.name}
          </p>
          <p className="text-xs mt-1" style={{ color: "#374151" }}>
            Pasáselo por WhatsApp. Con este link elige su contraseña y entra. Es de un solo uso y vence.
          </p>
          <input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} className={`${inputClass} mt-2 text-xs`} />
          <div className="flex gap-2 mt-2">
            <button type="button" onClick={() => void copy(link.url)} className={secondaryButton}>
              Copiar link
            </button>
            <button type="button" onClick={() => setLink(null)} className={secondaryButton}>
              Cerrar
            </button>
          </div>
        </div>
      )}

      <InviteForm
        onInvited={(name, url) => {
          void load();
          if (url) setLink({ name, url });
          else onToast("Cuenta creada. Generá el link de acceso desde la lista.");
        }}
      />
    </Card>
  );
}

function InviteForm({ onInvited }: { onInvited: (name: string, link: string | null) => void }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("agente");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const r = await inviteMember({ email, fullName, role });
    setSaving(false);
    if (!r.ok) return setError(r.message);
    onInvited(fullName.trim(), r.data.link);
    setFullName("");
    setEmail("");
    setRole("agente");
  }

  return (
    <form onSubmit={submit} className="px-5 pb-5 pt-2 space-y-3 border-t" style={{ borderColor: "#E9E5DE" }} noValidate>
      <p className="text-sm pt-3" style={{ color: "#1A1A1A", fontWeight: 700 }}>
        Sumar un vendedor
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre y apellido">
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} autoComplete="off" />
        </Field>
        <Field label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} autoComplete="off" />
        </Field>
      </div>
      <Field label="Rol">
        <select value={role} onChange={(e) => setRole(e.target.value as MemberRole)} className={inputClass}>
          <option value="agente">Agente: ve solo sus contactos, oportunidades, agenda y operaciones</option>
          <option value="admin">Administrador: ve y maneja todo, incluido el equipo</option>
        </select>
      </Field>
      {error && (
        <p className="text-sm" style={{ color: "#B42318" }} role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={saving || !fullName.trim() || !email.trim()}
        className={primaryButton}
        style={{ background: "#9B21FF", fontWeight: 600 }}
      >
        {saving ? "Creando…" : "Crear acceso"}
      </button>
    </form>
  );
}
