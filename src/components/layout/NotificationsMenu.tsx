import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "@/data/store";
import { BellIcon } from "@/components/ui/icons";
import { relativeTime } from "@/lib/format";
import { AUTHORIZATION_WARNING_DAYS, authorizationState } from "@/lib/authorization";
import { lastSentAbout } from "@/lib/ownerReport";
import { useFollowUps } from "@/data/useFollowUps";
import { usePosts } from "@/features/instagram/postStore";
import { dueForNotification, fireDueBrowserNotifications, postOfEvent } from "@/features/instagram/reminders";

/**
 * Campana del header.
 *
 * Las notificaciones no se guardan: se derivan de los datos cada vez, igual que
 * los scores y los insights de Reportes. Lo único que persiste es qué avisos ya
 * vio este agente, así el punto rosa se apaga y no vuelve hasta que aparezca
 * algo nuevo.
 */

const SEEN_KEY = "propmatch.notifications.seen.v1";
/** Días sin moverse de etapa para considerar una oportunidad frenada. */
const STALE_DAYS = 14;
const DAY = 24 * 60 * 60 * 1000;
/** Una propiedad cuenta como "nueva" para avisar a los clientes durante estos días. */
const NEW_PROPERTY_DAYS = 7;
/** Score mínimo para que valga la pena avisarle a un cliente. */
const NOTIFY_SCORE = 70;
/** Autorizaciones vencidas hace más que esto ya no se avisan (se asume que se perdió). */
const EXPIRED_GRACE_DAYS = 30;

/** Hasta cuántos matches se listan uno por uno antes de agruparlos. */
const MAX_MATCH_ITEMS = 3;

type Kind = "match" | "evento" | "tarea" | "oportunidad" | "autorizacion" | "avisar" | "seguimiento" | "publicacion";

interface Notification {
  id: string;
  kind: Kind;
  title: string;
  detail: string;
  /** Para ordenar: lo más urgente o reciente primero. */
  at: string;
  /** Texto de tiempo; si falta, se usa relativeTime(at). */
  when?: string;
  to: string;
}

const KIND_STYLE: Record<Kind, { icon: string; bg: string; color: string }> = {
  match: { icon: "✦", bg: "#F7F0FF", color: "#9B21FF" },
  evento: { icon: "◷", bg: "#EFF6FF", color: "#2563EB" },
  tarea: { icon: "!", bg: "#FFF1F2", color: "#E11D48" },
  oportunidad: { icon: "⏸", bg: "#FFFBEB", color: "#B45309" },
  autorizacion: { icon: "✎", bg: "#FFF1F2", color: "#BE123C" },
  avisar: { icon: "➚", bg: "#F0FDF4", color: "#15803D" },
  seguimiento: { icon: "☎", bg: "#FFF1F2", color: "#E11D48" },
  publicacion: { icon: "▣", bg: "#FFF1FA", color: "#CB1093" },
};

function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    // Sin storage la campana sigue andando; solo no recuerda lo leído.
  }
}

