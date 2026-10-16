import { useState } from "react";
import { isSample } from "@/lib/samples";
import { SampleBadge } from "@/components/ui/SampleBadge";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, SectionHeader, Badge } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/states";
import { OpportunitiesIcon } from "@/components/ui/icons";
import { useStore } from "@/data/store";
import { avatarGradient, initials, money, relativeTime } from "@/lib/format";

/**
 * Ofertas reales hechas desde la app sobre las propiedades de la agencia.
 * Es de solo esto: aceptar/rechazar pega directo contra la app (RPC
 * `respond_offer`) — no hay "oferta de mentira" acá.
 */
export default function OfertasPage() {
  const navigate = useNavigate();
  const { appOffers, contactById, propertyById, respondOffer } = useStore();
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function handleRespond(appOfferId: string, action: "accept" | "reject") {
    setRespondingId(appOfferId);
    const error = await respondOffer(appOfferId, action);
    const sample = isSample(appOffers.find((o) => o.app_offer_id === appOfferId));
    setRespondingId(null);
    if (error) {
      setToast({ kind: "error", text: error });
    } else {
      setToast({
        kind: "ok",
        text: `${action === "accept" ? "Oferta aceptada." : "Oferta rechazada."}${sample ? " Oferta de ejemplo: no se envía a la app." : ""}`,
      });
    }
    setTimeout(() => setToast(null), 3500);
  }

  const sorted = [...appOffers].sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (a.status !== "pending" && b.status === "pending") return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const pendingCount = appOffers.filter((o) => o.status === "pending").length;

  return (
    <>
      <AppHeader
        title="Ofertas"
        subtitle="Ofertas reales hechas desde la app sobre tus propiedades."
      />

      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-8">
        <div className="mt-8 max-w-3xl">
          <Card>
            <SectionHeader
              inCard
              title="Todas las ofertas"
              subtitle={`${pendingCount} ${pendingCount === 1 ? "pendiente" : "pendientes"} · ${appOffers.length} en total`}
            />
            {sorted.length === 0 ? (
              <EmptyState
                compact
                icon={<OpportunitiesIcon size={22} color="#9B21FF" />}
                title="Todavía no llegó ninguna oferta"
                description="Cuando alguien haga una oferta real sobre una de tus propiedades, va a aparecer acá."
              />
            ) : (
              <div className="divide-y" style={{ borderColor: "#F0EDE6" }}>
                {sorted.map((offer) => {
                  const contact = contactById(offer.contact_id);
                  const property = propertyById(offer.property_id);
                  return (
                    <div key={offer.id} className="p-5 flex items-center gap-4">
                      <div
                        className={`w-10 h-10 rounded-full bg-gradient-to-br ${avatarGradient(contact?.full_name)} flex items-center justify-center text-white flex-shrink-0`}
                        style={{ fontSize: 12, fontWeight: 700 }}
                      >
                        {initials(contact?.full_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm hover:underline cursor-pointer inline-block"
                          style={{ color: "#1A1A1A", fontWeight: 700 }}
                          onClick={() => navigate(`/contactos/${offer.contact_id}`)}
                        >
                          {contact?.full_name ?? "Sin contacto"}
                        </p>{" "}
                        <SampleBadge record={offer} />
                        <p
                          className="text-xs mt-0.5 hover:underline cursor-pointer"
                          style={{ color: "#6B7280" }}
                          onClick={() => navigate(`/propiedades/${offer.property_id}`)}
                        >
                          {property?.title ?? "Sin propiedad"}
                        </p>
                        <p className="text-xs mt-1" style={{ color: "#6B7280" }}>
                          {relativeTime(offer.created_at)}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm mb-2" style={{ color: "#1A1A1A", fontWeight: 800 }}>
                          {money(offer.amount_usd, "USD")}
                        </p>
                        {offer.status === "accepted" ? (
                          <Badge bg="#F0FDF4" text="#15803D" border="#BBF7D0">
                            Aceptada
                          </Badge>
                        ) : offer.status === "rejected" ? (
                          <Badge bg="#FFF1F2" text="#BE123C" border="#FECDD3">
                            Rechazada
                          </Badge>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <button
                              disabled={respondingId === offer.app_offer_id}
                              onClick={() => handleRespond(offer.app_offer_id, "accept")}
                              className="text-xs px-3 py-1.5 rounded-lg text-white disabled:opacity-50"
                              style={{ background: "var(--gradient-brand)", fontWeight: 600 }}
                            >
                              {respondingId === offer.app_offer_id ? "..." : "Aceptar"}
                            </button>
                            <button
                              disabled={respondingId === offer.app_offer_id}
                              onClick={() => handleRespond(offer.app_offer_id, "reject")}
                              className="text-xs px-3 py-1.5 rounded-lg border disabled:opacity-50"
                              style={{ borderColor: "#E9E5DE", color: "#6B7280", fontWeight: 600 }}
                            >
                              Rechazar
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>

      {toast && (
        <div
          className="pm-toast fixed bottom-6 right-6 z-50 rounded-2xl px-5 py-4 max-w-sm"
          style={{
            background: "white",
            border: `1px solid ${toast.kind === "ok" ? "#BBF7D0" : "#FECDD3"}`,
            boxShadow: "var(--shadow-pop)",
          }}
          role="status"
        >
          <p className="text-sm" style={{ color: toast.kind === "ok" ? "#15803D" : "#BE123C", fontWeight: 700 }}>
            {toast.text}
          </p>
        </div>
      )}
    </>
  );
}
