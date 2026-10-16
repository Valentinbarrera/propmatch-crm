/**
 * Columna derecha del alta: calidad de la ficha, estado por canal y
 * compradores compatibles. Todo calculado con datos reales; nada inventado.
 */

import { useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { AlertTriangleIcon, CheckIcon, ClockIcon, MatchesSolidIcon } from "@/components/ui/icons";
import { useStore } from "@/data/store";
import { diagnose, type DiagnosticCheck } from "@/lib/listingDiagnostics";
import { computeMatch, MATCH_THRESHOLD } from "@/lib/matching";
import type { CurrencyCode, Property, PropertyStatus, PublicationStatus } from "@/types/db";
import { INTEGRATION_GUIDES } from "../integrationGuides";
import { EXTERNAL_CHANNELS, WEB_CHANNEL, usePublications } from "../usePublications";
import { useMeliConnection } from "../useIntegrations";
import { loadExtras } from "../MeliPublishPanel";
import { photosForValidation } from "../meliTarget";
import { toMeliListing } from "../useMeliPublish";
import { validateMeliListing } from "../../../../shared/meliListing";
import {
  FIX_LABEL,
  editorFieldId,
  fixForMeliField,
  fixesForCheck,
  lc,
  missingSizeParts,
  shortMissingForCheck,
  shortMissingForMeli,
  type FieldKey,
  type LinkKey,
} from "../completar/fields";

const PANEL_TITLE = "text-xs uppercase";
const PANEL_TITLE_STYLE = { color: "#6B7280", fontWeight: 700, letterSpacing: "0.1em" } as const;

const fixBtnClass =
  "inline-flex items-center gap-1 px-3 min-h-11 rounded-xl text-xs border transition-all hover:bg-violet-50 bg-white";
const fixBtnStyle = { borderColor: "#DDD8CF", color: "#9B21FF", fontWeight: 700 } as const;

/* ── (a) Índice de calidad ─────────────────────────────────────────────── */

export function QualityPanel({
  checks,
  draft,
  photoCount,
  onFix,
}: {
  checks: DiagnosticCheck[];
  /** La propiedad como quedaría (para saber qué parte de cada check falta). */
  draft: Property;
  photoCount: number;
  /** Lleva el foco al control (`campo-…`). */
  onFix: (fieldId: string) => void;
}) {
  const ok = checks.filter((c) => c.ok).length;
  const pct = checks.length ? Math.round((100 * ok) / checks.length) : 0;
  return (
    <Card padded>
      <h2 className={PANEL_TITLE} style={PANEL_TITLE_STYLE}>
        Índice de calidad de ficha
      </h2>
      <div className="flex items-center gap-4 mt-3">
        <ScoreRing score={pct} size={76} strokeWidth={7} />
        <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 600 }}>
          {ok} de {checks.length} requisitos para publicar en portales
          <span className="block text-xs mt-0.5" style={{ color: "#6B7280", fontWeight: 500 }}>
            Las mismas reglas que revisa el Multipublicador.
          </span>
        </p>
      </div>
      <ul className="mt-4 space-y-1">
        {checks.map((c) => {
          const fixes = fixesForCheck(c, draft) as (FieldKey | LinkKey)[];
          const missing = shortMissingForCheck(c, draft, photoCount);
          return (
            <li key={c.id} className="flex items-start gap-2.5 px-2 py-2 rounded-lg">
              <span
                className="w-5 h-5 mt-0.5 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: c.ok ? "#F0FDF4" : "#FFFBEB", border: `1px solid ${c.ok ? "#BBF7D0" : "#FDE68A"}` }}
                aria-hidden="true"
              >
                {c.ok ? <CheckIcon size={10} color="#16A34A" /> : <span style={{ color: "#B45309", fontSize: 11, fontWeight: 800 }}>!</span>}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm" style={{ color: "#1A1A1A", fontWeight: 600 }}>
                  {c.label}
                  <span className="sr-only">{c.ok ? ": cumple" : ": falta"}</span>
                </span>
                <span className="block text-xs" style={{ color: c.ok ? "#6B7280" : "#B45309" }}>
                  {c.ok || c.id !== "size" ? c.detail : `Falta: ${missing.join(", ")}.`}
                </span>
                {fixes.length > 0 && (
                  <span className="flex flex-wrap gap-1.5 mt-1.5">
                    {fixes.map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => onFix(editorFieldId(k))}
                        aria-label={`Completar ${FIX_LABEL[k].toLowerCase()}`}
                        className={fixBtnClass}
                        style={fixBtnStyle}
                      >
                        {fixes.length > 1 ? FIX_LABEL[k] : "Completar"} <span aria-hidden="true">→</span>
                      </button>
                    ))}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ── (b) Estado por canal ──────────────────────────────────────────────── */

type Tone = "ok" | "wait" | "error" | "off";
const TONE: Record<Tone, { bg: string; text: string; border: string }> = {
  ok: { bg: "#F0FDF4", text: "#15803D", border: "#BBF7D0" },
  wait: { bg: "#FFFBEB", text: "#B45309", border: "#FDE68A" },
  error: { bg: "#FFF1F2", text: "#BE123C", border: "#FECDD3" },
  off: { bg: "#F8FAFC", text: "#475569", border: "#E2E8F0" },
};

interface ChannelRowData {
  key: string;
  name: string;
  short: string;
  color: string;
  label: string;
  tone: Tone;
  detail?: string | null;
  requirements: { text: string; ok?: boolean }[];
  /** Datos de la ficha que le faltan a este canal, cada uno con su arreglo. `null` = el canal no pide datos de la ficha. */
  missing: Missing[] | null;
}

interface Missing {
  text: string;
  /** Campo del editor al que lleva "Completar". */
  target?: string;
  /** O una pantalla (p. ej. la ubicación de Mercado Libre, que se elige en el publicador). */
  path?: string;
}

function externalLabel(status: PublicationStatus | null, connected: boolean): { label: string; tone: Tone } {
  switch (status) {
    case "published":
      return { label: "Publicado", tone: "ok" };
    case "pending":
      return { label: "En cola", tone: "wait" };
    case "error":
      return { label: "Error", tone: "error" };
    case "draft":
      return { label: "Borrador", tone: "off" };
    case "paused":
    case "removed":
      return { label: "Inactiva", tone: "off" };
    default:
      return connected ? { label: "Conectado · sin publicar", tone: "off" } : { label: "Sin conexión", tone: "off" };
  }
}

export function ChannelsPanel({
  saved,
  currency,
  status,
  photoCount,
  appLinked,
  draft,
  photos,
  onFix,
  onNavigate,
}: {
  /** La propiedad tal como está guardada (en el alta, `undefined`). */
  saved: Property | undefined;
  currency: CurrencyCode;
  status: PropertyStatus;
  photoCount: number;
  appLinked: boolean;
  /** La propiedad como quedaría con lo que hay en el formulario. */
  draft: Property;
  photos: string[];
  onFix: (fieldId: string) => void;
  /** Navegar respetando "cambios sin guardar". */
  onNavigate: (path: string) => void;
}) {
  const { channelsOf } = usePublications();
  const meli = useMeliConnection();

  // Lo que le falta a la ficha según el diagnóstico (lo usan los portales en cola).
  const portalMissing: Missing[] = useMemo(() => {
    const out: Missing[] = [];
    for (const c of diagnose(draft, photoCount)) {
      if (c.ok) continue;
      if (c.id === "size") {
        for (const k of missingSizeParts(draft)) out.push({ text: lc(FIX_LABEL[k]), target: editorFieldId(k) });
      } else {
        const [k] = fixesForCheck(c, draft) as (FieldKey | LinkKey)[];
        out.push({ text: shortMissingForCheck(c, draft, photoCount)[0], target: k ? editorFieldId(k) : undefined });
      }
    }
    return out;
  }, [draft, photoCount]);

  // Mercado Libre: la misma validación previa del panel del publicador (solo lo que bloquea).
  const meliMissing: Missing[] = useMemo(() => {
    const extras = saved ? loadExtras(saved.id) : null;
    const loc = extras?.location;
    const location = loc?.neighborhoodId ? { neighborhoodId: loc.neighborhoodId } : loc?.cityId ? { cityId: loc.cityId } : null;
    const listing = toMeliListing(draft, { location, guests: extras?.guests ?? null, landAccess: extras?.landAccess ?? null });
    // App: solo fotos con URL pública; solo-CRM (pesos o sin sincronizar): las locales se suben al publicar.
    const publicPhotos = photosForValidation(draft, photos);
    const out: Missing[] = [];
    for (const i of validateMeliListing(listing, publicPhotos)) {
      if (!i.blocking) continue;
      const k = fixForMeliField(i.field);
      const text = shortMissingForMeli(i.field);
      if (out.some((m) => m.text === text)) continue;
      if (k === "meli_location" || k === "meli_guests" || k === "meli_land_access") {
        out.push(saved ? { text, path: `/publicador/${saved.id}#mercadolibre` } : { text: `${text} (se elige al publicar)` });
      } else out.push({ text, target: k ? editorFieldId(k as FieldKey | LinkKey) : undefined });
    }
    return out;
  }, [draft, photos, saved]);

  const rows: ChannelRowData[] = useMemo(() => {
    const out: ChannelRowData[] = [];

    // App PropMatch: lo único que hoy se publica de verdad (al guardar).
    const usd = currency === "USD";
    let app: { label: string; tone: Tone; detail?: string };
    if (!appLinked) app = { label: "Sin conexión", tone: "off", detail: "Tu cuenta no está vinculada a una inmobiliaria en la app." };
    else if (!usd) app = { label: "No se puede publicar", tone: "wait", detail: "La app solo acepta precios en USD." };
    else if (saved?.sync_status === "synced")
      app = saved.status === "disponible"
        ? { label: "Publicada", tone: "ok", detail: saved.app_photo_notice ?? undefined }
        : { label: "Pausada en la app", tone: "off", detail: "Solo las disponibles se ven en la app." };
    else if (saved?.sync_status === "syncing") app = { label: "Sincronizando", tone: "wait" };
    else if (saved?.sync_status === "error") app = { label: "Error", tone: "error", detail: "Falló la última sincronización. Se reintenta al guardar." };
    else
      app = {
        label: "Se publica al guardar",
        tone: "off",
        detail: status === "disponible" ? undefined : "Se sube pausada: solo las disponibles se ven en la app.",
      };
    out.push({
      key: "app",
      name: "App PropMatch",
      short: "PM",
      color: "#9B21FF",
      ...app,
      requirements: [{ text: "Precio en USD", ok: usd }],
      missing: usd ? [] : [{ text: "precio en USD", target: editorFieldId("currency") }],
    });

    out.push({
      key: "web",
      name: WEB_CHANNEL.name,
      short: WEB_CHANNEL.short,
      color: WEB_CHANNEL.color,
      label: "Ficha pública disponible",
      tone: "ok",
      detail: "Canal propio: la ficha se comparte por link.",
      requirements: [],
      missing: null,
    });

    const states = saved ? channelsOf(saved) : null;
    for (const info of EXTERNAL_CHANNELS) {
      const st = states?.find((s) => s.info.channel === info.channel) ?? null;
      const connected = info.channel === "mercadolibre" && meli.connected;
      const { label, tone } = externalLabel(st?.status ?? null, connected);
      const guide = INTEGRATION_GUIDES[info.channel];
      const requirements: { text: string; ok?: boolean }[] = guide.needs.map((text) => ({ text }));
      if (info.channel === "cabaprop") {
        // Única regla de cantidad de fotos documentada por un portal.
        const i = requirements.findIndex((r) => /3 fotos/.test(r.text));
        if (i >= 0) requirements[i] = { text: requirements[i].text, ok: photoCount >= 3 };
      }
      out.push({
        key: info.channel,
        name: info.name,
        short: info.short,
        color: info.color,
        label,
        tone,
        detail: st?.errorMessage ?? null,
        requirements,
        missing: info.channel === "mercadolibre" ? meliMissing : portalMissing,
      });
    }
    return out;
  }, [appLinked, currency, saved, status, channelsOf, meli.connected, photoCount, meliMissing, portalMissing]);

  return (
    <Card padded>
      <h2 className={PANEL_TITLE} style={PANEL_TITLE_STYLE}>
        Estado por canal
      </h2>
      <p className="text-xs mt-1" style={{ color: "#6B7280" }}>
        Los portales se conectan desde el Multipublicador. Hasta que haya conector, lo que publiques queda en cola.
      </p>
      <ul className="mt-3 divide-y" style={{ borderColor: "#F0EDE6" }}>
        {rows.map((r) => (
          <ChannelRow key={r.key} row={r} onFix={onFix} onNavigate={onNavigate} />
        ))}
      </ul>
    </Card>
  );
}

function ChannelRow({
  row,
  onFix,
  onNavigate,
}: {
  row: ChannelRowData;
  onFix: (fieldId: string) => void;
  onNavigate: (path: string) => void;
}) {
  const tone = TONE[row.tone];
  const logo = row.color;
  return (
    <li className="py-2.5" style={{ borderColor: "#F0EDE6" }}>
      <div className="flex items-center gap-3">
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs"
          style={{ background: logo, color: logo === "#FFE600" ? "#1F2937" : "white", fontWeight: 800 }}
          aria-hidden="true"
        >
          {row.short}
        </span>
        <span className="min-w-0 flex-1 text-sm truncate" style={{ color: "#1A1A1A", fontWeight: 600 }}>
          {row.name}
        </span>
        <span
          className="text-xs px-2 py-0.5 rounded-full border whitespace-nowrap flex items-center gap-1"
          style={{ background: tone.bg, color: tone.text, borderColor: tone.border, fontWeight: 600 }}
        >
          {row.tone === "ok" && <CheckIcon size={10} color={tone.text} />}
          {row.tone === "wait" && <ClockIcon size={10} color={tone.text} />}
          {row.tone === "error" && <AlertTriangleIcon size={10} color={tone.text} />}
          {row.label}
        </span>
      </div>
      {row.detail && (
        <p className="text-xs mt-1 ml-11" style={{ color: row.tone === "error" ? "#BE123C" : "#6B7280" }}>
          {row.detail}
        </p>
      )}
      {row.missing && row.missing.length > 0 && (
        <p className="ml-11 mt-1 text-xs leading-7" style={{ color: "#B45309", fontWeight: 600 }}>
          Falta:{" "}
          {row.missing.map((m, i) => (
            <span key={m.text}>
              {m.target || m.path ? (
                <button
                  type="button"
                  onClick={() => (m.target ? onFix(m.target) : m.path && onNavigate(m.path))}
                  aria-label={`Completar ${m.text} (${row.name})`}
                  className="inline py-1.5 rounded underline decoration-dotted underline-offset-2 hover:text-[#9B21FF] focus-visible:text-[#9B21FF]"
                >
                  {m.text}
                </button>
              ) : (
                m.text
              )}
              {i < row.missing!.length - 1 ? ", " : ""}
            </span>
          ))}
        </p>
      )}
      {row.missing && row.missing.length === 0 && (
        <p className="ml-11 mt-1 text-xs flex items-center gap-1" style={{ color: "#15803D", fontWeight: 600 }}>
          <CheckIcon size={10} color="#16A34A" /> La ficha tiene todo lo que pide este canal
        </p>
      )}
      {row.requirements.length > 0 && (
        <details className="ml-11 mt-1">
          <summary className="text-xs cursor-pointer min-h-8 flex items-center" style={{ color: "#9B21FF", fontWeight: 600 }}>
            {row.key === "app" ? "Requisitos" : "Requisitos de la cuenta"}
          </summary>
          <ul className="mt-1 space-y-1">
            {row.requirements.map((req) => (
              <li key={req.text} className="text-xs flex gap-1.5" style={{ color: "#6B7280" }}>
                <span aria-hidden="true" style={{ color: req.ok === undefined ? "#D4AAFF" : req.ok ? "#16A34A" : "#B45309", fontWeight: 800 }}>
                  {req.ok === undefined ? "•" : req.ok ? "✓" : "!"}
                </span>
                <span>
                  {req.text}
                  {req.ok !== undefined && <span className="sr-only">{req.ok ? " (cumple)" : " (falta)"}</span>}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

/* ── (c) Compradores compatibles ───────────────────────────────────────── */

export interface CompatibleBuyers {
  count: number;
  top: { id: string; name: string; score: number }[];
  topReasons: [string, number][];
}

/**
 * El mismo motor que la pantalla de Matches, contra los requerimientos
 * reales, mientras se completa el formulario. Sin precio no se calcula
 * (`null`): el presupuesto pesa 30% y daría resultados engañosos.
 */
export function useCompatibleBuyers(draft: Property | null): CompatibleBuyers | null {
  const { requirements, contactById } = useStore();
  return useMemo(() => {
    if (!draft || !draft.price) return null;
    const hits = requirements
      .filter((r) => r.is_active && r.operation === draft.operation)
      .map((r) => ({ req: r, m: computeMatch(r, draft) }))
      .filter((h) => h.m.score >= MATCH_THRESHOLD)
      .sort((a, b) => b.m.score - a.m.score);

    const reasonCount = new Map<string, number>();
    for (const h of hits) for (const reason of h.m.reasons) reasonCount.set(reason, (reasonCount.get(reason) ?? 0) + 1);

    return {
      count: hits.length,
      top: hits.slice(0, 3).map((h) => ({ id: h.req.id, name: contactById(h.req.contact_id)?.full_name ?? "Contacto", score: h.m.score })),
      topReasons: [...reasonCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3),
    };
  }, [draft, requirements, contactById]);
}

export function BuyersPanel({ result, onSeeAll }: { result: CompatibleBuyers | null; onSeeAll: () => void }) {
  return (
    <Card padded>
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "var(--gradient-brand)" }} aria-hidden="true">
          <MatchesSolidIcon size={14} />
        </span>
        <h2 className={PANEL_TITLE} style={PANEL_TITLE_STYLE}>
          Compradores compatibles
        </h2>
      </div>
      {result === null ? (
        <p className="text-sm mt-3" style={{ color: "#6B7280" }}>
          Completá el precio para calcular con quién podría encajar.
        </p>
      ) : result.count === 0 ? (
        <p className="text-sm mt-3" style={{ color: "#6B7280" }}>
          Todavía ningún contacto de tu cartera encaja con estos datos.
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm" style={{ color: "#1A1A1A", fontWeight: 600 }}>
            <span className="text-2xl text-gradient-brand-h" style={{ fontWeight: 800 }}>
              {result.count}
            </span>{" "}
            {result.count === 1 ? "contacto busca algo así" : "contactos buscan algo así"}
          </p>
          <ul className="mt-3 space-y-1.5">
            {result.top.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate" style={{ color: "#1A1A1A", fontWeight: 600 }}>
                  {b.name}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#F7F0FF", color: "#9B21FF", fontWeight: 700 }}>
                  {b.score}%
                </span>
              </li>
            ))}
          </ul>
          {result.topReasons.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {result.topReasons.map(([reason, count]) => (
                <span key={reason} className="text-xs px-2 py-1 rounded-lg" style={{ background: "#F0FDF4", color: "#15803D", fontWeight: 600 }}>
                  ✓ {reason} · {count}
                </span>
              ))}
            </div>
          )}
        </>
      )}
      <button
        type="button"
        onClick={onSeeAll}
        className="w-full mt-4 min-h-11 rounded-xl text-sm border transition-all hover:bg-violet-50"
        style={{ borderColor: "#DDD8CF", color: "#9B21FF", fontWeight: 600, background: "white" }}
      >
        Ver compradores
      </button>
    </Card>
  );
}
