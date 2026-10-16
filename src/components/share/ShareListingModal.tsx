import { useEffect, useMemo, useState } from "react";
import { isSample } from "@/lib/samples";
import { SampleNotice } from "@/components/ui/SampleBadge";
import { useStore } from "@/data/store";
import { buildSharedListing, listingUrl, localOnlyPhotos } from "@/lib/share";
import { avatarGradient, initials, relativeTime } from "@/lib/format";
import { lastSentAbout } from "@/lib/ownerReport";
import type { Contact, Property } from "@/types/db";
import { WhatsAppButton, WhatsAppModal } from "./WhatsAppModal";

/**
 * Compartir la ficha de una propiedad: copiar el link, abrirla, o mandarla
 * directo por WhatsApp a los contactos que matchean (lo más común: "entró
 * esta casa, ¿a quién se la paso?").
 */
export function ShareListingModal({ property, onClose }: { property: Property; onClose: () => void }) {
  const { agency, photos, matches, activities, contactById, profileById } = useStore();
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sendTo, setSendTo] = useState<Contact | null>(null);

  const propertyPhotos = photos[property.id] ?? [];
  const skipped = localOnlyPhotos(propertyPhotos);

  useEffect(() => {
    let alive = true;
    listingUrl(buildSharedListing(property, propertyPhotos, agency, profileById(property.owner_agent_id))).then(
      (u) => alive && setUrl(u),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property, agency]);

  useEffect(() => {
    if (sendTo) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, sendTo]);

  const interested = useMemo(
    () =>
      matches
        .filter((m) => m.property_id === property.id)
        .map((m) => ({ match: m, contact: contactById(m.contact_id) }))
        .filter((r): r is { match: typeof r.match; contact: Contact } => !!r.contact)
        // Primero a quienes todavía no se les mandó.
        .sort(
          (a, b) =>
            Number(!!lastSentAbout(activities, a.contact.id, property.id)) -
              Number(!!lastSentAbout(activities, b.contact.id, property.id)) || b.match.score - a.match.score,
        )
        .slice(0, 10),
    [matches, property.id, contactById, activities],
  );

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso de portapapeles: el link queda visible para copiarlo a mano.
    }
  }

  if (sendTo) {
    return <WhatsAppModal contact={sendTo} property={property} onClose={() => setSendTo(null)} />;
  }

  return (
    <div
      className="pm-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      style={{ background: "rgba(8, 11, 31,0.35)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Compartir ficha"
    >
      <div
        className="pm-modal rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
        style={{ background: "white", boxShadow: "var(--shadow-pop)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b flex items-center gap-3" style={{ borderColor: "#E9E5DE", background: "#FAF8F5" }}>
          <div className="flex-1 min-w-0">
            <p className="text-lg tracking-tight" style={{ color: "#1A1A1A", fontWeight: 800 }}>
              Compartir ficha
            </p>
            <p className="text-xs mt-0.5 truncate" style={{ color: "#6B7280" }}>
              {property.title}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-violet-50"
            style={{ color: "#6B7280", fontSize: 20, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {isSample(property) && (
            <SampleNotice>Es una propiedad de ejemplo: la ficha sirve para probar, no la compartas con clientes reales.</SampleNotice>
          )}
          <div>
            <div className="flex gap-2">
              <input
                readOnly
                value={url ?? "Armando link…"}
                onFocus={(e) => e.target.select()}
                className="flex-1 min-w-0 px-3 py-2.5 rounded-xl text-xs border outline-none text-[#6B7280] border-[#E9E5DE] bg-[#FAF8F5] focus-visible:ring-2 focus-visible:ring-[#9B21FF]"
                aria-label="Link de la ficha"
              />
              <button
                onClick={copy}
                disabled={!url}
                className="px-4 py-2.5 rounded-xl text-sm text-white transition-all hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
                style={{ background: copied ? "#15803D" : "var(--gradient-brand)", fontWeight: 600 }}
              >
                {copied ? "✓ Copiado" : "Copiar link"}
              </button>
            </div>
            <div className="flex items-center justify-between mt-2 gap-3">
              <p className="text-xs" style={{ color: skipped ? "#B45309" : "#6B7280" }}>
                {skipped
                  ? `${skipped} ${skipped === 1 ? "foto subida desde la compu no entra" : "fotos subidas desde la compu no entran"} hasta tener servidor de fotos.`
                  : "Sin comisión, propietario ni altura de la calle."}
              </p>
              {url && (
                <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs whitespace-nowrap hover:underline" style={{ color: "#9B21FF", fontWeight: 600 }}>
                  Ver ficha ↗
                </a>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs uppercase mb-2.5" style={{ color: "#9B21FF", fontWeight: 700, letterSpacing: "0.1em" }}>
              Mandar a quienes matchean
            </p>
            {interested.length === 0 ? (
              <p className="text-sm" style={{ color: "#6B7280" }}>
                Todavía no hay contactos que busquen algo así.
              </p>
            ) : (
              <div className="space-y-1">
                {interested.map(({ match, contact }) => (
                  <div key={match.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-violet-50">
                    <div
                      className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarGradient(contact.full_name)} flex items-center justify-center text-xs text-white flex-shrink-0`}
                      style={{ fontWeight: 700 }}
                    >
                      {initials(contact.full_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate" style={{ color: "#1A1A1A", fontWeight: 600 }}>
                        {contact.full_name}
                      </p>
                      <p className="text-xs" style={{ color: "#6B7280" }}>
                        {Math.round(match.score)}% de match{contact.phone ? "" : " · sin teléfono"}
                        {(() => {
                          const sent = lastSentAbout(activities, contact.id, property.id);
                          return sent ? (
                            <span style={{ color: "#15803D", fontWeight: 600 }}> · ✓ avisado {relativeTime(sent.created_at).toLowerCase()}</span>
                          ) : null;
                        })()}
                      </p>
                    </div>
                    <WhatsAppButton compact label={`WhatsApp a ${contact.full_name}`} onClick={() => setSendTo(contact)} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
