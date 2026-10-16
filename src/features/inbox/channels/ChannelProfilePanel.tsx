import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { useStore } from "@/data/store";
import { inboxApi, type ChannelConversation } from "@/lib/inbox/api";
import { normalizeWhatsappNumber } from "@/lib/whatsapp";
import type { Contact } from "@/types/db";
import { isSample } from "@/lib/samples";
import { Avatar } from "../ConversationList";
import { norm } from "../conversations";
import { displayName, SOURCE_META } from "./channelMeta";
import { patchChannelConversation } from "./useChannelInbox";

/** Mismo número aunque esté escrito distinto (0221 15…, +54 9 221…, 549221…). */
function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizeWhatsappNumber(a);
  const y = normalizeWhatsappNumber(b);
  if (!x || !y) return false;
  return x === y || x.slice(-10) === y.slice(-10);
}

/**
 * Panel derecho para conversaciones de WhatsApp/Instagram/Messenger:
 * vincular la conversación a un contacto del CRM (búsqueda por teléfono o
 * nombre) o crear el contacto con los datos del canal.
 */
export function ChannelProfilePanel({ conversation, onBack }: { conversation: ChannelConversation; onBack: () => void }) {
  const navigate = useNavigate();
  const { contacts, addContact } = useStore();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = displayName(conversation);

  const linked = conversation.crm_contact_id ? contacts.find((c) => c.id === conversation.crm_contact_id) : undefined;
  const byPhone = useMemo(
    // Una conversación real nunca se vincula a un contacto de ejemplo (ni su id viaja al servidor).
    () => (conversation.contact_phone ? contacts.filter((c) => !isSample(c) && samePhone(c.phone, conversation.contact_phone)) : []),
    [contacts, conversation.contact_phone],
  );
  const results = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return byPhone;
    return contacts.filter((c) => !isSample(c) && norm(`${c.full_name} ${c.phone ?? ""} ${c.email ?? ""}`).includes(q)).slice(0, 8);
  }, [contacts, query, byPhone]);

  async function link(contact: Contact | null) {
    if (isSample(contact)) {
      setError("Es un contacto de ejemplo: no se puede vincular a una conversación real.");
      return;
    }
    setBusy(true);
    setError(null);
    const r = await inboxApi("/api/inbox/conversations", {
      method: "POST",
      body: { action: "link_contact", id: conversation.id, crmContactId: contact?.id ?? null },
    });
    setBusy(false);
    if (!r.ok) {
      setError("No se pudo guardar el vínculo. Probá de nuevo.");
      return;
    }
    patchChannelConversation(conversation.id, { crm_contact_id: contact?.id ?? null });
  }

  async function createAndLink() {
    const c = addContact({
      full_name: conversation.contact_name || conversation.contact_username || conversation.contact_phone || "Contacto de " + SOURCE_META[conversation.channel].label,
      email: null,
      phone: conversation.contact_phone,
      kind: "comprador",
      status: "nuevo",
      profile_type: null,
      notes: `Llegó por ${SOURCE_META[conversation.channel].label}${conversation.contact_username ? ` (@${conversation.contact_username})` : ""}.`,
      owner_id: null,
      requirement: null,
    });
    await link(c);
  }

  const btn = "min-h-[44px] md:min-h-[34px] px-3 rounded-xl text-xs border hover:border-violet-300";

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <button onClick={onBack} className="xl:hidden flex items-center gap-1 text-sm min-h-[44px]" style={{ color: "#9B21FF", fontWeight: 600 }}>
        <ChevronLeftIcon size={16} /> Volver al chat
      </button>

      <Card padded>
        <div className="flex items-center gap-3">
          <Avatar name={name} size={48} />
          <div className="min-w-0">
            <p className="text-sm truncate" style={{ color: "#1A1A1A", fontWeight: 700 }}>
              {name}
            </p>
            <p className="text-xs truncate" style={{ color: "#6B7280" }}>
              {SOURCE_META[conversation.channel].label}
              {conversation.contact_phone ? ` · ${conversation.contact_phone}` : ""}
              {conversation.contact_username ? ` · @${conversation.contact_username}` : ""}
            </p>
          </div>
        </div>
      </Card>

      <Card padded>
        <p className="text-sm mb-2" style={{ color: "#1A1A1A", fontWeight: 700 }}>
          Contacto del CRM
        </p>
        {linked ? (
          <div className="space-y-2">
            <p className="text-sm" style={{ color: "#1A1A1A" }}>
              Vinculada a <strong>{linked.full_name}</strong>
            </p>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => navigate(`/contactos/${linked.id}`)} className={btn} style={{ borderColor: "#E9E5DE", color: "#9B21FF", fontWeight: 600, background: "#FAF8F5" }}>
                Ver ficha
              </button>
              <button disabled={busy} onClick={() => void link(null)} className={btn} style={{ borderColor: "#E9E5DE", color: "#6B7280", fontWeight: 600 }}>
                Desvincular
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {conversation.crm_contact_id && (
              <p className="text-xs" style={{ color: "#92400E" }}>
                Está vinculada a un contacto que no aparece en este navegador.
              </p>
            )}
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar contacto por nombre o teléfono…"
              aria-label="Buscar contacto"
              className="w-full min-h-[44px] md:min-h-[36px] px-3 rounded-xl text-sm border bg-white"
              style={{ borderColor: "#E9E5DE", color: "#1A1A1A" }}
            />
            {!query && byPhone.length > 0 && (
              <p className="text-[11px]" style={{ color: "#166534", fontWeight: 600 }}>
                Coincide el teléfono:
              </p>
            )}
            <ul className="space-y-1">
              {results.map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <span className="text-sm flex-1 truncate" style={{ color: "#1A1A1A" }}>
                    {c.full_name}
                    <span className="text-xs ml-1" style={{ color: "#6B7280" }}>
                      {c.phone ?? ""}
                    </span>
                  </span>
                  <button disabled={busy} onClick={() => void link(c)} className={btn} style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 700 }}>
                    Vincular
                  </button>
                </li>
              ))}
            </ul>
            {query && results.length === 0 && (
              <p className="text-xs" style={{ color: "#6B7280" }}>
                Ningún contacto coincide.
              </p>
            )}
            <button
              disabled={busy}
              onClick={() => void createAndLink()}
              className="w-full min-h-[44px] rounded-xl text-sm text-white disabled:opacity-50"
              style={{ background: "var(--gradient-brand)", fontWeight: 600 }}
            >
              Crear contacto con estos datos
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="text-xs mt-2" style={{ color: "#BE123C", fontWeight: 600 }}>
            {error}
          </p>
        )}
      </Card>
    </div>
  );
}
