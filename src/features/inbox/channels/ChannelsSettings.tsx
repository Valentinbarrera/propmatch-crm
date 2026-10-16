import { useCallback, useEffect, useState } from "react";
import { Card, SectionHeader } from "@/components/ui/Card";
import { inboxApi, type ChannelAccount } from "@/lib/inbox/api";
import { launchMessagingLogin, launchWhatsAppSignup, metaEnv, SignupCancelled } from "@/lib/inbox/metaSdk";
import { SOURCE_META, SourceIcon } from "./channelMeta";

interface Status {
  configured: { core: boolean; meta: boolean; messaging: boolean };
  accounts: ChannelAccount[];
  isAdmin: boolean;
}

const EMPTY: Status = { configured: { core: false, meta: false, messaging: false }, accounts: [], isAdmin: false };

const ONBOARD_ERRORS: Record<string, string> = {
  number_in_use: "Ese número ya está conectado en otra inmobiliaria.",
  onboard_exchange_failed: "Meta no aceptó la autorización (puede haber vencido). Probá de nuevo.",
  onboard_register_failed: "No se pudo registrar el número en la API de WhatsApp.",
  onboard_subscribe_failed: "No se pudo activar la recepción de mensajes para ese número.",
  forbidden: "Solo los administradores de la inmobiliaria pueden conectar canales.",
  messaging_disabled: "Instagram y Messenger todavía no están habilitados.",
  no_pages: "Tu usuario de Facebook no administra ninguna Página.",
  account_in_use: "Esa Página o cuenta ya está conectada en otra inmobiliaria.",
};

function Pill({ tone, children }: { tone: "ok" | "warn" | "muted" | "bad"; children: React.ReactNode }) {
  const s = {
    ok: { background: "#DCFCE7", color: "#166534" },
    warn: { background: "#FEF3C7", color: "#92400E" },
    muted: { background: "#F7F0FF", color: "#6B7280" },
    bad: { background: "#FEE2E2", color: "#991B1B" },
  }[tone];
  return (
    <span className="text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap" style={{ ...s, fontWeight: 700 }}>
      {children}
    </span>
  );
}

/**
 * Configuración → Canales: conectar WhatsApp (Embedded Signup con
 * coexistencia), Instagram y Messenger. Si faltan variables de entorno o la
 * base del CRM, muestra "Falta configurar" en vez de romper.
 */
