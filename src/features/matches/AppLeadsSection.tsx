import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "@/data/store";
import { avatarGradient, initials, money, relativeTime } from "@/lib/format";
import type { Activity, Contact, Property } from "@/types/db";

/**
 * Interesados reales de la app PropMatch: «me gusta» (swipes) y matches
 * confirmados. Salen de las actividades que crea la importación de leads del
 * store (app_swipe_id / match_creado); los matches del CRM (búsqueda ×
 * propiedad) se muestran aparte en la misma pantalla.
 */
interface AppLead {
  key: string;
  contact: Contact;
  property: Property;
  /** Actividad del «me gusta» (para aceptar o rechazar). */
  like: Activity | null;
  matched: boolean;
  at: string;
  opportunityId: string | null;
}

const APP_MATCH_TITLE = "Match confirmado desde la app";

export function useAppLeads(): AppLead[] {
  const { activities, contactById, propertyById } = useStore();
  return useMemo(() => {
    const byKey = new Map<string, AppLead>();
    for (const a of activities) {
      const isLike = Boolean(a.app_swipe_id);
      const isMatch = a.type === "match_creado" && a.title === APP_MATCH_TITLE;
      if (!isLike && !isMatch) continue;
      const contact = contactById(a.contact_id);
      const property = propertyById(a.property_id);
      if (!contact || !property) continue;
      const key = `${contact.id}:${property.id}`;
      const lead: AppLead = byKey.get(key) ?? {
        key,
        contact,
        property,
        like: null,
        matched: false,
        at: a.created_at,
        opportunityId: a.opportunity_id ?? null,
      };
      if (isLike && !lead.like) lead.like = a;
      if (isMatch) lead.matched = true;
      if (a.created_at > lead.at) lead.at = a.created_at;
      lead.opportunityId ??= a.opportunity_id ?? null;
      byKey.set(key, lead);
    }
    return [...byKey.values()].sort((a, b) => b.at.localeCompare(a.at));
  }, [activities, contactById, propertyById]);
}

export function AppLeadsSection({ query }: { query: string }) {
  const navigate = useNavigate();
  const { respondSwipe } = useStore();
  const all = useAppLeads();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const leads = q ? all.filter((l) => `${l.contact.full_name} ${l.property.title}`.toLowerCase().includes(q)) : all;
  if (leads.length === 0) return null;

  const answer = async (lead: AppLead, action: "accepted" | "rejected") => {
    if (!lead.like) return;
    setBusy(lead.key);
    setError(null);
    const err = await respondSwipe(lead.like.id, action);
    setBusy(null);
    if (err) setError(err);
  };

  return (
    <section className="mt-6 px-4 md:px-8">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h2 className="text-base" style={{ color: "#1A1A1A", fontWeight: 800 }}>
          Desde la app PropMatch
        </h2>
        <span className="text-xs" style={{ color: "#6B7280" }}>
          Personas reales que pusieron «me gusta» o hicieron match con tus propiedades.
        </span>
      </div>
      {error && (
        <p className="mt-2 text-xs px-3 py-2 rounded-lg" style={{ background: "#FFF1F2", color: "#BE123C" }}>
          {error}
        </p>
      )}
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {leads.map((lead) => {
          const swipe = lead.like?.swipe_status;
          const status = lead.matched
            ? { text: "Match · pueden chatear", bg: "#DCFCE7", color: "#15803D" }
            : swipe === "rejected"
              ? { text: "Rechazado", bg: "#F3F4F6", color: "#6B7280" }
              : swipe === "accepted"
                ? { text: "Aceptado", bg: "#DCFCE7", color: "#15803D" }
                : { text: "Le gustó · esperando tu respuesta", bg: "#FEF3C7", color: "#B45309" };
          const pending = !lead.matched && swipe === "pending";
          const openContact = () => navigate(`/contactos/${lead.contact.id}`);
          return (
            <div key={lead.key} className="rounded-2xl border bg-white p-4" style={{ borderColor: "#E9E5DE" }}>
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  title="Ver ficha del cliente"
                  aria-label={`Ver la ficha de ${lead.contact.full_name}`}
                  onClick={openContact}
                  className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarGradient(lead.contact.full_name)} flex items-center justify-center text-white flex-shrink-0 hover:ring-2 hover:ring-violet-300`}
                  style={{ fontSize: "11px", fontWeight: 700 }}
                >
                  {initials(lead.contact.full_name)}
                </button>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={openContact}
                    className="block max-w-full text-left text-sm truncate hover:underline"
                    style={{ color: "#1A1A1A", fontWeight: 700 }}
                  >
                    {lead.contact.full_name}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/propiedades/${lead.property.id}`)}
                    className="block max-w-full text-left text-xs truncate hover:underline"
                    style={{ color: "#6B7280" }}
                  >
                    {lead.property.title} · {money(lead.property.price, lead.property.currency)}
                  </button>
                </div>
                <span className="text-[11px] flex-shrink-0" style={{ color: "#9CA3AF" }}>
                  {relativeTime(lead.at)}
                </span>
              </div>
              <span
                className="inline-block mt-3 text-xs px-2 py-0.5 rounded-md"
                style={{ background: status.bg, color: status.color, fontWeight: 600 }}
              >
                {status.text}
              </span>
              <div className="mt-3 flex flex-wrap gap-2">
                {pending && (
                  <>
                    <button
                      type="button"
                      disabled={busy === lead.key}
                      onClick={() => void answer(lead, "accepted")}
                      className="px-3 py-1.5 rounded-lg text-xs text-white disabled:opacity-50"
                      style={{ background: "var(--gradient-brand)", fontWeight: 700 }}
                    >
                      Aceptar
                    </button>
                    <button
                      type="button"
                      disabled={busy === lead.key}
                      onClick={() => void answer(lead, "rejected")}
                      className="px-3 py-1.5 rounded-lg text-xs border disabled:opacity-50"
                      style={{ borderColor: "#FECDD3", color: "#BE123C", fontWeight: 700 }}
                    >
                      Rechazar
                    </button>
                  </>
                )}
                {lead.matched && (
                  <button
                    type="button"
                    onClick={() => navigate("/inbox")}
                    className="px-3 py-1.5 rounded-lg text-xs border hover:bg-violet-50"
                    style={{ borderColor: "#E9E5DE", color: "#9B21FF", fontWeight: 700 }}
                  >
                    Ir al chat
                  </button>
                )}
                {lead.opportunityId && (
                  <button
                    type="button"
                    onClick={() => navigate("/oportunidades")}
                    className="px-3 py-1.5 rounded-lg text-xs border hover:bg-violet-50"
                    style={{ borderColor: "#E9E5DE", color: "#9B21FF", fontWeight: 700 }}
                  >
                    Ver oportunidad
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
