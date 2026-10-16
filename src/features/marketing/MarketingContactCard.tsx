import { useState } from "react";
import { Card } from "@/components/ui/Card";
import type { Contact } from "@/types/db";
import { useStore } from "@/data/store";
import { setTags } from "@/lib/marketing/actions";
import { latestConsent, useContactBlock } from "@/lib/marketing/block";
import { useMarketing } from "@/lib/marketing/state";
import { CONSENT_METHOD_LABEL, type MarketingChannel } from "@/lib/marketing/types";
import { ConsentModal } from "./ConsentModal";
import { Btn, fmtDate, INPUT, NoContactBadge } from "./ui";

/** Tarjeta "Marketing" en la ficha del contacto: No contactar, consentimiento por canal y etiquetas. */
export function MarketingContactCard({ contact }: { contact: Contact }) {
  const { agency } = useStore();
  const m = useMarketing(agency.id);
  const block = useContactBlock(agency.id, contact);
  const [modal, setModal] = useState<"consent" | "baja" | null>(null);
  const [tag, setTag] = useState("");
  const tags = m.tags[contact.id] ?? [];

  const row = (ch: MarketingChannel) => {
    const c = latestConsent(m, contact, ch);
    const blocked = ch === "email" ? block.email : block.whatsapp;
    return (
      <div className="flex items-center justify-between gap-2 text-xs">
        <span style={{ color: "#4B5563", fontWeight: 600 }}>{ch === "email" ? "Email" : "WhatsApp"}</span>
        <span style={{ color: blocked ? "#BE123C" : c?.status === "granted" ? "#15803D" : "#9CA3AF" }}>
          {blocked
            ? "Dado de baja"
            : c?.status === "granted"
              ? `Consentimiento ${fmtDate(c.given_at).slice(0, 10)} · ${CONSENT_METHOD_LABEL[c.method] ?? c.method}`
              : "Sin consentimiento"}
        </span>
      </div>
    );
  };

  return (
    <Card padded>
      <div className="flex items-center gap-2 mb-3">
        <p className="text-sm flex-1" style={{ color: "#1A1A1A", fontWeight: 700 }}>
          Marketing
        </p>
        <NoContactBadge label={block.label} size="sm" />
      </div>
      <div className="space-y-1.5">
        {row("email")}
        {row("whatsapp")}
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3">
        {tags.map((t) => (
          <button
            key={t}
            onClick={() => setTags(agency.id, contact.id, tags.filter((x) => x !== t))}
            className="text-[11px] px-2 py-0.5 rounded-full border"
            style={{ borderColor: "#E9E5DE", color: "#9B21FF" }}
            title="Quitar etiqueta"
          >
            {t} ×
          </button>
        ))}
      </div>
      <input
        className={`${INPUT} mt-2`}
        value={tag}
        onChange={(e) => setTag(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && tag.trim()) {
            setTags(agency.id, contact.id, [...tags, tag.trim()]);
            setTag("");
          }
        }}
        placeholder="Agregar etiqueta y Enter"
        aria-label="Agregar etiqueta de marketing"
      />
      <div className="flex flex-wrap gap-2 mt-3">
        <Btn onClick={() => setModal("consent")}>{block.any ? "Volvió a dar consentimiento" : "Registrar consentimiento"}</Btn>
        <Btn kind="danger" onClick={() => setModal("baja")}>
          No contactar
        </Btn>
      </div>
      {modal && <ConsentModal contact={contact} mode={modal} onClose={() => setModal(null)} />}
    </Card>
  );
}
