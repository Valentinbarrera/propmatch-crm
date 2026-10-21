import { routeByAction } from "./_lib/router.js";
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { requireAgencyAdmin } from "./_lib/auth.js";
import { appUrl } from "./_lib/env.js";
import { isMemberRole, parseInviteBody } from "../shared/crmVisibility.js";
import { allowMethod, json, fail } from "./_lib/http.js";
import { LAUNCH_PROMO, promoGrant } from "../shared/promo.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * /api/saas/signup — crea usuario + agencia sin intervención manual.
 *
 * REQUIERE en Vercel: SUPABASE_SERVICE_ROLE_KEY (service role de la app Supabase,
 * proyecto jhtkvcxvgjwnuzfhbale). Ya está en env.ts; solo hay que cargarlo en
 * Vercel → Settings → Environment Variables si no está todavía.
 */
async function signup(req: VercelRequest, res: VercelResponse) {
  if (!allowMethod(req, res, "POST")) return;

  const { agencyName, fullName, email, password } = req.body ?? {};

  if (!agencyName?.trim() || !fullName?.trim() || !email?.trim() || !password) {
    return fail(res, 400, "missing_fields");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail(res, 400, "invalid_email");
  }
  if (password.length < 8) {
    return fail(res, 400, "password_too_short");
  }

  const sb = supabaseAdmin();

  // Promo de lanzamiento (6 meses gratis de Premium): queda en la metadata del
  // usuario para saber quién la activó y hasta cuándo vale. Ver shared/promo.ts.
  const promo = LAUNCH_PROMO.active ? promoGrant() : null;

  // 1. Crear usuario
  const { data: userData, error: userErr } = await sb.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: true,
    // `name` lo lee el trigger handle_new_user de la app (public.users.name);
    // `agency_name` lo usa el CRM si la cuenta queda sin inmobiliaria.
    user_metadata: {
      full_name: fullName.trim(),
      name: fullName.trim(),
      agency_name: agencyName.trim(),
      ...(promo ? { promo } : {}),
    },
  });
  if (userErr) {
    if (userErr.message?.toLowerCase().includes("already")) {
      return json(res, 409, { error: "email_exists" });
    }
    return fail(res, 500, "create_user_failed");
  }
  const userId = userData.user.id;

  // 2. Crear agencia
  const { data: agencyData, error: agencyErr } = await sb
    .from("agencies")
    // owner_user_id es lo que el CRM usa para tratar la cuenta como vinculada
    // (store.tsx, applySession). Sin él, cada alta nueva entraba en modo local,
    // como una demo: sin Proppi, sin publicar en la app, sin inbox.
    .insert({ name: agencyName.trim(), owner_user_id: userId })
    .select("id")
    .single();
  if (agencyErr || !agencyData) {
    await sb.auth.admin.deleteUser(userId);
    return fail(res, 500, "create_agency_failed");
  }
  const agencyId = agencyData.id;

  // 3. Vincular usuario como admin
  const { error: memberErr } = await sb
    .from("agency_members")
    .insert({ agency_id: agencyId, user_id: userId, role: "admin" });
  if (memberErr) {
    await sb.from("agencies").delete().eq("id", agencyId);
    await sb.auth.admin.deleteUser(userId);
    return fail(res, 500, "create_member_failed");
  }

  return json(res, 200, { ok: true, promo });
}

/* ── Equipo ───────────────────────────────────────────────────────────────── */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Link para que la persona elija su contraseña (lo maneja PasswordRecovery en el front). */
async function passwordLink(sb: ReturnType<typeof supabaseAdmin>, email: string): Promise<string | null> {
  const { data, error } = await sb.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: appUrl() },
  });
  return error ? null : (data.properties?.action_link ?? null);
}

/**
 * GET /api/saas/members — el equipo de la inmobiliaria (solo admin).
 * Une `agency_members` con los datos de la cuenta (nombre, mail, último ingreso).
 */
async function members(req: VercelRequest, res: VercelResponse) {
  if (!allowMethod(req, res, "GET")) return;
  const ctx = await requireAgencyAdmin(req, res);
  if (!ctx) return;
  const sb = supabaseAdmin();
  const { data: rows, error } = await sb
    .from("agency_members")
    .select("user_id, role, created_at")
    .eq("agency_id", ctx.agencyId)
    .order("created_at", { ascending: true });
  if (error) return fail(res, 500, "server_error");
  const list = await Promise.all(
    (rows ?? []).map(async (r: { user_id: string; role: string; created_at: string }) => {
      const { data } = await sb.auth.admin.getUserById(r.user_id);
      const u = data?.user;
      const meta = (u?.user_metadata ?? {}) as { full_name?: string; name?: string };
      return {
        userId: r.user_id,
        role: r.role,
        email: u?.email ?? null,
        fullName: meta.full_name?.trim() || meta.name?.trim() || u?.email?.split("@")[0] || "Sin nombre",
        // Sin ingreso todavía = invitación pendiente.
        lastSignInAt: u?.last_sign_in_at ?? null,
        isYou: r.user_id === ctx.userId,
        joinedAt: r.created_at,
      };
    }),
  );
  json(res, 200, { members: list });
}

