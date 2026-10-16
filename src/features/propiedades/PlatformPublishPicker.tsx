import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "@/data/store";
import { money } from "@/lib/format";
import { isSample } from "@/lib/samples";
import { SampleBadge } from "@/components/ui/SampleBadge";
import type { Property, PublicationChannel } from "@/types/db";
import type { ChannelInfo } from "./usePublications";
import { meliBlockReason } from "./meliTarget";

const STATUS_TEXT: Record<string, string> = {
  published: "Publicada",
  pending: "En cola",
  paused: "Pausada",
  error: "Con error",
  removed: "Finalizada",
  draft: "Borrador",
};

/**
 * Por qué una propiedad todavía no se puede publicar en el canal (`null` = lista).
 * Mercado Libre publica también propiedades que no están en la app (precio en
 * pesos o sin sincronizar): sube las fotos a la carpeta de la agencia (ver
 * meliTarget.ts); solo necesita que la cuenta esté vinculada a una inmobiliaria.
 * Facebook e Instagram siguen necesitando la propiedad en la app (fotos con
 * URL pública), y la app solo toma USD.
 */
export function publishBlockReason(p: Property, channel: PublicationChannel, agencyId?: string): string | null {
  if (isSample(p)) return "Es una propiedad de ejemplo: no se publica.";
  if (channel === "mercadolibre") return agencyId ? meliBlockReason(p, agencyId) : null;
  // Facebook e Instagram toman las fotos de su URL pública en la app.
  if ((channel === "facebook" || channel === "instagram") && !p.app_property_id) {
    return p.currency !== "USD"
      ? "Precio en pesos: por ahora solo se publican propiedades en USD."
      : "Todavía no está sincronizada con la app (guardala de nuevo con tu cuenta de la inmobiliaria).";
  }
  if ((channel === "facebook" || channel === "instagram") && p.status !== "disponible") {
    return "No está disponible: solo se publican propiedades disponibles.";
  }
  return null;
}

/**
 * «Publicar una propiedad» desde la tarjeta de una plataforma conectada: elegís
 * la propiedad y vas a su pantalla de publicación (/publicador/:id), donde está
 * el panel del canal.
 */
export function PlatformPublishPicker({
  info,
  statusOf,
  onClose,
}: {
  info: ChannelInfo;
  statusOf: (p: Property) => string | null;
  onClose: () => void;
}) {
  const { properties, agency } = useStore();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const { ready, blocked } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = properties.filter(
      (p) => !q || [p.title, p.zone, p.locality].filter(Boolean).join(" ").toLowerCase().includes(q),
    );
    const ready: Property[] = [];
    const blocked: { p: Property; reason: string }[] = [];
    for (const p of list) {
      const reason = publishBlockReason(p, info.channel, agency.id);
      if (reason) blocked.push({ p, reason });
      else ready.push(p);
    }
    return { ready, blocked };
  }, [properties, query, info.channel, agency.id]);

  const go = (p: Property) => {
    onClose();
    navigate(`/publicador/${p.id}`);
  };

  return (
    <div className="pm-backdrop fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(8, 11, 31,0.45)" }} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="picker-title"
        className="pm-modal w-full sm:max-w-lg max-h-[85vh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-white"
        style={{ boxShadow: "var(--shadow-card)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 border-b" style={{ borderColor: "#F0EDE6" }}>
          <h2 id="picker-title" className="text-base" style={{ color: "#1A1A1A", fontWeight: 800 }}>
            Publicar en {info.name}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
            Elegí la propiedad. En la pantalla siguiente revisás qué falta y publicás.
          </p>
          <label className="block mt-3">
            <span className="sr-only">Buscar propiedad</span>
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por título o zona"
              className="w-full min-h-11 px-3 rounded-xl border text-sm outline-none focus-visible:ring-4 focus-visible:ring-[#E9E5DE]"
              style={{ borderColor: "#DDD8CF" }}
            />
          </label>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-5">
          <section aria-labelledby="ready-h">
            <h3 id="ready-h" className="text-xs uppercase tracking-wide" style={{ color: "#15803D", fontWeight: 700 }}>
              Listas para publicar ({ready.length})
            </h3>
            {ready.length === 0 ? (
              <p className="text-sm mt-2" style={{ color: "#4B5563" }}>
                Ninguna propiedad está lista todavía. Mirá abajo qué le falta a cada una.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {ready.map((p) => {
                  const st = statusOf(p);
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => go(p)}
                        className="w-full text-left min-h-11 rounded-xl border px-3 py-2.5 flex items-center gap-3 hover:bg-violet-50"
                        style={{ borderColor: "#E9E5DE" }}
                      >
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm truncate" style={{ color: "#1A1A1A", fontWeight: 600 }}>
                            {p.title}
                          </span>
                          <span className="block text-xs" style={{ color: "#6B7280" }}>
                            {[p.zone, p.price != null ? money(p.price, p.currency) : null].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        {st && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "#F7F0FF", color: "#7C0BD8", fontWeight: 700 }}>
                            {STATUS_TEXT[st] ?? st}
                          </span>
                        )}
                        <span aria-hidden="true" style={{ color: "#9B21FF" }}>→</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {blocked.length > 0 && (
            <section aria-labelledby="blocked-h">
              <h3 id="blocked-h" className="text-xs uppercase tracking-wide" style={{ color: "#6B7280", fontWeight: 700 }}>
                Todavía no disponibles ({blocked.length})
              </h3>
              <ul className="mt-2 space-y-2">
                {blocked.map(({ p, reason }) => (
                  <li key={p.id} className="rounded-xl border px-3 py-2.5" style={{ borderColor: "#F3F4F6", background: "#FAFAFA" }}>
                    <p className="text-sm truncate" style={{ color: "#374151", fontWeight: 600 }}>
                      {p.title} <SampleBadge record={p} />
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
                      {reason}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="px-5 py-3 border-t flex justify-end" style={{ borderColor: "#F0EDE6" }}>
          <button type="button" onClick={onClose} className="min-h-11 px-4 rounded-xl text-sm border" style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 700 }}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
