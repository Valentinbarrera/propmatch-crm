import { routeByAction } from "./_lib/router.js";
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
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

export default routeByAction("saas", { signup });
