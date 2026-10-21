/**
 * Datos del CRM en la base propia (tabla `crm_records`). Ver docs/datos-en-la-base.md.
 *
 *   GET  pull?since=N     registros con versión > N del ámbito del usuario, de a
 *                         PULL_PAGE_SIZE → { scope, records, version, more }
 *   POST push { items }   crea/actualiza/borra (tumbas) en una transacción → { version }
 *   POST upload { propertyId, dataUrl }   foto al bucket público crm-photos → { url }
 *
 * Un usuario con rol `agente` ve y escribe solo lo suyo en lo comercial
 * (contactos, oportunidades, agenda, tareas, operaciones y lo que cuelga de sus
 * contactos); lo compartido, de toda la inmobiliaria. Ver shared/crmVisibility.ts.
 *
 * El ámbito (`scope`) sale del JWT: la inmobiliaria del usuario o, si no está
 * vinculado, su propio uuid. El cuerpo nunca lo nombra. La primera vez que un
 * usuario vinculado entra, lo que cargó solo pasa a la inmobiliaria si esta
 * estaba vacía (`crm_adopt_scope`).
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "node:crypto";
import { requireUser, type UserContext } from "../auth.js";
import { allowMethod, fail, json } from "../http.js";
import { crmDb } from "../inbox/db.js";
import { NO_DB_MESSAGE, missingTable } from "../gcal/db.js";
import { authConfigured, crmDbConfigured } from "../gcal/env.js";
import {
  PULL_PAGE_SIZE,
  parsePushBody,
  parseSince,
  parseUploadBody,
  type CrmRecord,
  type CrmStoredRecord,
} from "../../../shared/crmSync.js";
import {
  agentMayWrite,
  claimForAgent,
  contactRefs,
  isOwnerScoped,
  isRestricted,
  visibleToAgent,
} from "../../../shared/crmVisibility.js";

const body = (req: VercelRequest) => (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;

const scopeOf = (ctx: UserContext) => ctx.agencyId ?? ctx.userId;

async function guard(req: VercelRequest, res: VercelResponse, method: "GET" | "POST"): Promise<UserContext | null> {
  if (!allowMethod(req, res, method)) return null;
  if (!authConfigured()) {
    fail(res, 503, "not_configured");
    return null;
  }
  if (!crmDbConfigured()) {
    json(res, 503, { error: "no_db", message: NO_DB_MESSAGE });
    return null;
  }
  return requireUser(req, res);
}

function dbError(res: VercelResponse, e: unknown) {
  if (missingTable(e as { code?: string; message?: string })) return json(res, 503, { error: "no_db", message: NO_DB_MESSAGE });
  fail(res, 500, "server_error");
}

/** Ids de contactos de `ids` que son del usuario (para requisitos y actividad). */
async function ownedContactIds(scope: string, userId: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data, error } = await crmDb()
    .from("crm_records")
    .select("id")
    .eq("scope_id", scope)
    .eq("kind", "contact")
    .eq("deleted", false)
    .eq("data->>owner_id", userId)
    .in("id", ids);
  if (error) throw error;
  return new Set((data ?? []).map((r: { id: string }) => r.id));
}

/* ── Lectura ──────────────────────────────────────────────────────────────── */

export async function pull(req: VercelRequest, res: VercelResponse) {
  const ctx = await guard(req, res, "GET");
  if (!ctx) return;
  const scope = scopeOf(ctx);
  const since = parseSince(req.query?.since);
  const db = crmDb();
  try {
    // Cuenta recién vinculada: lo que cargó a su nombre pasa a la inmobiliaria (si está vacía).
    if (ctx.agencyId && since === 0) {
      const { error } = await db.rpc("crm_adopt_scope", { p_from: ctx.userId, p_to: ctx.agencyId });
      if (error) return dbError(res, error);
    }
    const { data, error } = await db
      .from("crm_records")
      .select("kind, id, data, deleted, version, updated_by")
      .eq("scope_id", scope)
      .gt("version", since)
      .order("version", { ascending: true })
      .limit(PULL_PAGE_SIZE);
    if (error) return dbError(res, error);
    const page = (data ?? []) as CrmStoredRecord[];
    // El cursor avanza con lo que se leyó, no con lo que se muestra: así una
    // página llena de registros ajenos no frena la bajada.
    const version = page.length ? page[page.length - 1].version : since;
    let records = page;
    if (ctx.agencyId && isRestricted(ctx.role)) {
      const owned = await ownedContactIds(scope, ctx.userId, contactRefs(page));
      records = page.filter((r) => r.deleted || visibleToAgent(r, ctx.userId, owned));
    }
    json(res, 200, { scope, records, version, more: page.length === PULL_PAGE_SIZE });
  } catch (e) {
    dbError(res, e);
  }
}

