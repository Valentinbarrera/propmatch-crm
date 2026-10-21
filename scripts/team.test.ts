/**
 * Equipo: quién ve y quién escribe qué, e invitaciones. Piezas puras, sin red.
 * Correr con: npm run test:team   (Node >= 22.18 ejecuta TypeScript sin flags)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agentMayWrite,
  claimForAgent,
  contactRefs,
  isRestricted,
  parseInviteBody,
  visibleToAgent,
} from "../shared/crmVisibility.ts";

const ME = "u-me";
const OTHER = "u-other";
const none = new Set<string>();

test("solo el rol agente está limitado", () => {
  assert.equal(isRestricted("agente"), true);
  assert.equal(isRestricted("admin"), false);
  assert.equal(isRestricted(null), false);
});

test("el agente ve lo suyo y lo compartido, no lo de otro", () => {
  assert.equal(visibleToAgent({ kind: "contact", data: { owner_id: ME } }, ME, none), true);
  assert.equal(visibleToAgent({ kind: "contact", data: { owner_id: OTHER } }, ME, none), false);
  assert.equal(visibleToAgent({ kind: "contact", data: { owner_id: null } }, ME, none), false);
  for (const kind of ["opportunity", "event", "task"]) {
    assert.equal(visibleToAgent({ kind, data: { owner_id: OTHER } }, ME, none), false, kind);
    assert.equal(visibleToAgent({ kind, data: { owner_id: ME } }, ME, none), true, kind);
  }
  // Lo compartido lo ve toda la inmobiliaria.
  for (const kind of ["property", "photos", "profile", "agency", "app_offer", "app_visit_feedback"]) {
    assert.equal(visibleToAgent({ kind, data: { owner_id: OTHER } }, ME, none), true, kind);
  }
});

test("operaciones: responsable, co-agente o quien la creó", () => {
  assert.equal(visibleToAgent({ kind: "deal", data: { responsible_id: ME } }, ME, none), true);
  assert.equal(visibleToAgent({ kind: "deal", data: { responsible_id: OTHER, co_agent_id: ME } }, ME, none), true);
  assert.equal(visibleToAgent({ kind: "deal", data: { responsible_id: OTHER, created_by: ME } }, ME, none), true);
  assert.equal(visibleToAgent({ kind: "deal", data: { responsible_id: OTHER, created_by: OTHER } }, ME, none), false);
});

test("requisitos y actividad siguen al contacto", () => {
  const mine = new Set(["c1"]);
  assert.equal(visibleToAgent({ kind: "requirement", data: { contact_id: "c1" } }, ME, mine), true);
  assert.equal(visibleToAgent({ kind: "requirement", data: { contact_id: "c2" } }, ME, mine), false);
  assert.equal(visibleToAgent({ kind: "activity", data: { contact_id: "c1" } }, ME, mine), true);
  assert.equal(visibleToAgent({ kind: "activity", data: { contact_id: "c2", actor_id: ME } }, ME, mine), false);
  // Sin contacto, la actividad es de quien la hizo.
  assert.equal(visibleToAgent({ kind: "activity", data: { contact_id: null, actor_id: ME } }, ME, mine), true);
  assert.equal(visibleToAgent({ kind: "activity", data: { contact_id: null, actor_id: OTHER } }, ME, mine), false);
});

test("contactRefs junta los contactos referenciados sin repetir", () => {
  const refs = contactRefs([
    { kind: "requirement", data: { contact_id: "c1" } },
    { kind: "activity", data: { contact_id: "c1" } },
    { kind: "activity", data: { contact_id: null } },
    { kind: "contact", data: { contact_id: "ignorado" } },
    { kind: "deal", data: { contact_id: "ignorado" } },
  ]);
  assert.deepEqual(refs, ["c1"]);
});

test("claimForAgent pone al agente de dueño y nunca a nombre de otro", () => {
  const sinDueno = claimForAgent({ kind: "contact", data: { owner_id: null, full_name: "Ana" } }, ME);
  assert.equal(sinDueno?.data.owner_id, ME);
  assert.equal(sinDueno?.data.full_name, "Ana");
  assert.equal(claimForAgent({ kind: "task", data: { owner_id: ME } }, ME)?.data.owner_id, ME);
  assert.equal(claimForAgent({ kind: "event", data: { owner_id: OTHER } }, ME), null);
  assert.equal(claimForAgent({ kind: "deal", data: { responsible_id: null } }, ME)?.data.responsible_id, ME);
  assert.equal(claimForAgent({ kind: "deal", data: { responsible_id: OTHER } }, ME), null);
  // Lo compartido pasa tal cual.
  const prop = { kind: "property", data: { owner_agent_id: OTHER } };
  assert.equal(claimForAgent(prop, ME), prop);
});

test("agentMayWrite: no toca lo ajeno, sí lo propio y lo nuevo", () => {
  const mine = new Set(["c1"]);
  // Nuevo, sin dueño: queda suyo.
  assert.equal(agentMayWrite({ kind: "contact", data: { owner_id: null } }, undefined, ME, mine), "ok");
  // Existente de otro: se descarta (también las bajas).
  const ajeno = { kind: "contact", data: { owner_id: OTHER } };
  assert.equal(agentMayWrite({ kind: "contact", data: { owner_id: OTHER } }, ajeno, ME, mine), "skip");
  assert.equal(agentMayWrite({ kind: "contact", data: {}, deleted: true }, ajeno, ME, mine), "skip");
  // Existente suyo: puede editarlo y borrarlo.
  const propio = { kind: "contact", data: { owner_id: ME } };
  assert.equal(agentMayWrite({ kind: "contact", data: { owner_id: ME } }, propio, ME, mine), "ok");
  assert.equal(agentMayWrite({ kind: "contact", data: {}, deleted: true }, propio, ME, mine), "ok");
  // No puede pasárselo a otro.
  assert.equal(agentMayWrite({ kind: "contact", data: { owner_id: OTHER } }, propio, ME, mine), "skip");
  // Sin dueño en la base: lo puede tomar.
  assert.equal(
    agentMayWrite({ kind: "contact", data: { owner_id: ME } }, { kind: "contact", data: { owner_id: null } }, ME, mine),
    "ok",
  );
  // Requisitos: solo de contactos propios.
  assert.equal(agentMayWrite({ kind: "requirement", data: { contact_id: "c1" } }, undefined, ME, mine), "ok");
  assert.equal(agentMayWrite({ kind: "requirement", data: { contact_id: "c9" } }, undefined, ME, mine), "skip");
  // Lo compartido siempre pasa.
  assert.equal(agentMayWrite({ kind: "property", data: {} }, { kind: "property", data: {} }, ME, mine), "ok");
});

test("parseInviteBody valida mail, nombre y rol", () => {
  assert.deepEqual(parseInviteBody({ email: " Ana@Mail.com ", fullName: " Ana Pérez ", role: "agente" }), {
    email: "ana@mail.com",
    fullName: "Ana Pérez",
    role: "agente",
  });
  assert.equal(parseInviteBody({ email: "ana@mail.com", fullName: "Ana" })?.role, "agente");
  assert.equal(parseInviteBody({ email: "ana@mail.com", fullName: "Ana", role: "admin" })?.role, "admin");
  assert.equal(parseInviteBody({ email: "ana@mail.com", fullName: "Ana", role: "owner" }), null);
  assert.equal(parseInviteBody({ email: "no-es-mail", fullName: "Ana" }), null);
  assert.equal(parseInviteBody({ email: "ana@mail.com", fullName: "A" }), null);
  assert.equal(parseInviteBody(null), null);
});
