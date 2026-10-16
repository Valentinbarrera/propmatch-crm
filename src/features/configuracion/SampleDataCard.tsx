import { useMemo } from "react";
import { Card, SectionHeader } from "@/components/ui/Card";
import { SampleBadge } from "@/components/ui/SampleBadge";
import { useStore } from "@/data/store";
import { hasSamples } from "@/data/samples";
import { isSample } from "@/lib/samples";

/**
 * Configuración › Datos de ejemplo: el interruptor entre "ver ejemplos" y
 * "usar mis datos reales". Archivo propio para no pisar las secciones que
 * agregan otras ramas (Proppi, Inbox).
 */
export function SampleDataCard({ onDone }: { onDone?: (msg: string) => void }) {
  const store = useStore();
  const { isDemo, hideSamples, showSamples } = store;
  const visible = hasSamples(store);

  const counts = useMemo(
    () => ({
      properties: store.properties.filter(isSample).length,
      contacts: store.contacts.filter(isSample).length,
      opportunities: store.opportunities.filter(isSample).length,
      deals: store.deals.filter(isSample).length,
      events: store.events.filter(isSample).length,
      offers: store.appOffers.filter(isSample).length,
    }),
    [store.properties, store.contacts, store.opportunities, store.deals, store.events, store.appOffers],
  );

  const useReal = () => {
    if (!window.confirm("Se van a quitar todos los datos de ejemplo y lo que depende de ellos. Lo que cargaste vos y lo que vino de la app se queda.")) return;
    hideSamples();
    onDone?.("Listo: estás viendo solo tus datos reales");
  };

  const bringBack = () => {
    showSamples();
    onDone?.("Datos de ejemplo agregados otra vez");
  };

  return (
    <Card>
      <SectionHeader inCard title="Datos de ejemplo" subtitle={visible ? "Mostrando ejemplos" : "Solo tus datos reales"} />
      <div className="p-5 flex flex-col gap-4">
        <p className="text-sm" style={{ color: "#374151" }}>
          Los datos de ejemplo llenan el CRM para que veas cómo funciona: propiedades, contactos, oportunidades,
          operaciones, ofertas y agenda, todos marcados con <SampleBadge show size="xs" />. Viven solo en este
          navegador: nunca se sincronizan con la app, no se publican en portales ni se le mandan a nadie.
        </p>

        {visible && (
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs" style={{ color: "#6B7280" }}>
            <li><strong style={{ color: "#1A1A1A" }}>{counts.properties}</strong> propiedades</li>
            <li><strong style={{ color: "#1A1A1A" }}>{counts.contacts}</strong> contactos</li>
            <li><strong style={{ color: "#1A1A1A" }}>{counts.opportunities}</strong> oportunidades</li>
            <li><strong style={{ color: "#1A1A1A" }}>{counts.deals}</strong> operaciones</li>
            <li><strong style={{ color: "#1A1A1A" }}>{counts.offers}</strong> ofertas</li>
            <li><strong style={{ color: "#1A1A1A" }}>{counts.events}</strong> eventos de agenda</li>
          </ul>
        )}

        {isDemo ? (
          <p className="text-sm px-4 py-3 rounded-xl" style={{ background: "var(--color-lavender)", color: "var(--color-lilac-text)", fontWeight: 600 }}>
            Estás en la demo: acá los ejemplos siempre están. Entrá con tu cuenta para trabajar con tus datos reales.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {visible ? (
              <button
                type="button"
                onClick={useReal}
                className="min-h-[44px] px-4 rounded-xl text-sm text-white transition-all hover:opacity-90"
                style={{ background: "var(--color-brand-purple)", fontWeight: 700 }}
              >
                Usar mis datos reales
              </button>
            ) : (
              <button
                type="button"
                onClick={bringBack}
                className="min-h-[44px] px-4 rounded-xl text-sm border transition-all hover:bg-violet-50"
                style={{ borderColor: "var(--color-lilac)", color: "var(--color-brand-purple)", fontWeight: 700, background: "white" }}
              >
                Mostrar ejemplos otra vez
              </button>
            )}
            <span className="text-xs" style={{ color: "#6B7280" }}>
              {visible
                ? "Quita solo los ejemplos. Podés volver a mostrarlos cuando quieras."
                : "Se agregan sin duplicar y sin tocar lo tuyo."}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
