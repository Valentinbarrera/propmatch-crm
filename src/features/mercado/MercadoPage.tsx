import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { ZONES } from "@/data/seed";
import { zoneOptions } from "@/lib/market";
import { useMarket } from "./useMarket";
import { Tasador } from "./Tasador";
import { ZoneStats } from "./ZoneStats";
import { Cartera } from "./Cartera";
import { MercadoIcon } from "./MercadoIcon";

/**
 * Mercado: "¿cuánto pedir?", estadísticas por zona y tu cartera frente a
 * similares. Datos: tu inventario + propiedades activas de la app PropMatch
 * (con sesión). Sin portales externos ni datos inventados.
 */
export default function MercadoPage() {
  const navigate = useNavigate();
  const { app, loading, appListings, inventory, agencyId, pool, portfolio, retry } = useMarket();
  const zones = useMemo(() => zoneOptions(ZONES, pool), [pool]);
  const empty = !loading && pool.length === 0 && portfolio.length === 0;

  return (
    <>
      <AppHeader title="Mercado" subtitle="Cuánto pedir y cómo están los precios en tus zonas">
        <button
          type="button"
          onClick={retry}
          disabled={loading}
          className="min-h-11 px-4 rounded-xl text-sm border bg-white hover:bg-violet-50 disabled:opacity-60"
          style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 700 }}
        >
          {loading ? "Actualizando…" : "Actualizar"}
        </button>
      </AppHeader>

      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 pb-10">
        <div className="max-w-6xl mx-auto space-y-6">
          {app.status === "error" && app.reason === "no_session" && (
            <div role="status" className="rounded-xl px-4 py-3 text-sm border" style={{ background: "#FFFBEB", borderColor: "#FDE68A", color: "#92400E" }}>
              <strong>Sin datos del mercado de la app: se usa tu inventario.</strong> No hay una sesión de PropMatch abierta (por ejemplo, en la
              demo), así que no se leen las propiedades activas de la app.
            </div>
          )}
          {app.status === "error" && app.reason === "query" && (
            <div role="alert" className="rounded-xl px-4 py-3 text-sm border flex flex-wrap items-center justify-between gap-3" style={{ background: "#FFF1F2", borderColor: "#FECDD3", color: "#9F1239" }}>
              <span>
                <strong>No se pudo leer el mercado de la app.</strong> Mientras tanto, todo se calcula solo con tu inventario.
              </span>
              <button
                type="button"
                onClick={retry}
                className="min-h-11 px-4 rounded-xl text-sm border bg-white hover:bg-rose-50"
                style={{ borderColor: "#FECDD3", color: "#BE123C", fontWeight: 700 }}
              >
                Reintentar
              </button>
            </div>
          )}

          {loading ? (
            <LoadingState />
          ) : empty ? (
            <div className="rounded-2xl border" style={{ borderColor: "#E9E5DE" }}>
              <EmptyState
                icon={<MercadoIcon size={24} color="#9B21FF" />}
                title="Todavía no hay datos de mercado"
                description="Las estadísticas y el tasador se arman con tus propiedades disponibles en USD (y, con sesión, con las activas de la app PropMatch). Cargá propiedades con zona y precio para empezar."
                action={{ label: "Cargar propiedad", onClick: () => navigate("/propiedades/nueva") }}
              />
            </div>
          ) : (
            <>
              <Tasador zones={zones} inventory={inventory} appListings={appListings} agencyId={agencyId} />
              <ZoneStats pool={pool} appAvailable={appListings != null} />
              <Cartera rows={portfolio} />
            </>
          )}
        </div>
      </div>
    </>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando datos de mercado">
      <Skeleton className="h-64" />
      <Skeleton className="h-80" />
      <Skeleton className="h-56" />
    </div>
  );
}
