import type { MetaConnection } from "./useMetaConnection";

const disabledStyle = { background: "#F3F4F6", color: "#4B5563", fontWeight: 600 };

/**
 * Botón de conexión de Facebook + Instagram (una sola conexión para las dos
 * tarjetas). Sin la aprobación de Meta queda deshabilitado con ese texto.
 */
export function MetaConnectButton({ meta }: { meta: MetaConnection }) {
  if (meta.approvalPending) {
    return (
      <button type="button" disabled className="flex-1 min-h-[44px] px-4 rounded-xl text-sm cursor-not-allowed" style={disabledStyle}>
        Requiere aprobación de Meta
      </button>
    );
  }
  if (meta.loading) {
    return (
      <button type="button" disabled className="flex-1 min-h-[44px] px-4 rounded-xl text-sm cursor-wait" style={disabledStyle}>
        Verificando…
      </button>
    );
  }
  if (!meta.configured) {
    return (
      <button type="button" disabled className="flex-1 min-h-[44px] px-4 rounded-xl text-sm cursor-not-allowed" style={disabledStyle}>
        Conectar · Próximamente
      </button>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-1.5 min-w-0">
      {meta.needsReauth && !meta.connected && (
        <p className="text-xs" style={{ color: "#BE123C", fontWeight: 700 }}>
          La conexión con Facebook venció: volvé a conectarla.
        </p>
      )}
      {meta.connected ? (
        <>
          <p className="text-xs" style={{ color: "#15803D", fontWeight: 700 }}>
            Página: {meta.pageName ?? "conectada"}
            {meta.instagramUsername ? ` · Instagram @${meta.instagramUsername}` : " · sin Instagram vinculado"}
          </p>
          {meta.isAdmin && (
            <button
              type="button"
              disabled={meta.busy}
              onClick={() => {
                if (window.confirm("¿Desconectar Facebook e Instagram? Lo ya publicado sigue publicado, pero no vas a poder publicar desde PropMatch hasta volver a conectar.")) {
                  void meta.disconnect();
                }
              }}
              className="min-h-[44px] px-4 rounded-xl text-sm border disabled:opacity-60"
              style={{ borderColor: "#FECDD3", color: "#BE123C", background: "white", fontWeight: 700 }}
            >
              Desconectar
            </button>
          )}
        </>
      ) : meta.isAdmin ? (
        <button
          type="button"
          disabled={meta.busy}
          onClick={() => void meta.connect()}
          className="min-h-[44px] px-4 rounded-xl text-sm text-white disabled:opacity-60"
          style={{ background: "#1877F2", fontWeight: 700 }}
        >
          {meta.busy ? "Conectando…" : meta.needsReauth ? "Reconectar con Facebook" : "Conectar con Facebook"}
        </button>
      ) : (
        <p className="text-xs" style={{ color: "#4B5563" }}>
          Pedile a un administrador de la inmobiliaria que conecte la Página.
        </p>
      )}
      {meta.pages && (
        <div role="group" aria-label="Elegí la Página" className="mt-1 rounded-xl border p-3" style={{ borderColor: "#DDD8CF" }}>
          <p className="text-xs mb-2" style={{ color: "#1A1A1A", fontWeight: 700 }}>
            Administrás varias Páginas: elegí cuál conectar (se abre Facebook de nuevo para confirmar).
          </p>
          <ul className="space-y-1.5">
            {meta.pages.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={meta.busy}
                  onClick={() => void meta.connect(p.id)}
                  className="w-full text-left min-h-[44px] px-3 rounded-lg border text-sm hover:bg-violet-50 disabled:opacity-60"
                  style={{ borderColor: "#E9E5DE", color: "#1A1A1A" }}
                >
                  <span style={{ fontWeight: 700 }}>{p.name}</span>
                  <span className="block text-xs" style={{ color: "#6B7280" }}>
                    {p.instagram ? `Instagram @${p.instagram}` : "Sin Instagram vinculado"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={meta.cancelPagePick} className="mt-2 text-xs underline" style={{ color: "#7C0BD8" }}>
            Cancelar
          </button>
        </div>
      )}
      {meta.notice && (
        <p role="status" className="text-xs" style={{ color: "#15803D" }}>
          {meta.notice}
        </p>
      )}
      {meta.error && (
        <p role="alert" className="text-xs" style={{ color: "#BE123C" }}>
          {meta.error}
        </p>
      )}
    </div>
  );
}