/**
 * Para un agente: deja pasar lo suyo y lo compartido, pone su nombre de dueño
 * a lo nuevo y descarta (sin romper el lote) lo que sería de otra persona.
 */
async function filterAgentPush(scope: string, userId: string, items: CrmRecord[]) {
  const scoped = items.filter((i) => isOwnerScoped(i.kind));
  // Lo que ya existe, para saber de quién es hoy.
  const existing = new Map<string, { kind: string; data: Record<string, unknown> }>();
  if (scoped.length) {
    const { data, error } = await crmDb()
      .from("crm_records")
      .select("kind, id, data")
      .eq("scope_id", scope)
      .in("kind", [...new Set(scoped.map((i) => i.kind))])
      .in("id", [...new Set(scoped.map((i) => i.id))]);
    if (error) throw error;
    for (const r of (data ?? []) as { kind: string; id: string; data: Record<string, unknown> }[]) {
      existing.set(`${r.kind}:${r.id}`, r);
    }
  }
  // Contactos suyos: los de la base que referencian los hijos, más los que crea en este mismo lote.
  const owned = await ownedContactIds(scope, userId, contactRefs(items));
  for (const i of items) {
    if (i.kind === "contact" && !i.deleted && !existing.has(`contact:${i.id}`) && claimForAgent(i, userId)) owned.add(i.id);
  }
  const out: CrmRecord[] = [];
  let skipped = 0;
  for (const i of items) {
    if (agentMayWrite(i, existing.get(`${i.kind}:${i.id}`), userId, owned) === "skip") {
      skipped++;
      continue;
    }
    out.push(i.deleted ? i : (claimForAgent(i, userId) ?? i));
  }
  return { items: out, skipped };
}

/* ── Escritura ────────────────────────────────────────────────────────────── */

export async function push(req: VercelRequest, res: VercelResponse) {
  const ctx = await guard(req, res, "POST");
  if (!ctx) return;
  const items = parsePushBody(body(req));
  if (!items) return fail(res, 400, "bad_request");
  try {
    let toWrite = items;
    let skipped = 0;
    if (ctx.agencyId && isRestricted(ctx.role)) {
      const checked = await filterAgentPush(ctx.agencyId, ctx.userId, items);
      toWrite = checked.items;
      skipped = checked.skipped;
    }
    // Nada que guardar (todo era ajeno): no es un error, el navegador sigue.
    if (toWrite.length === 0) return json(res, 200, { version: 0, skipped });
    const { data, error } = await crmDb().rpc("crm_push", { p_scope: scopeOf(ctx), p_user: ctx.userId, p_items: toWrite });
    if (error) return dbError(res, error);
    json(res, 200, { version: Number(data ?? 0), ...(skipped ? { skipped } : {}) });
  } catch (e) {
    dbError(res, e);
  }
}

/* ── Fotos ────────────────────────────────────────────────────────────────── */

const BUCKET = "crm-photos";

export async function upload(req: VercelRequest, res: VercelResponse) {
  const ctx = await guard(req, res, "POST");
  if (!ctx) return;
  const file = parseUploadBody(body(req));
  if (!file) return fail(res, 400, "bad_request");
  const path = `${scopeOf(ctx)}/${file.propertyId}/${randomUUID()}.${file.ext}`;
  try {
    const storage = crmDb().storage.from(BUCKET);
    const { error } = await storage.upload(path, file.bytes, { contentType: file.mime, upsert: false, cacheControl: "31536000" });
    if (error) return fail(res, 502, "upload_failed");
    json(res, 200, { url: storage.getPublicUrl(path).data.publicUrl });
  } catch {
    fail(res, 500, "server_error");
  }
}
