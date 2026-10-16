import { useEffect, useMemo, useState } from "react";
import { inboxApi, type WaTemplate } from "@/lib/inbox/api";

const CATEGORY_LABEL: Record<string, string> = { MARKETING: "Marketing", UTILITY: "Utilidad", AUTHENTICATION: "Autenticación" };

function bodyOf(t: WaTemplate): string {
  return t.components.find((c) => c.type === "BODY")?.text ?? "";
}

/**
 * Selector de plantillas aprobadas de WhatsApp (para cuando la ventana de
 * 24 h está cerrada). Muestra la vista previa con las variables completas.
 */
export function TemplatePicker({
  accountId,
  sending,
  onSend,
}: {
  accountId: string;
  sending: boolean;
  onSend: (t: { name: string; language: string; params: string[] }) => void;
}) {
  const [templates, setTemplates] = useState<WaTemplate[] | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [params, setParams] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    void inboxApi<{ templates: WaTemplate[] }>(`/api/inbox/channels?templates=${encodeURIComponent(accountId)}`).then((r) => {
      if (alive) setTemplates(r.data?.templates ?? []);
    });
    return () => {
      alive = false;
    };
  }, [accountId]);

  const tpl = templates?.find((t) => t.id === selected);
  useEffect(() => setParams(Array.from({ length: tpl?.body_params ?? 0 }, () => "")), [tpl?.id, tpl?.body_params]);

  const preview = useMemo(
    () => (tpl ? bodyOf(tpl).replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => params[Number(n) - 1] || `{{${n}}}`) : ""),
    [tpl, params],
  );
  const ready = !!tpl && params.every((p) => p.trim());

  if (templates === null) {
    return (
      <p className="text-xs" style={{ color: "#6B7280" }}>
        Cargando plantillas…
      </p>
    );
  }
  if (templates.length === 0) {
    return (
      <p className="text-xs" style={{ color: "#6B7280" }}>
        No hay plantillas aprobadas. Creálas en WhatsApp Manager y sincronizalas desde Configuración → Canales.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        aria-label="Elegir plantilla"
        className="w-full min-h-[44px] md:min-h-[38px] px-3 rounded-xl text-sm border bg-white"
        style={{ borderColor: "#E9E5DE", color: "#1A1A1A" }}
      >
        <option value="">Elegí una plantilla aprobada…</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} · {t.language}
            {t.category ? ` · ${CATEGORY_LABEL[t.category] ?? t.category}` : ""}
          </option>
        ))}
      </select>
      {tpl && (
        <>
          {params.map((p, i) => (
            <input
              key={i}
              value={p}
              onChange={(e) => setParams((prev) => prev.map((x, j) => (j === i ? e.target.value.replace(/[\n\t]/g, " ") : x)))}
              placeholder={`Variable {{${i + 1}}}`}
              aria-label={`Variable ${i + 1}`}
              maxLength={1024}
              className="w-full min-h-[44px] md:min-h-[36px] px-3 rounded-xl text-sm border bg-white"
              style={{ borderColor: "#E9E5DE", color: "#1A1A1A" }}
            />
          ))}
          <p className="text-xs rounded-xl px-3 py-2 whitespace-pre-wrap" style={{ background: "#FAF8F5", color: "#56148F" }}>
            {preview}
          </p>
          {tpl.category === "MARKETING" && (
            <p className="text-[11px]" style={{ color: "#92400E" }}>
              Las plantillas de marketing tienen costo por mensaje entregado.
            </p>
          )}
          <button
            disabled={!ready || sending}
            onClick={() => onSend({ name: tpl.name, language: tpl.language, params })}
            className="min-h-[44px] px-5 rounded-xl text-sm text-white disabled:opacity-50"
            style={{ background: "var(--gradient-brand)", fontWeight: 600 }}
          >
            {sending ? "Enviando…" : "Enviar plantilla"}
          </button>
        </>
      )}
    </div>
  );
}
