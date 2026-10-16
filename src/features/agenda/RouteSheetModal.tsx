import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/data/store";
import { MapPinIcon } from "@/components/ui/icons";
import {
  STATUS_META,
  fmtHour,
  isVisit,
  mapsDirectionsUrl,
  mapsPoint,
  propertyAddress,
  sameDay,
  type AgendaItem,
} from "./agendaModel";

/**
 * Hoja de ruta del día: las visitas en orden de horario, con dirección y
 * teléfono, y un link de Google Maps con todas las paradas. Google arma el
 * recorrido; acá no se estiman kilómetros ni tiempos.
 */

const toDateInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function RouteSheetModal({
  items,
  initialDay,
  contactName,
  onClose,
}: {
  items: AgendaItem[];
  initialDay: Date;
  contactName: (i: AgendaItem) => string | null;
  onClose: () => void;
}) {
  const { propertyById, contactById, agency } = useStore();
  const [day, setDay] = useState(toDateInput(initialDay));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const date = useMemo(() => {
    const [y, m, d] = day.split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }, [day]);

  const stops = useMemo(
    () =>
      items
        .filter((i) => isVisit(i) && sameDay(i.start, date) && i.status !== "cancelada")
        .sort((a, b) => a.start.getTime() - b.start.getTime())
        .map((i) => {
          const property = propertyById(i.propertyId);
          const contact = contactById(i.contactId);
          return {
            item: i,
            property,
            address: propertyAddress(property),
            point: mapsPoint(property),
            who: contactName(i),
            phone: contact?.phone ?? null,
          };
        }),
    [items, date, propertyById, contactById, contactName],
  );

  const routeUrl = mapsDirectionsUrl(stops.map((s) => s.point).filter((p): p is string => !!p));
  const withoutAddress = stops.filter((s) => !s.point).length;
  const dateLabel = date.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  function print() {
    const w = window.open("", "_blank");
    if (!w) return;
    const rows = stops
      .map(
        (s, n) => `<tr>
  <td class="n">${n + 1}</td>
  <td class="h">${fmtHour(s.item.start)}–${fmtHour(s.item.end)}</td>
  <td><strong>${esc(s.property?.title ?? s.item.title)}</strong><br>${esc(s.address ?? "Sin dirección cargada")}</td>
  <td>${esc(s.who ?? "—")}${s.phone ? `<br>${esc(s.phone)}` : ""}</td>
  <td>${s.item.status ? esc(STATUS_META[s.item.status].label) : ""}</td>
  <td class="c">☐</td>
</tr>`,
      )
      .join("");
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Hoja de ruta — ${esc(dateLabel)}</title>
<style>
body{font-family:Inter,system-ui,sans-serif;color:#1A1A1A;margin:32px}
h1{font-size:20px;margin:0 0 4px}p{margin:0 0 16px;color:#6B7280;font-size:13px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{border-bottom:1px solid #E9E5DE;padding:8px 6px;text-align:left;vertical-align:top}
th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6B7280}
.n{width:24px;font-weight:700}.h{white-space:nowrap;font-weight:700}.c{font-size:18px;text-align:center}
.route{margin-top:16px;font-size:12px;word-break:break-all}
</style></head><body>
<h1>Hoja de ruta · ${esc(dateLabel)}</h1>
<p>${esc(agency.name)} · ${stops.length} ${stops.length === 1 ? "visita" : "visitas"}</p>
<table><thead><tr><th>#</th><th>Horario</th><th>Propiedad</th><th>Contacto</th><th>Estado</th><th>Hecha</th></tr></thead><tbody>${rows}</tbody></table>
${routeUrl ? `<p class="route">Recorrido en Google Maps: ${esc(routeUrl)}</p>` : ""}
</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }

  return (
    <div
      className="pm-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      style={{ background: "rgba(8, 11, 31,0.35)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="route-sheet-title"
    >
      <div
        className="pm-modal rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        style={{ background: "white", boxShadow: "var(--shadow-pop)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b flex items-center gap-3 flex-wrap" style={{ borderColor: "#E9E5DE", background: "#FAF8F5" }}>
          <div className="flex-1 min-w-0">
            <h2 id="route-sheet-title" className="text-lg tracking-tight" style={{ color: "#1A1A1A", fontWeight: 800 }}>
              Hoja de ruta
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
              Visitas del día en orden de horario.
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs" style={{ color: "#6B7280", fontWeight: 600 }}>
            Día
            <input
              type="date"
              value={day}
              onChange={(e) => e.target.value && setDay(e.target.value)}
              className="min-h-11 px-3 rounded-xl text-sm border outline-none bg-white text-[#1A1A1A] border-[#E9E5DE] focus:border-[#9B21FF] focus:ring-4 focus:ring-[#E9E5DE]"
            />
          </label>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="w-11 h-11 rounded-lg flex items-center justify-center transition-all hover:bg-violet-50"
            style={{ color: "#6B7280", fontSize: 22, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {stops.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: "#6B7280" }}>
              No hay visitas agendadas para el {dateLabel}.
            </p>
          ) : (
            <ol className="space-y-2">
              {stops.map((s, n) => (
                <li key={s.item.key} className="flex gap-3 p-3 rounded-xl border" style={{ borderColor: "#E9E5DE" }}>
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs text-white flex-shrink-0"
                    style={{ background: "var(--gradient-brand)", fontWeight: 800 }}
                    aria-hidden
                  >
                    {n + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                      {fmtHour(s.item.start)}–{fmtHour(s.item.end)} · {s.property?.title ?? s.item.title}
                    </p>
                    <p className="text-xs flex items-start gap-1 mt-0.5" style={{ color: s.address ? "#6B7280" : "var(--color-state-amber-text)" }}>
                      <MapPinIcon size={11} color="#6B7280" className="mt-0.5 flex-shrink-0" />
                      {s.address ?? "Sin dirección cargada: no entra en el recorrido"}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
                      {[s.who, s.phone].filter(Boolean).join(" · ") || "Sin contacto"}
                      {s.item.status ? ` · ${STATUS_META[s.item.status].label}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {withoutAddress > 0 && stops.length > 0 && (
            <p className="text-xs mt-3" style={{ color: "#6B7280" }}>
              {withoutAddress === 1 ? "1 visita no tiene" : `${withoutAddress} visitas no tienen`} dirección: cargala en la ficha de la propiedad para sumarla al recorrido.
            </p>
          )}
        </div>

        <div className="px-6 py-4 border-t flex items-center justify-end gap-3 flex-wrap" style={{ borderColor: "#E9E5DE", background: "#FAF8F5" }}>
          <button
            type="button"
            onClick={print}
            disabled={stops.length === 0}
            className="min-h-11 px-5 rounded-xl text-sm border transition-all hover:bg-violet-50 disabled:opacity-50"
            style={{ borderColor: "#E9E5DE", color: "#7C0BD8", fontWeight: 600, background: "white" }}
          >
            Imprimir
          </button>
          {routeUrl ? (
            <a
              href={routeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-11 px-5 rounded-xl text-sm text-white flex items-center hover:opacity-90"
              style={{ background: "var(--gradient-brand)", fontWeight: 600 }}
            >
              Abrir recorrido en Google Maps
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="min-h-11 px-5 rounded-xl text-sm text-white opacity-50"
              style={{ background: "var(--gradient-brand)", fontWeight: 600 }}
            >
              Abrir recorrido en Google Maps
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
