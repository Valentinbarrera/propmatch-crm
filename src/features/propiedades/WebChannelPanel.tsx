import { useState } from "react";
import { useStore } from "@/data/store";
import { Card, Badge } from "@/components/ui/Card";
import { isSample } from "@/lib/samples";
import type { Property } from "@/types/db";
import { decodeExactGeo } from "../../../shared/publicSite";
import { previewUrl, sitePropertyUrl } from "@/features/sitio/siteUrl";
import type { ChannelState } from "./usePublications";

const INK = "#1A1A1A";

/**
 * «Mi web» por propiedad: mostrar u ocultar en la web pública y, si la
 * propiedad tiene coordenadas en el CRM, autorizar la ubicación exacta.
 */
export function WebChannelPanel({
  property,
  web,
  setWeb,
}: {
  property: Property;
  web: ChannelState;
  setWeb: (p: Property, opts: { visible: boolean; exact: { lat: number; lng: number } | null; url: string | null }) => Promise<boolean>;
}) {
  const { agency } = useStore();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const url = sitePropertyUrl(agency, property.app_property_id);
  const visible = web.status !== "removed";
  const exact = decodeExactGeo(web.externalId);
  const hasCoords = property.lat != null && property.lng != null;

  const blocked = isSample(property)
    ? "Es una propiedad de ejemplo: no aparece en tu web."
    : web.status === null
      ? "Todavía no está sincronizada con la app: cuando la guardes con tu cuenta de la inmobiliaria va a aparecer en tu web."
      : null;

  const save = async (next: { visible: boolean; exact: boolean }) => {
    setBusy(true);
    setMsg("");
    const ok = await setWeb(property, {
      visible: next.visible,
      exact: next.exact && hasCoords ? { lat: property.lat!, lng: property.lng! } : null,
      url,
    });
    setBusy(false);
    setMsg(ok ? "Guardado. Puede tardar hasta 5 minutos en verse en la web." : "No se pudo guardar. Probá de nuevo.");
  };

  const line =
    web.status === "published"
      ? { text: "Se muestra en tu web", bg: "#DCFCE7", fg: "#15803D" }
      : web.status === "removed"
        ? { text: "Oculta", bg: "#F3F4F6", fg: "#4B5563" }
        : web.status === "paused"
          ? { text: "No disponible: no se muestra", bg: "#FEF3C7", fg: "#92400E" }
          : { text: "Sin sincronizar", bg: "#F3F4F6", fg: "#4B5563" };

  return (
    <Card>
      <div className="px-5 py-4 border-b flex flex-wrap items-center gap-2" style={{ borderColor: "#F0EDE6" }}>
        <h3 className="text-base" style={{ color: INK, fontWeight: 700 }}>Mi web</h3>
        <Badge bg={line.bg} text={line.fg} size="xs">{line.text}</Badge>
      </div>
      <div className="p-5 flex flex-col gap-3">
        {blocked ? (
          <p className="text-sm" style={{ color: "#4B5563" }}>{blocked}</p>
        ) : (
          <>
            <label className="flex items-start gap-3 min-h-11 cursor-pointer">
              <input
                type="checkbox"
                checked={visible}
                disabled={busy}
                onChange={(e) => void save({ visible: e.target.checked, exact: !!exact })}
                className="w-5 h-5 mt-0.5"
                style={{ accentColor: "#9B21FF" }}
              />
              <span>
                <span className="block text-sm" style={{ color: INK, fontWeight: 700 }}>Mostrar en mi web</span>
                <span className="block text-xs" style={{ color: "#6B7280" }}>Solo aparecen las propiedades disponibles. Las vendidas, alquiladas o pausadas salen solas.</span>
              </span>
            </label>
            <label className="flex items-start gap-3 min-h-11 cursor-pointer" style={{ opacity: hasCoords ? 1 : 0.6 }}>
              <input
                type="checkbox"
                checked={!!exact}
                disabled={busy || !hasCoords || !visible}
                onChange={(e) => void save({ visible, exact: e.target.checked })}
                className="w-5 h-5 mt-0.5"
                style={{ accentColor: "#9B21FF" }}
              />
              <span>
                <span className="block text-sm" style={{ color: INK, fontWeight: 700 }}>Mostrar ubicación exacta en el mapa</span>
                <span className="block text-xs" style={{ color: "#6B7280" }}>
                  {hasCoords
                    ? "Por defecto la web muestra solo el barrio. Activalo si el propietario está de acuerdo."
                    : "Cargá la ubicación en el mapa de la propiedad para poder activarlo. Mientras tanto se muestra el barrio."}
                </span>
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              <a
                href={url ?? previewUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 min-h-11 inline-flex items-center rounded-xl text-sm border hover:bg-violet-50"
                style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 700 }}
              >
                {url ? "Ver en mi web" : "Ver vista previa"}
                <span className="sr-only"> (se abre en otra pestaña)</span>
              </a>
            </div>
          </>
        )}
        <p role="status" aria-live="polite" className={msg ? "text-xs" : "sr-only"} style={{ color: "#15803D" }}>{msg}</p>
      </div>
    </Card>
  );
}