export function ChannelsSettings() {
  const [st, setSt] = useState<Status>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [pages, setPages] = useState<{ id: string; name: string; instagram: string | null }[] | null>(null);

  const refresh = useCallback(async () => {
    const r = await inboxApi<Status>("/api/inbox/channels");
    setSt(r.ok && r.data ? r.data : EMPTY);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Desde el Inbox se llega con /configuracion#canales.
  useEffect(() => {
    if (window.location.hash === "#canales") document.getElementById("canales")?.scrollIntoView({ block: "start" });
  }, [loading]);

  const waClientReady = !!metaEnv.appId && !!metaEnv.waConfigId;
  const waReady = waClientReady && st.configured.meta;
  const msgReady = metaEnv.messagingEnabled && !!metaEnv.appId && !!metaEnv.messagingConfigId && st.configured.messaging;
  const accountsOf = (ch: string) => st.accounts.filter((a) => a.channel === ch);

  async function connectWhatsApp(coexistence: boolean) {
    setMsg(null);
    setBusy(coexistence ? "wa_coex" : "wa_new");
    try {
      const r0 = await launchWhatsAppSignup({ coexistence });
      const r = await inboxApi<{ ok: boolean; warnings: string[] }>("/api/whatsapp/onboard", { method: "POST", body: r0 });
      if (!r.ok) throw new Error(r.error ?? "error");
      const w = r.data?.warnings ?? [];
      setMsg({
        tone: "ok",
        text: w.includes("history_sync_failed")
          ? "WhatsApp conectado. No se pudo pedir el historial: los chats nuevos sí van a entrar."
          : "WhatsApp conectado. Los mensajes nuevos van a aparecer en el Inbox.",
      });
      await refresh();
    } catch (e) {
      if (e instanceof SignupCancelled) setMsg({ tone: "bad", text: "Se canceló la conexión antes de terminar." });
      else setMsg({ tone: "bad", text: ONBOARD_ERRORS[(e as Error).message] ?? "No se pudo conectar WhatsApp. Probá de nuevo." });
    } finally {
      setBusy(null);
    }
  }

  async function connectMessaging(pageId?: string) {
    setMsg(null);
    setBusy("meta");
    try {
      const code = await launchMessagingLogin();
      const r = await inboxApi<{ ok: boolean; choosePage?: typeof pages; instagramMissing?: boolean }>("/api/meta/connect", {
        method: "POST",
        body: { code, pageId },
      });
      if (!r.ok) throw new Error(r.error ?? "error");
      if (r.data?.choosePage) {
        setPages(r.data.choosePage);
        return;
      }
      setPages(null);
      setMsg({
        tone: "ok",
        text: r.data?.instagramMissing
          ? "Messenger conectado. Esa Página no tiene una cuenta profesional de Instagram vinculada."
          : "Instagram y Messenger conectados.",
      });
      await refresh();
    } catch (e) {
      if (e instanceof SignupCancelled) setMsg({ tone: "bad", text: "Se canceló la conexión." });
      else setMsg({ tone: "bad", text: ONBOARD_ERRORS[(e as Error).message] ?? "No se pudo conectar. Probá de nuevo." });
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(a: ChannelAccount) {
    if (!window.confirm(`¿Desconectar ${SOURCE_META[a.channel].label}${a.display_phone ? ` (${a.display_phone})` : ""}? Dejás de recibir mensajes en el CRM.`)) return;
    setBusy(a.id);
    const r = await inboxApi("/api/inbox/channels", { method: "POST", body: { action: "disconnect", id: a.id } });
    setBusy(null);
    setMsg(r.ok ? { tone: "ok", text: "Canal desconectado." } : { tone: "bad", text: "No se pudo desconectar." });
    await refresh();
  }

  async function syncTemplates(a: ChannelAccount) {
    setBusy(a.id);
    const r = await inboxApi<{ count: number }>("/api/inbox/channels", { method: "POST", body: { action: "sync_templates", id: a.id } });
    setBusy(null);
    setMsg(r.ok ? { tone: "ok", text: `Plantillas actualizadas (${r.data?.count ?? 0}).` } : { tone: "bad", text: "No se pudieron traer las plantillas." });
  }

  const primary = "min-h-[44px] md:min-h-[38px] px-4 rounded-xl text-sm text-white disabled:opacity-50";
  const secondary = "min-h-[44px] md:min-h-[38px] px-4 rounded-xl text-sm border disabled:opacity-50 hover:border-violet-300";
  const canAdmin = st.isAdmin;

  function AccountRow({ a }: { a: ChannelAccount }) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "#FAF8F5", border: "1px solid #F0EDE6" }}>
        <div className="min-w-0 flex-1">
          <p className="text-sm truncate" style={{ color: "#1A1A1A", fontWeight: 700 }}>
            {a.display_phone ?? (a.username ? `@${a.username}` : a.display_name ?? "Cuenta conectada")}
          </p>
          <p className="text-xs truncate" style={{ color: "#6B7280" }}>
            {a.display_name ?? ""}
            {a.coexistence ? " · también en WhatsApp Business del celular" : ""}
          </p>
        </div>
        {a.status === "connected" ? <Pill tone="ok">Conectado</Pill> : a.status === "needs_reauth" ? <Pill tone="bad">Reconectar</Pill> : <Pill tone="warn">{a.status}</Pill>}
        {canAdmin && a.channel === "whatsapp" && (
          <button disabled={busy === a.id} onClick={() => void syncTemplates(a)} className={secondary} style={{ borderColor: "#E9E5DE", color: "#7C0BD8", fontWeight: 600 }}>
            Plantillas
          </button>
        )}
        {canAdmin && (
          <button disabled={busy === a.id} onClick={() => void disconnect(a)} className={secondary} style={{ borderColor: "#E9E5DE", color: "#6B7280", fontWeight: 600 }}>
            Desconectar
          </button>
        )}
      </div>
    );
  }

  const wa = accountsOf("whatsapp");
  const ig = accountsOf("instagram");
  const fb = accountsOf("messenger");

  return (
    <div id="canales" className="lg:col-span-2 grid gap-6 lg:grid-cols-2 scroll-mt-6">
      <Card>
        <SectionHeader inCard title="WhatsApp" subtitle="API oficial de Meta (WhatsApp Business Platform)" />
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <SourceIcon source="whatsapp" size={18} />
            {loading ? <Pill tone="muted">Revisando…</Pill> : !waReady ? <Pill tone="warn">Falta configurar</Pill> : wa.length ? <Pill tone="ok">Conectado</Pill> : <Pill tone="muted">Desconectado</Pill>}
          </div>
          <p className="text-sm" style={{ color: "#56148F" }}>
            <strong>Seguís usando WhatsApp Business en tu celular.</strong> Conectás el mismo número y lo vinculás desde la app
            WhatsApp Business (escaneando el QR o con el código que te muestra Meta). Los mensajes entran acá y en el celular;
            lo que respondas desde cualquiera de los dos queda en el historial.
          </p>
          <ul className="text-xs space-y-1 list-disc pl-4" style={{ color: "#6B7280" }}>
            <li>Necesitás la app WhatsApp Business actualizada (no la WhatsApp común).</li>
            <li>Se pueden traer hasta 6 meses de historial y tus contactos, solo en las primeras 24 h.</li>
            <li>Pasadas 24 h del último mensaje del cliente, solo se le puede escribir con una plantilla aprobada.</li>
          </ul>
          {wa.map((a) => (
            <AccountRow key={a.id} a={a} />
          ))}
          {!waReady && !loading && (
            <p className="text-xs" style={{ color: "#92400E" }}>
              {!waClientReady ? "Faltan VITE_META_APP_ID / VITE_META_WA_CONFIG_ID. " : ""}
              {!st.configured.core ? "Falta la base del CRM (CRM_SUPABASE_*) en el servidor. " : !st.configured.meta ? "Faltan las credenciales de Meta en el servidor. " : ""}
              Ver docs/inbox-unificado-puesta-en-marcha.md.
            </p>
          )}
          {canAdmin ? (
            <div className="flex flex-wrap gap-2">
              <button
                disabled={!waReady || !!busy}
                onClick={() => void connectWhatsApp(true)}
                className={primary}
                style={{ background: "var(--gradient-brand)", fontWeight: 600 }}
              >
                {busy === "wa_coex" ? "Conectando…" : "Conectar WhatsApp"}
              </button>
              <button
                disabled={!waReady || !!busy}
                onClick={() => void connectWhatsApp(false)}
                className={secondary}
                style={{ borderColor: "#E9E5DE", color: "#7C0BD8", fontWeight: 600 }}
                title="Para un número que NO está en ninguna app de WhatsApp"
              >
                {busy === "wa_new" ? "Conectando…" : "Usar un número nuevo"}
              </button>
            </div>
          ) : (
            !loading && (
              <p className="text-xs" style={{ color: "#6B7280" }}>
                Solo un administrador de la inmobiliaria puede conectar canales.
              </p>
            )
          )}
        </div>
      </Card>

      <Card>
        <SectionHeader inCard title="Instagram y Messenger" subtitle="Mensajes directos de tu cuenta y tu Página" />
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <SourceIcon source="instagram" size={18} />
            <SourceIcon source="messenger" size={18} />
            {!metaEnv.messagingEnabled ? (
              <Pill tone="warn">Requiere aprobación de Meta</Pill>
            ) : !msgReady ? (
              <Pill tone="warn">Falta configurar</Pill>
            ) : ig.length || fb.length ? (
              <Pill tone="ok">Conectado</Pill>
            ) : (
              <Pill tone="muted">Desconectado</Pill>
            )}
          </div>
          <p className="text-sm" style={{ color: "#56148F" }}>
            Conectás tu Página de Facebook y la cuenta profesional de Instagram vinculada. Podés responder dentro de las 24 h desde
            el último mensaje de la persona.
          </p>
          {[...ig, ...fb].map((a) => (
            <AccountRow key={a.id} a={a} />
          ))}
          {pages && (
            <div className="space-y-2">
              <p className="text-xs" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                Elegí la Página a conectar:
              </p>
              {pages.map((p) => (
                <button
                  key={p.id}
                  disabled={!!busy}
                  onClick={() => void connectMessaging(p.id)}
                  className={`${secondary} w-full text-left`}
                  style={{ borderColor: "#E9E5DE", color: "#1A1A1A" }}
                >
                  {p.name}
                  {p.instagram ? ` · @${p.instagram}` : " · sin Instagram"}
                </button>
              ))}
            </div>
          )}
          {canAdmin && (
            <button
              disabled={!msgReady || !!busy}
              onClick={() => void connectMessaging()}
              className={primary}
              style={{ background: "var(--gradient-brand)", fontWeight: 600 }}
              title={!metaEnv.messagingEnabled ? "Se habilita cuando Meta apruebe los permisos de mensajería" : undefined}
            >
              {busy === "meta" ? "Conectando…" : "Conectar con Facebook"}
            </button>
          )}
        </div>
      </Card>

      {msg && (
        <p role="status" className="lg:col-span-2 text-sm px-4 py-3 rounded-xl" style={msg.tone === "ok" ? { background: "#F0FDF4", color: "#166534" } : { background: "#FEF2F2", color: "#991B1B" }}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
