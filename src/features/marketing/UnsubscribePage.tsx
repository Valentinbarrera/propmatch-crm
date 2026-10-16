import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { looksLikeUnsubToken, type UnsubscribeScope } from "../../../shared/marketing";

/**
 * Página PÚBLICA de baja (/baja/:token), sin login ni layout del CRM.
 * El token va firmado por el servidor; acá solo se muestra y se confirma.
 * (El botón "Desuscribirse" del cliente de correo usa el POST one-click
 * directo, sin pasar por esta página.)
 */
interface Info {
  agencyName: string | null;
  channel: "email" | "whatsapp";
  target: string;
  unsubscribed: UnsubscribeScope | null;
}

export default function UnsubscribePage() {
  const { token = "" } = useParams();
  const valid = looksLikeUnsubToken(token);
  const [info, setInfo] = useState<Info | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "done" | "error" | "invalid">(valid ? "loading" : "invalid");
  const [scope, setScope] = useState<UnsubscribeScope | null>(null);

  useEffect(() => {
    if (!valid) return;
    let alive = true;
    fetch(`/api/marketing/unsubscribe?t=${encodeURIComponent(token)}&format=json`, { cache: "no-store" })
      .then(async (r) => {
        if (!alive) return;
        if (r.status === 400 || r.status === 404) return setState("invalid");
        if (!r.ok || !r.headers.get("content-type")?.includes("json")) return setState("error");
        const j = (await r.json()) as Info;
        setInfo(j);
        setState(j.unsubscribed ? "done" : "ready");
        if (j.unsubscribed) setScope(j.unsubscribed);
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [token, valid]);

  async function confirm(s: UnsubscribeScope) {
    setState("loading");
    try {
      const r = await fetch("/api/marketing/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t: token, scope: s }),
      });
      if (!r.ok) throw new Error();
      setScope(s);
      setState("done");
    } catch {
      setState("error");
    }
  }

  const who = info?.agencyName ?? "esta inmobiliaria";
  return (
    <main className="min-h-screen flex items-center justify-center p-4" style={{ background: "#F7F0FF" }}>
      <div className="w-full max-w-md rounded-2xl p-6 sm:p-8 text-center" style={{ background: "white", boxShadow: "0 10px 30px rgba(8, 11, 31,0.08)" }}>
        {state === "loading" && <p style={{ color: "#6B7280" }}>Un momento…</p>}
        {state === "invalid" && (
          <>
            <h1 className="text-xl mb-2" style={{ color: "#1A1A1A", fontWeight: 800 }}>
              Link inválido
            </h1>
            <p className="text-sm" style={{ color: "#4B5563" }}>
              Este link de baja no es válido. Si querés dejar de recibir mensajes, respondé el email o escribile directamente a la inmobiliaria.
            </p>
          </>
        )}
        {state === "error" && (
          <>
            <h1 className="text-xl mb-2" style={{ color: "#1A1A1A", fontWeight: 800 }}>
              No pudimos procesarlo
            </h1>
            <p className="text-sm" style={{ color: "#4B5563" }}>
              Probá de nuevo en unos minutos. Si sigue fallando, respondé el email pidiendo la baja: es tu derecho y la tienen que procesar igual.
            </p>
          </>
        )}
        {state === "ready" && info && (
          <>
            <h1 className="text-xl mb-2" style={{ color: "#1A1A1A", fontWeight: 800 }}>
              ¿No querés recibir más mensajes?
            </h1>
            <p className="text-sm mb-5" style={{ color: "#4B5563" }}>
              Vas a dejar de recibir novedades de <b>{who}</b> en {info.target}.
            </p>
            <div className="space-y-2">
              <button
                onClick={() => confirm(info.channel)}
                className="w-full py-3 rounded-xl text-white"
                style={{ background: "#9B21FF", fontWeight: 700 }}
              >
                No quiero recibir más {info.channel === "email" ? "emails" : "mensajes de WhatsApp"}
              </button>
              <button onClick={() => confirm("all")} className="w-full py-3 rounded-xl border" style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 600 }}>
                No quiero recibir nada por ningún canal
              </button>
            </div>
          </>
        )}
        {state === "done" && (
          <>
            <h1 className="text-xl mb-2" style={{ color: "#1A1A1A", fontWeight: 800 }}>
              Listo, te dimos de baja
            </h1>
            <p className="text-sm" style={{ color: "#4B5563" }}>
              {scope === "all"
                ? `No vas a recibir más mensajes promocionales de ${who} por ningún canal.`
                : `No vas a recibir más ${scope === "whatsapp" ? "mensajes de WhatsApp" : "emails"} promocionales de ${who}.`}
            </p>
            <p className="text-xs mt-4" style={{ color: "#9CA3AF" }}>
              Ley 25.326, art. 27, inc. 3: podés pedir el retiro o bloqueo de tus datos en cualquier momento.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
