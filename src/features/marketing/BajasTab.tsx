import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/states";
import { CheckCircleIcon } from "@/components/ui/icons";
import { SampleBadge } from "@/components/ui/SampleBadge";
import type { Contact } from "@/types/db";
import { pushPending } from "@/lib/marketing/api";
import { CONSENT_METHOD_LABEL, UNSUB_SOURCE_LABEL } from "@/lib/marketing/types";
import { maskEmail, maskPhoneDigits, normalizeEmail, normalizePhone, SCOPE_LABEL } from "../../../shared/marketing";
import { ConsentModal } from "./ConsentModal";
import { useMarketingCtx } from "./useMarketingCtx";
import { Btn, fmtDate, INPUT, Notice } from "./ui";

export function BajasTab() {
  const { m, store, agencyId } = useMarketingCtx();
  const [modal, setModal] = useState<{ contact: Contact; mode: "consent" | "baja" } | null>(null);
  const [pick, setPick] = useState("");
  const [showRevoked, setShowRevoked] = useState(false);

  const contactFor = (u: { contact_id: string | null; email: string | null; phone: string | null }) =>
    store.contacts.find(
      (c) =>
        (u.contact_id && c.id === u.contact_id) ||
        (u.email && normalizeEmail(c.email) === normalizeEmail(u.email)) ||
        (u.phone && normalizePhone(c.phone) === normalizePhone(u.phone)),
    );
  const unsubs = useMemo(
    () => [...m.unsubs, ...m.server.unsubs].filter((u) => showRevoked || !u.revoked_at).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [m.unsubs, m.server.unsubs, showRevoked],
  );
  const consents = useMemo(() => [...m.consents, ...m.server.consents].sort((a, b) => b.given_at.localeCompare(a.given_at)), [m.consents, m.server.consents]);
  const pending = m.consents.filter((c) => !c.synced).length + m.unsubs.filter((u) => !u.synced).length;
  const picked = store.contactById(pick);

  return (
    <div className="space-y-4">
      {pending > 0 && (
        <Notice tone={m.status.configured.db ? "info" : "warn"}>
          {pending} {pending === 1 ? "registro cargado" : "registros cargados"} en este navegador{" "}
          {m.status.configured.db ? "todavía sin subir al servidor." : "(no hay servidor de marketing: viven solo acá; se suben cuando se configure)."}
          {m.status.configured.db && (
            <>
              {" "}
              <button className="underline" onClick={() => void pushPending(agencyId, store.contacts)}>
                Subir ahora
              </button>
            </>
          )}
        </Notice>
      )}

      <Card padded>
        <p className="text-sm mb-3" style={{ color: "#1A1A1A", fontWeight: 700 }}>
          Registrar para un contacto
        </p>
        <div className="flex flex-wrap gap-2">
          <select className={`${INPUT} sm:w-80`} value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Elegí un contacto…</option>
            {store.contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
                {c.is_sample ? " (ejemplo)" : ""}
              </option>
            ))}
          </select>
          <Btn disabled={!picked} onClick={() => picked && setModal({ contact: picked, mode: "consent" })}>
            Consentimiento
          </Btn>
          <Btn kind="danger" disabled={!picked} onClick={() => picked && setModal({ contact: picked, mode: "baja" })}>
            Baja
          </Btn>
        </div>
      </Card>

      <Card>
        <div className="px-5 py-3 border-b flex items-center gap-3" style={{ borderColor: "#F0EDE6" }}>
          <p className="text-sm flex-1" style={{ color: "#1A1A1A", fontWeight: 700 }}>
            Bajas ({unsubs.filter((u) => !u.revoked_at).length} vigentes)
          </p>
          <label className="text-xs flex items-center gap-1.5" style={{ color: "#6B7280" }}>
            <input type="checkbox" checked={showRevoked} onChange={(e) => setShowRevoked(e.target.checked)} />
            Ver revertidas
          </label>
        </div>
        {unsubs.length === 0 ? (
          <EmptyState compact icon={<CheckCircleIcon size={20} />} title="Nadie se dio de baja" description="Las bajas por link, WhatsApp o cargadas a mano aparecen acá." />
        ) : (
          <ul className="divide-y" style={{ borderColor: "#F0EDE6" }}>
            {unsubs.map((u) => {
              const c = contactFor(u);
              return (
                <li key={u.id} className="px-5 py-3 flex flex-wrap items-center gap-2 text-sm">
                  <span style={{ color: "#1F2937", fontWeight: 600 }}>{c?.full_name ?? (u.email ? maskEmail(u.email) : maskPhoneDigits(u.phone))}</span>
                  <SampleBadge record={c} />
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#FFF1F2", color: "#BE123C", fontWeight: 600 }}>
                    {SCOPE_LABEL[u.scope]}
                  </span>
                  <span className="text-xs" style={{ color: "#6B7280" }}>
                    {UNSUB_SOURCE_LABEL[u.source]} · {fmtDate(u.created_at)}
                    {u.note ? ` · ${u.note}` : ""}
                    {!u.synced && " · sin subir"}
                    {u.revoked_at && ` · revertida el ${fmtDate(u.revoked_at)} por consentimiento nuevo`}
                  </span>
                  {c && !u.revoked_at && (
                    <button className="ml-auto text-xs underline" style={{ color: "#9B21FF" }} onClick={() => setModal({ contact: c, mode: "consent" })}>
                      Volvió a dar consentimiento
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <div className="px-5 py-3 border-b" style={{ borderColor: "#F0EDE6" }}>
          <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
            Consentimientos ({consents.length})
          </p>
        </div>
        {consents.length === 0 ? (
          <EmptyState compact title="Sin consentimientos registrados" description="Sin consentimiento no se le envía marketing a nadie." />
        ) : (
          <ul className="divide-y max-h-[480px] overflow-y-auto" style={{ borderColor: "#F0EDE6" }}>
            {consents.slice(0, 300).map((x) => {
              const c = contactFor({ contact_id: x.contact_id, email: x.email ?? null, phone: x.phone ?? null });
              return (
                <li key={x.id} className="px-5 py-2.5 flex flex-wrap items-center gap-2 text-sm">
                  <span style={{ color: "#1F2937", fontWeight: 600 }}>{c?.full_name ?? "Contacto"}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={x.status === "granted" ? { background: "#F0FDF4", color: "#15803D" } : { background: "#F3F4F6", color: "#4B5563" }}>
                    {x.channel === "email" ? "Email" : "WhatsApp"} · {x.status === "granted" ? "dio consentimiento" : "lo retiró"}
                  </span>
                  <span className="text-xs" style={{ color: "#6B7280" }}>
                    {CONSENT_METHOD_LABEL[x.method] ?? x.method} · {fmtDate(x.given_at)}
                    {x.evidence ? ` · ${x.evidence}` : ""}
                    {!x.synced && " · sin subir"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {modal && <ConsentModal contact={modal.contact} mode={modal.mode} onClose={() => setModal(null)} />}
    </div>
  );
}