export function NotificationsMenu() {
  const { matches, events, tasks, opportunities, properties, activities, contactById, propertyById, currentUserId } =
    useStore();
  const navigate = useNavigate();
  const followUps = useFollowUps();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(loadSeen);
  const igPosts = usePosts();
  // «Llegó la hora» depende del reloj, no solo de los datos: se reevalúa cada minuto.
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => fireDueBrowserNotifications(igPosts, tick), [igPosts, tick]);
  const rootRef = useRef<HTMLDivElement>(null);

  const mine = (ownerId: string | null) => !ownerId || !currentUserId || ownerId === currentUserId;

  const items = useMemo<Notification[]>(() => {
    const now = Date.now();
    const out: Notification[] = [];

    const urgentFollowUps = followUps.filter((f) => f.priority === 1);
    if (urgentFollowUps.length) {
      out.push({
        // Cambia con la gente incluida: alguien nuevo vuelve a encender el punto.
        id: `seguimiento:${urgentFollowUps.map((f) => f.contact.id).sort().join(",")}`,
        kind: "seguimiento",
        title: `${urgentFollowUps.length} ${urgentFollowUps.length === 1 ? "contacto espera" : "contactos esperan"} respuesta`,
        detail: urgentFollowUps
          .slice(0, 3)
          .map((f) => f.contact.full_name)
          .join(", "),
        at: new Date(now + 2).toISOString(),
        when: "Ver en Inicio",
        to: "/",
      });
    }

    for (const p of properties) {
      if (p.status !== "disponible" && p.status !== "reservada") continue;
      if (!mine(p.owner_agent_id)) continue;

      // Autorización por vencer o recién vencida.
      const auth = authorizationState(p.authorization_type, p.authorization_expires_at);
      if (
        auth.daysLeft !== null &&
        auth.daysLeft <= AUTHORIZATION_WARNING_DAYS &&
        auth.daysLeft >= -EXPIRED_GRACE_DAYS
      ) {
        out.push({
          id: `autorizacion:${p.id}:${p.authorization_expires_at}`,
          kind: "autorizacion",
          title: auth.daysLeft < 0 ? "Autorización vencida" : "Autorización por vencer",
          detail: `${p.title} · ${auth.label.split(" · ")[1]}`,
          // Lo más urgente arriba: se ordena como si fuera de hoy.
          at: new Date(now + (auth.daysLeft < 0 ? 1 : 0)).toISOString(),
          when: contactById(p.owner_contact_id)?.full_name ?? "Sin propietario cargado",
          to: `/propiedades/${p.id}`,
        });
      }

      // Propiedad nueva con clientes a los que todavía no se les avisó.
      if (p.status === "disponible" && now - new Date(p.created_at).getTime() <= NEW_PROPERTY_DAYS * DAY) {
        const pending = matches.filter(
          (m) =>
            m.property_id === p.id &&
            m.score >= NOTIFY_SCORE &&
            !lastSentAbout(activities, m.contact_id, p.id) &&
            !opportunities.some((o) => o.contact_id === m.contact_id && o.property_id === p.id),
        );
        if (pending.length) {
          out.push({
            // El conteo va en el id: si aparece otro interesado, vuelve a avisar.
            id: `avisar:${p.id}:${pending.length}`,
            kind: "avisar",
            title: `${pending.length} ${pending.length === 1 ? "cliente espera" : "clientes esperan"} esta propiedad`,
            detail: p.title,
            at: p.created_at,
            when: "Avisales por WhatsApp",
            to: `/propiedades/${p.id}?compartir=1`,
          });
        }
      }
    }

    const excellent = matches
      .filter((m) => !m.is_reviewed && !m.is_dismissed && m.score >= 90)
      .sort((a, b) => b.score - a.score);
    if (excellent.length > MAX_MATCH_ITEMS) {
      // Uno por match inunda la campana: con muchos, un solo resumen. El id
      // lleva los matches incluidos, así uno nuevo lo vuelve a marcar sin leer.
      out.push({
        id: `matches:${excellent.map((m) => m.id).sort().join(",")}`,
        kind: "match",
        title: `${excellent.length} matches excelentes sin revisar`,
        detail: [...new Set(excellent.map((m) => contactById(m.contact_id)?.full_name ?? "Contacto"))]
          .slice(0, 3)
          .join(", ") + "…",
        at: excellent.reduce((a, m) => (m.created_at > a ? m.created_at : a), excellent[0].created_at),
        to: "/matches",
      });
    } else {
      for (const m of excellent) {
        out.push({
          id: `match:${m.id}`,
          kind: "match",
          title: `Match excelente (${Math.round(m.score)}%)`,
          detail: `${contactById(m.contact_id)?.full_name ?? "Contacto"} · ${propertyById(m.property_id)?.title ?? "Propiedad"}`,
          at: m.created_at,
          to: `/matches/${m.id}`,
        });
      }
    }

    for (const e of events) {
      const start = new Date(e.starts_at).getTime();
      if (start < now || start - now > DAY || !mine(e.owner_id)) continue;
      const hour = new Date(e.starts_at).toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      out.push({
        id: `evento:${e.id}`,
        kind: "evento",
        title: e.title,
        detail: contactById(e.contact_id)?.full_name ?? "Próximas 24 horas",
        at: e.starts_at,
        when: `${hour} · en ${Math.max(1, Math.round((start - now) / 3_600_000))} h`,
        to: e.type === "publicacion" && postOfEvent(e.id, igPosts) ? `/instagram/${postOfEvent(e.id, igPosts)!.id}` : "/agenda",
      });
    }

    // Publicaciones de Instagram cuya hora ya llegó y siguen sin marcarse como publicadas.
    for (const p of dueForNotification(igPosts, now)) {
      out.push({
        id: `instagram:${p.id}:${p.scheduledAt}`,
        kind: "publicacion",
        title: "Publicación lista para subir a Instagram",
        detail: p.title.trim() || "Publicación sin título",
        at: new Date(now + 3).toISOString(),
        when: "Abrir en el Estudio",
        to: `/instagram/${p.id}`,
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const t of tasks) {
      if (t.is_done || !t.due_date || !mine(t.owner_id)) continue;
      // `YYYY-MM-DD` con `new Date()` es medianoche UTC (21 h del día anterior
      // en Argentina): una tarea de hoy saldría vencida. Se arma en hora local.
      const [y, m, d] = t.due_date.slice(0, 10).split("-").map(Number);
      if (new Date(y, m - 1, d).getTime() >= today.getTime()) continue;
      out.push({
        id: `tarea:${t.id}`,
        kind: "tarea",
        title: "Tarea vencida",
        detail: t.text,
        at: t.due_date,
        to: "/agenda",
      });
    }

    for (const o of opportunities) {
      if (o.stage === "cierre" || o.stage === "perdida" || !mine(o.owner_id)) continue;
      if (now - new Date(o.stage_since).getTime() < STALE_DAYS * DAY) continue;
      out.push({
        // La etapa va en el id: si se mueve y vuelve a frenarse, es un aviso nuevo.
        id: `oportunidad:${o.id}:${o.stage}:${o.stage_since}`,
        kind: "oportunidad",
        title: `Sin avances hace ${Math.floor((now - new Date(o.stage_since).getTime()) / DAY)} días`,
        detail: contactById(o.contact_id)?.full_name ?? "Oportunidad",
        at: o.stage_since,
        to: "/oportunidades",
      });
    }

    // Primero lo que viene (el evento más próximo arriba), después el resto,
    // de lo más reciente a lo más viejo.
    return out.sort((a, b) => {
      const ta = new Date(a.at).getTime();
      const tb = new Date(b.at).getTime();
      const fa = ta > now;
      const fb = tb > now;
      if (fa !== fb) return fa ? -1 : 1;
      return fa ? ta - tb : tb - ta;
    });
  }, [matches, events, tasks, opportunities, properties, activities, contactById, propertyById, currentUserId, followUps, igPosts, tick]);

  const unread = items.filter((n) => !seen.has(n.id)).length;

  // Cerrar con click afuera o Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function markSeen(ids: string[]) {
    const next = new Set(seen);
    ids.forEach((id) => next.add(id));
    setSeen(next);
    saveSeen(next);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative w-10 h-10 flex items-center justify-center rounded-xl transition-all hover:bg-violet-50"
        style={{ background: open ? "#E9E5DE" : "#F7F0FF" }}
        aria-label={unread ? `Notificaciones (${unread} sin leer)` : "Notificaciones"}
        aria-expanded={open}
      >
        <BellIcon />
        {unread > 0 && (
          <span
            className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
            style={{ background: "#FF5ECA" }}
          />
        )}
      </button>

      {open && (
        <div
          className="pm-modal fixed md:absolute left-3 right-3 top-16 md:left-auto md:top-auto md:right-0 md:mt-2 md:w-80 rounded-2xl border overflow-hidden z-50"
          style={{ background: "white", borderColor: "#E9E5DE", boxShadow: "0 12px 40px rgba(86, 20, 143, 0.15)" }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "#F7F0FF" }}>
            <span className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
              Notificaciones
            </span>
            {unread > 0 && (
              <button
                onClick={() => markSeen(items.map((n) => n.id))}
                className="text-xs hover:underline"
                style={{ color: "#9B21FF", fontWeight: 600 }}
              >
                Marcar todo como leído
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm" style={{ color: "#6B7280" }}>
                Todo al día. No hay avisos pendientes.
              </p>
            ) : (
              items.map((n) => {
                const style = KIND_STYLE[n.kind];
                const isUnread = !seen.has(n.id);
                return (
                  <button
                    key={n.id}
                    onClick={() => {
                      markSeen([n.id]);
                      setOpen(false);
                      navigate(n.to);
                    }}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left transition-all hover:bg-violet-50"
                    style={{ background: isUnread ? "#FAF8F5" : "white" }}
                  >
                    <span
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm"
                      style={{ background: style.bg, color: style.color, fontWeight: 700 }}
                    >
                      {style.icon}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span
                        className="block text-sm truncate"
                        style={{ color: "#1A1A1A", fontWeight: isUnread ? 700 : 500 }}
                      >
                        {n.title}
                      </span>
                      <span className="block text-xs truncate" style={{ color: "#6B7280" }}>
                        {n.detail}
                      </span>
                      <span className="block text-[11px] mt-0.5" style={{ color: "#6B7280" }}>
                        {n.when ?? relativeTime(n.at)}
                      </span>
                    </span>
                    {isUnread && (
                      <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: "#FF5ECA" }} />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
