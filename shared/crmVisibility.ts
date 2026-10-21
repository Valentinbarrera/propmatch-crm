/**
 * Quién ve y quién escribe qué dentro de una inmobiliaria: piezas puras, sin red.
 * Las usa api/_lib/crm/routes.ts (servidor). Pruebas: npm run test:team.
 *
 * El rol sale de `agency_members` (`admin` | `agente`):
 *   - `admin` y las cuentas sin inmobiliaria ven y escriben todo.
 *   - `agente` ve la inmobiliaria completa en lo compartido (propiedades,
 *     fotos, equipo, ofertas y visitas de la app) y, de lo comercial, solo lo
 *     suyo: sus contactos, oportunidades, agenda, tareas y operaciones, y lo
 *     que cuelga de sus contactos (requisitos, actividad).
 *
 * El filtro vive en el servidor: el navegador baja los registros de a páginas
 * y nunca consulta la base, así que ocultar en pantalla no protegería nada.
 */
import type { CrmKind } from "./crmSync.ts";

export type MemberRole = "admin" | "agente";

export const MEMBER_ROLES: readonly MemberRole[] = ["admin", "agente"];

export const isMemberRole = (v: unknown): v is MemberRole => v === "admin" || v === "agente";

/** Solo el rol `agente` está limitado; sin rol (cuenta sin inmobiliaria) trabaja en su propio ámbito. */
export const isRestricted = (role: string | null | undefined) => role === "agente";

/** Lo comercial que lleva un dueño en `data.owner_id`. */
const OWNED_BY_OWNER_ID = new Set<CrmKind>(["contact", "opportunity", "event", "task"]);

/** Lo que cuelga de un contacto: se ve si el contacto es de uno. */
const CONTACT_CHILD = new Set<CrmKind>(["requirement", "activity"]);

interface Rec {
  kind: string;
  data: Record<string, unknown>;
}

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

/** Los `contact_id` que referencian estos registros (requisitos y actividad), sin repetir. */
export function contactRefs(recs: Rec[]): string[] {
  const out = new Set<string>();
  for (const r of recs) {
    if (!CONTACT_CHILD.has(r.kind as CrmKind)) continue;
    const id = str(r.data.contact_id);
    if (id) out.add(id);
  }
  return [...out];
}

const dealMine = (data: Record<string, unknown>, userId: string) =>
  data.responsible_id === userId || data.co_agent_id === userId || data.created_by === userId;

/**
 * ¿Lo ve un agente? `ownedContacts` = ids de contactos suyos entre los que
 * referencia el registro (el servidor los consulta aparte).
 */
export function visibleToAgent(rec: Rec, userId: string, ownedContacts: ReadonlySet<string>): boolean {
  const kind = rec.kind as CrmKind;
  if (OWNED_BY_OWNER_ID.has(kind)) return rec.data.owner_id === userId;
  if (kind === "deal") return dealMine(rec.data, userId);
  if (kind === "requirement") {
    const c = str(rec.data.contact_id);
    return c !== null && ownedContacts.has(c);
  }
  if (kind === "activity") {
    const c = str(rec.data.contact_id);
    return c !== null ? ownedContacts.has(c) : rec.data.actor_id === userId;
  }
  return true;
}

/** Tipos cuyo dueño decide quién puede tocarlos (para buscar el dueño actual en la base). */
export const isOwnerScoped = (kind: string) =>
  OWNED_BY_OWNER_ID.has(kind as CrmKind) || kind === "deal" || CONTACT_CHILD.has(kind as CrmKind);

/**
 * Un registro nuevo (o editado) de un agente queda a su nombre si no tenía
 * dueño; nunca se lo puede poner a nombre de otro. Devuelve `null` si intenta
 * escribir algo a nombre de otra persona.
 */
export function claimForAgent<T extends Rec>(rec: T, userId: string): T | null {
  const kind = rec.kind as CrmKind;
  if (OWNED_BY_OWNER_ID.has(kind)) {
    const owner = rec.data.owner_id;
    if (owner === userId) return rec;
    if (owner == null || owner === "") return { ...rec, data: { ...rec.data, owner_id: userId } };
    return null;
  }
  if (kind === "deal") {
    if (dealMine(rec.data, userId)) return rec;
    if (rec.data.responsible_id == null) return { ...rec, data: { ...rec.data, responsible_id: userId } };
    return null;
  }
  return rec;
}

export type PushDecision = "ok" | "skip";

/**
 * ¿Puede un agente guardar este cambio? `existing` = el registro tal como está
 * hoy en la base (si ya existía). Lo que no puede se descarta sin romper el lote.
 * `ownedContacts` = contactos suyos (de la base o creados en el mismo lote).
 */
export function agentMayWrite(
  next: Rec & { deleted?: boolean },
  existing: Rec | undefined,
  userId: string,
  ownedContacts: ReadonlySet<string>,
): PushDecision {
  const kind = next.kind as CrmKind;
  if (!isOwnerScoped(kind)) return "ok";
  // Lo que ya existe tiene que ser suyo (o no ser de nadie todavía).
  if (existing && !visibleToAgent(existing, userId, ownedContacts) && !unowned(existing)) return "skip";
  if (next.deleted) return "ok";
  if (CONTACT_CHILD.has(kind)) {
    const c = str(next.data.contact_id);
    if (c !== null && !ownedContacts.has(c)) return "skip";
    return "ok";
  }
  return claimForAgent(next, userId) ? "ok" : "skip";
}

/** Sin dueño asignado: lo puede tomar quien lo edite. */
function unowned(rec: Rec): boolean {
  const kind = rec.kind as CrmKind;
  if (OWNED_BY_OWNER_ID.has(kind)) return rec.data.owner_id == null || rec.data.owner_id === "";
  if (kind === "deal") return rec.data.responsible_id == null && rec.data.co_agent_id == null && rec.data.created_by == null;
  return false;
}

/* ── Invitaciones ─────────────────────────────────────────────────────────── */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface InviteInput {
  email: string;
  fullName: string;
  role: MemberRole;
}

/** Valida el cuerpo de `POST /api/saas/invite`. */
export function parseInviteBody(body: unknown): InviteInput | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const fullName = typeof b.fullName === "string" ? b.fullName.trim() : "";
  const role = b.role === undefined ? "agente" : b.role;
  if (!EMAIL_RE.test(email) || email.length > 200) return null;
  if (fullName.length < 2 || fullName.length > 120) return null;
  if (!isMemberRole(role)) return null;
  return { email, fullName, role };
}
