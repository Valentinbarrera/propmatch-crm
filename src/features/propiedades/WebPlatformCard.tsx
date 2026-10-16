import { useId, useState } from "react";
import { useStore } from "@/data/store";
import { Card, Badge } from "@/components/ui/Card";
import { embedCode, previewUrl, siteUrl } from "@/features/sitio/siteUrl";
import { WEB_CHANNEL } from "./usePublications";
import { SendMyWebButton } from "@/features/branding/SendMyWeb";

const INK = "#1A1A1A";

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Tarjeta de la plataforma «Mi web» en el multipublicador: link a la web
 * pública, copiar link, código de inserción (iframe) y feed para integradores.
 */
export function WebPlatformCard({
  counts,
  onViewAds,
}: {
  counts: { visible: number; hidden: number; unavailable: number; unsynced: number };
  onViewAds: () => void;
}) {
  const { agency } = useStore();
  const url = siteUrl(agency);
  const [msg, setMsg] = useState("");
  const [showEmbed, setShowEmbed] = useState(false);
  const embedId = useId();
  const code = url ? embedCode(url, `Propiedades de ${agency.name}`) : "";
  const feed = url ? `${window.location.origin}/api/web/feed?slug=${encodeURIComponent(url.split("/sitio/")[1])}` : "";

  const flash = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(""), 3500);
  };

  return (
    <Card padded>
      <div className="flex items-start gap-3">
        <span className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-sm" style={{ background: WEB_CHANNEL.color, color: "white", fontWeight: 800 }} aria-hidden="true">
          {WEB_CHANNEL.short}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm" style={{ color: INK, fontWeight: 700 }}>Mi web</h3>
          <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
            Tu catálogo en una página propia, sin portales: se actualiza solo con tus propiedades disponibles.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3">
        <Badge bg={url ? "#DCFCE7" : "#F3F4F6"} text={url ? "#15803D" : "#4B5563"}>{url ? "Activa" : "Solo vista previa"}</Badge>
      </div>
      <p className="text-xs mt-2" style={{ color: "#4B5563" }}>
        {counts.visible} en la web · {counts.hidden} ocultas · {counts.unavailable} no disponibles
        {counts.unsynced > 0 ? ` · ${counts.unsynced} sin sincronizar` : ""}
      </p>
      {!url && (
        <p className="text-xs mt-2" style={{ color: "#4B5563" }}>
          La web pública se activa con la cuenta de tu inmobiliaria. Mientras tanto podés ver cómo queda.
        </p>
      )}

      <div className="flex flex-col sm:flex-row gap-2 mt-3">
        <a
          href={url ?? previewUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 min-h-[44px] px-4 rounded-xl text-sm text-white flex items-center justify-center"
          style={{ background: "var(--gradient-brand)", fontWeight: 700 }}
        >
          {url ? "Ver mi web" : "Ver vista previa"}
          <span className="sr-only"> (se abre en otra pestaña)</span>
        </a>
        <button
          type="button"
          onClick={onViewAds}
          className="flex-1 min-h-[44px] px-4 rounded-xl text-sm border bg-white"
          style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 700 }}
        >
          Ver mis avisos
        </button>
      </div>
      <div className="flex mt-2">
        <SendMyWebButton variant="primary" />
      </div>

      {url && (
        <>
          <div className="flex flex-col sm:flex-row gap-2 mt-2">
            <button
              type="button"
              onClick={async () => flash((await copy(url)) ? "Link copiado." : "No pudimos copiar: seleccioná el link y copialo a mano.")}
              className="flex-1 min-h-[44px] px-4 rounded-xl text-sm border bg-white"
              style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 700 }}
            >
              Copiar link
            </button>
            <button
              type="button"
              aria-expanded={showEmbed}
              aria-controls={embedId}
              onClick={() => setShowEmbed((v) => !v)}
              className="flex-1 min-h-[44px] px-4 rounded-xl text-sm border bg-white"
              style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 700 }}
            >
              Insertar en mi sitio
            </button>
          </div>
          <p className="text-xs mt-2 break-all" style={{ color: "#6B7280" }}>{url}</p>
          <div id={embedId} hidden={!showEmbed} className="mt-3">
            <label htmlFor={`${embedId}-code`} className="text-xs" style={{ color: INK, fontWeight: 700 }}>
              Pegá este código en tu sitio (WordPress: bloque «HTML personalizado»; Wix: «Insertar código»):
            </label>
            <textarea
              id={`${embedId}-code`}
              readOnly
              value={code}
              rows={4}
              onFocus={(e) => e.currentTarget.select()}
              className="mt-1 w-full rounded-lg border p-2 text-xs font-mono"
              style={{ borderColor: "#DDD8CF", color: INK }}
            />
            <button
              type="button"
              onClick={async () => flash((await copy(code)) ? "Código copiado." : "No pudimos copiar: seleccioná el código y copialo a mano.")}
              className="mt-1 min-h-[44px] px-4 rounded-xl text-sm border bg-white"
              style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 700 }}
            >
              Copiar código
            </button>
            <p className="text-xs mt-2" style={{ color: "#6B7280" }}>
              ¿Tenés un desarrollador? También hay un{" "}
              <a href={feed} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "#7C0BD8" }}>
                feed JSON con tus propiedades
              </a>
              .
            </p>
          </div>
        </>
      )}
      <p role="status" aria-live="polite" className={msg ? "text-xs mt-2" : "sr-only"} style={{ color: "#15803D", fontWeight: 600 }}>
        {msg}
      </p>
    </Card>
  );
}