/**
 * POST /api/saas/invite { email, fullName, role } — da de alta a un integrante
 * (solo admin). Crea la cuenta sin contraseña y devuelve el link para elegirla;
 * el admin se lo pasa a la persona. No manda mails: no depende de Resend.
 */
async function invite(req: VercelRequest, res: VercelResponse) {
  if (!allowMethod(req, res, "POST")) return;
  const ctx = await requireAgencyAdmin(req, res);
  if (!ctx) return;
  const input = parseInviteBody(req.body);
  if (!input) return fail(res, 400, "invalid_input");

  const sb = supabaseAdmin();
  const { data: created, error: userErr } = await sb.auth.admin.createUser({
    email: input.email,
    email_confirm: true,
    user_metadata: { full_name: input.fullName, name: input.fullName },
  });
  if (userErr || !created.user) {
    // La cuenta ya existe (otra inmobiliaria o la app de búsqueda): no se la suma
    // sin que la persona lo pida, porque un mail mal escrito le daría acceso a un tercero.
    if (userErr?.message?.toLowerCase().includes("already")) return fail(res, 409, "email_exists");
    return fail(res, 500, "create_user_failed");
  }
  const userId = created.user.id;

  const { error: memberErr } = await sb
    .from("agency_members")
    .insert({ agency_id: ctx.agencyId, user_id: userId, role: input.role });
  if (memberErr) {
    await sb.auth.admin.deleteUser(userId);
    return fail(res, 500, "create_member_failed");
  }

  const link = await passwordLink(sb, input.email);
  json(res, 200, { ok: true, userId, link });
}

/** POST /api/saas/invite-link { userId } — nuevo link de contraseña para alguien del equipo (solo admin). */
async function inviteLink(req: VercelRequest, res: VercelResponse) {
  if (!allowMethod(req, res, "POST")) return;
  const ctx = await requireAgencyAdmin(req, res);
  if (!ctx) return;
  const userId = String(req.body?.userId ?? "");
  if (!UUID_RE.test(userId)) return fail(res, 400, "invalid_input");
  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from("agency_members")
    .select("user_id")
    .eq("agency_id", ctx.agencyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!row) return fail(res, 404, "not_found");
  const { data } = await sb.auth.admin.getUserById(userId);
  const email = data?.user?.email;
  if (!email) return fail(res, 404, "not_found");
  const link = await passwordLink(sb, email);
  if (!link) return fail(res, 500, "link_failed");
  json(res, 200, { ok: true, link });
}

/** Cuántos admins quedan, para no dejar la inmobiliaria sin ninguno. */
async function adminCount(sb: ReturnType<typeof supabaseAdmin>, agencyId: string): Promise<number> {
  const { count } = await sb
    .from("agency_members")
    .select("user_id", { count: "exact", head: true })
    .eq("agency_id", agencyId)
    .eq("role", "admin");
  return count ?? 0;
}

/** POST /api/saas/set-role { userId, role } — cambia el rol de un integrante (solo admin). */
async function setRole(req: VercelRequest, res: VercelResponse) {
  if (!allowMethod(req, res, "POST")) return;
  const ctx = await requireAgencyAdmin(req, res);
  if (!ctx) return;
  const userId = String(req.body?.userId ?? "");
  const role = req.body?.role;
  if (!UUID_RE.test(userId) || !isMemberRole(role)) return fail(res, 400, "invalid_input");

  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from("agency_members")
    .select("role")
    .eq("agency_id", ctx.agencyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!row) return fail(res, 404, "not_found");
  if (row.role === "admin" && role !== "admin" && (await adminCount(sb, ctx.agencyId)) <= 1) {
    return fail(res, 409, "last_admin");
  }
  const { error } = await sb
    .from("agency_members")
    .update({ role })
    .eq("agency_id", ctx.agencyId)
    .eq("user_id", userId);
  if (error) return fail(res, 500, "server_error");
  json(res, 200, { ok: true });
}

/**
 * POST /api/saas/remove { userId } — saca a alguien del equipo (solo admin).
 * Borra la membresía, no la cuenta: lo que cargó queda en la inmobiliaria.
 */
async function remove(req: VercelRequest, res: VercelResponse) {
  if (!allowMethod(req, res, "POST")) return;
  const ctx = await requireAgencyAdmin(req, res);
  if (!ctx) return;
  const userId = String(req.body?.userId ?? "");
  if (!UUID_RE.test(userId)) return fail(res, 400, "invalid_input");
  if (userId === ctx.userId) return fail(res, 409, "cannot_remove_self");

  const sb = supabaseAdmin();
  const { error } = await sb.from("agency_members").delete().eq("agency_id", ctx.agencyId).eq("user_id", userId);
  if (error) return fail(res, 500, "server_error");
  json(res, 200, { ok: true });
}

export default routeByAction("saas", { signup, members, invite, "invite-link": inviteLink, "set-role": setRole, remove });
