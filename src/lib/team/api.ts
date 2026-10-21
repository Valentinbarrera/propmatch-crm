/**
 * Cliente de /api/saas/* para el equipo de la inmobiliaria (solo admin). El
 * servidor resuelve usuario y agencia por la sesión; acá nunca viaja el id de
 * la agencia. En la demo no se llama a nada.
 */
import { supabase } from "@/lib/supabase";
import { isDemoActive } from "@/lib/demo";
import type { MemberRole } from "../../../shared/crmVisibility";

export interface TeamMember {
  userId: string;
  role: MemberRole;
  email: string | null;
  fullName: string;
  /** `null` = todavía no entró (invitación pendiente). */
  lastSignInAt: string | null;
  isYou: boolean;
  joinedAt: string;
}

export type TeamResult<T> = { ok: true; data: T } | { ok: false; error: string; message: string };

export const TEAM_MESSAGES: Record<string, string> = {
  unauthorized: "Tu sesión venció. Volvé a iniciar sesión.",
  forbidden: "Solo el administrador de la inmobiliaria puede manejar el equipo.",
  invalid_input: "Revisá el nombre y el email.",
  email_exists: "Ese email ya tiene una cuenta en PropMatch. Usá otro email para el vendedor.",
  last_admin: "Tiene que quedar al menos un administrador.",
  cannot_remove_self: "No te podés sacar a vos mismo del equipo.",
  not_found: "Esa persona ya no está en el equipo.",
  link_failed: "No se pudo generar el link. Probá de nuevo.",
  create_user_failed: "No se pudo crear la cuenta. Probá de nuevo.",
  create_member_failed: "No se pudo sumar a la persona al equipo. Probá de nuevo.",
  server_error: "Algo falló de nuestro lado. Probá de nuevo en un rato.",
  no_server: "El servidor no está disponible en este entorno.",
  network: "No hay conexión con el servidor. Probá de nuevo.",
  demo: "En la demo no se puede invitar gente. Creá tu cuenta para usarlo.",
};

async function call<T>(action: string, method: "GET" | "POST", body?: unknown): Promise<TeamResult<T>> {
  const err = (error: string) => ({ ok: false, error, message: TEAM_MESSAGES[error] ?? TEAM_MESSAGES.server_error }) as const;
  try {
    if (isDemoActive()) return err("demo");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return err("unauthorized");
    const r = await fetch(`/api/saas/${action}`, {
      method,
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!r.headers.get("content-type")?.includes("application/json")) return err("no_server");
    const j = (await r.json()) as T & { error?: string };
    if (!r.ok) return err(j.error ?? "server_error");
    return { ok: true, data: j };
  } catch {
    return err("network");
  }
}

export const listMembers = () => call<{ members: TeamMember[] }>("members", "GET");

export const inviteMember = (input: { email: string; fullName: string; role: MemberRole }) =>
  call<{ ok: true; userId: string; link: string | null }>("invite", "POST", input);

export const memberLink = (userId: string) => call<{ ok: true; link: string }>("invite-link", "POST", { userId });

export const setMemberRole = (userId: string, role: MemberRole) =>
  call<{ ok: true }>("set-role", "POST", { userId, role });

export const removeMember = (userId: string) => call<{ ok: true }>("remove", "POST", { userId });
