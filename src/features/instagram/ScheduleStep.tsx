import { useState } from "react";
import { Card, Badge } from "@/components/ui/Card";
import { CalendarIcon } from "@/components/ui/icons";
import { slugify } from "./caption";
import { downloadBlob } from "./exportImages";
import type { InstagramPost } from "./postStore";
import { browserNotifyEnabled, browserNotifySupported, disableBrowserNotify, enableBrowserNotify, eventTitle, KIND_WORD, useReminders } from "./reminders";
import { arParts, arToIso, AR_TZ, buildIcs, derivedStatus, formatAr, isPast, REMINDER_MINUTES_BEFORE, shortcuts, STATUS_META } from "./schedule";

interface Props {
  post: InstagramPost;
  onPatch: (part: Partial<InstagramPost>) => void;
}

const field = "mt-1 rounded-lg border px-3 min-h-11 text-sm w-full";
const fieldStyle = { borderColor: "#E9E5DE", color: "#1A1A1A", background: "white" } as const;

export function ScheduleStep({ post, onPatch }: Props) {
  const { schedule, unschedule } = useReminders();
  const initial = post.scheduledAt ? arParts(post.scheduledAt) : (() => { const s = shortcuts()[1]; return { date: s.date, time: s.time }; })();
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [notify, setNotify] = useState(browserNotifyEnabled);
  const [notifyMsg, setNotifyMsg] = useState("");

  const status = derivedStatus(post);
  const meta = STATUS_META[status];
  const scheduled = post.status === "scheduled" && !!post.scheduledAt;
  const published = post.status === "published";

  const apply = () => {
    const iso = arToIso(date, time);
    if (!iso) return setMsg({ ok: false, text: "Elegí una fecha y una hora válidas." });
    if (isPast(iso)) return setMsg({ ok: false, text: "Esa fecha y hora ya pasaron. Elegí un momento futuro." });
    const eventId = schedule(post, iso);
    onPatch({ scheduledAt: iso, status: "scheduled", reminderEventId: eventId });
    setMsg({ ok: true, text: `${scheduled ? "Reprogramada" : "Programada"} para ${formatAr(iso)}. Creamos el recordatorio en tu Agenda.` });
  };

  const clear = () => {
    unschedule(post);
    onPatch({ scheduledAt: null, status: "draft", reminderEventId: null });
    setMsg({ ok: true, text: "Quitamos la fecha y el recordatorio de la Agenda. Volvió a Borrador." });
  };

  const downloadIcs = () => {
    const iso = post.scheduledAt ?? arToIso(date, time);
    if (!iso) return setMsg({ ok: false, text: "Elegí una fecha y una hora válidas para generar el archivo." });
    const ics = buildIcs({
      uid: post.id,
      title: eventTitle(post),
      description: `Tipo: ${KIND_WORD[post.kind]}. Abrí PropMatch > Instagram para descargar los archivos, copiar el texto y subirla. ${window.location.origin}/instagram/${post.id}`,
      startIso: iso,
    });
    downloadBlob(new Blob([ics], { type: "text/calendar;charset=utf-8" }), `publicacion-${slugify(post.title)}.ics`);
    setMsg({ ok: true, text: `Descargamos el archivo .ics: abrilo en tu celular y se agrega a tu calendario con un aviso ${REMINDER_MINUTES_BEFORE} minutos antes.` });
  };

  const toggleNotify = async () => {
    if (notify) {
      disableBrowserNotify();
      setNotify(false);
      setNotifyMsg("Avisos del navegador desactivados.");
      return;
    }
    const r = await enableBrowserNotify();
    setNotify(r === "granted");
    setNotifyMsg(r === "granted" ? "Listo: te avisamos cuando llegue la hora, siempre que PropMatch esté abierto en una pestaña." : r === "denied" ? "El navegador bloqueó los permisos. Podés habilitarlos desde el candado de la barra de direcciones." : r === "unsupported" ? "Este navegador no admite avisos." : "No diste permiso: no activamos nada.");
  };

  return (
    <Card>
      <div className="px-5 py-4 border-b flex flex-wrap items-center gap-2" style={{ borderColor: "#F0EDE6" }}>
        <div className="flex-1 min-w-0">
          <h3 className="text-base" style={{ color: "#1A1A1A", fontWeight: 700 }}>Programar y recordar</h3>
          <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>Hora de Argentina ({AR_TZ}).</p>
        </div>
        <Badge bg={meta.bg} text={meta.text}>{meta.label}</Badge>
      </div>

      <div className="p-5 flex flex-col gap-4">
        <p className="text-sm px-4 py-3 rounded-xl" style={{ background: "#F7F0FF", color: "#56148F" }}>
          <strong>Cómo funciona:</strong> PropMatch todavía no puede publicar solo a la hora elegida. La fecha crea un <strong>recordatorio</strong>: un evento en tu Agenda, un aviso en la campana cuando llega la hora y, si querés, un archivo para tu calendario del celular. Después subís la publicación a mano y la marcás como publicada.
        </p>

        {published ? (
          <p className="text-sm" style={{ color: "#15803D" }}>Esta publicación ya está marcada como publicada ({formatAr(post.publishedAt)}). Para volver a programarla, duplicala desde «Mis publicaciones».</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Atajos de fecha">
              {shortcuts().map((s) => (
                <button key={s.id} type="button" onClick={() => { setDate(s.date); setTime(s.time); }} className="px-3 min-h-11 md:min-h-9 rounded-xl border text-xs hover:bg-violet-50" style={{ borderColor: "#E9E5DE", color: "#6B7280", fontWeight: 700 }}>
                  {s.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 max-w-md">
              <div>
                <label htmlFor="sch-date" className="text-xs" style={{ color: "#6B7280", fontWeight: 700 }}>Fecha</label>
                <input id="sch-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} style={fieldStyle} />
              </div>
              <div>
                <label htmlFor="sch-time" className="text-xs" style={{ color: "#6B7280", fontWeight: 700 }}>Hora</label>
                <input id="sch-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} style={fieldStyle} />
              </div>
            </div>
            <p className="text-xs" style={{ color: "#6B7280" }}>
              Los horarios de los atajos son de ejemplo, no una recomendación: no ofrecemos «mejor horario» porque no tenemos una fuente confiable para eso.
            </p>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={apply} className="px-5 min-h-11 rounded-xl text-sm text-white hover:opacity-90" style={{ background: "var(--gradient-brand)", fontWeight: 700 }}>
                {scheduled ? "Reprogramar" : "Programar con recordatorio"}
              </button>
              {scheduled && (
                <button type="button" onClick={clear} className="px-4 min-h-11 rounded-xl text-sm border hover:bg-rose-50" style={{ borderColor: "#FECDD3", color: "#BE123C", fontWeight: 700 }}>
                  Quitar fecha y recordatorio
                </button>
              )}
            </div>
          </>
        )}

        <p role="status" aria-live="polite" className={msg ? "text-sm px-3 py-2 rounded-lg" : "sr-only"} style={msg ? { background: msg.ok ? "#F0FDF4" : "#FFF1F2", color: msg.ok ? "#15803D" : "#BE123C" } : undefined}>
          {msg?.text}
        </p>

        {scheduled && (
          <p className="text-sm" style={{ color: "#1A1A1A" }}>
            Programada para <strong>{formatAr(post.scheduledAt)}</strong>. {meta.hint}
          </p>
        )}

        <div className="border-t pt-4 flex flex-col gap-3" style={{ borderColor: "#F0EDE6" }}>
          <div>
            <button type="button" onClick={downloadIcs} className="px-4 min-h-11 rounded-xl text-sm border hover:bg-violet-50 flex items-center gap-2" style={{ borderColor: "#E9E5DE", color: "#6B7280", fontWeight: 700 }}>
              <CalendarIcon size={14} color="#6B7280" /> Agregar a mi calendario (.ics)
            </button>
            <p className="text-xs mt-1.5" style={{ color: "#6B7280" }}>
              Archivo estándar con un aviso {REMINDER_MINUTES_BEFORE} minutos antes. Funciona en Google Calendar, Apple Calendar y Outlook, aunque tengas PropMatch cerrado. Si reprogramás, volvé a descargarlo y borrá el evento anterior de tu calendario: el archivo no se actualiza solo.
            </p>
          </div>
          {browserNotifySupported() && (
            <div>
              <button type="button" onClick={toggleNotify} aria-pressed={notify} className="px-4 min-h-11 rounded-xl text-sm border hover:bg-violet-50" style={{ borderColor: notify ? "#9B21FF" : "#E9E5DE", background: notify ? "#F7F0FF" : "white", color: "#6B7280", fontWeight: 700 }}>
                {notify ? "Avisos del navegador: activados" : "Activar avisos del navegador"}
              </button>
              <p className="text-xs mt-1.5" style={{ color: "#6B7280" }}>
                Opcional. Solo funcionan con PropMatch abierto en una pestaña (no hay servidor que te avise con la app cerrada). Para eso usá el calendario.
              </p>
              <p role="status" aria-live="polite" className="text-xs mt-1" style={{ color: "#4B5563" }}>{notifyMsg}</p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
