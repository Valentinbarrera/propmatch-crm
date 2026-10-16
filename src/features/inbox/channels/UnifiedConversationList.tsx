import type { ChannelConversation } from "@/lib/inbox/api";
import { cleanIncoming, windowInfo } from "@/lib/inbox/window";
import { Avatar, ConversationList, shortTime } from "../ConversationList";
import type { Conversation } from "../conversations";
import { channelItemId, displayName, SOURCE_META, SourceIcon } from "./channelMeta";

type Row =
  | { kind: "app"; at: number; c: Conversation }
  | { kind: "ext"; at: number; c: ChannelConversation };

/**
 * Lista unificada: chats de la app + WhatsApp/Instagram/Messenger, por fecha.
 * Si no hay conversaciones de canales externos delega en la lista original
 * (mismo render que antes, sin cambios para quien solo usa la app).
 */
export function UnifiedConversationList({
  appItems,
  channelItems,
  selectedId,
  onSelect,
  loading,
  error,
  hasAny,
}: {
  appItems: Conversation[];
  channelItems: ChannelConversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
  error: string | null;
  hasAny: boolean;
}) {
  if (channelItems.length === 0) {
    return (
      <ConversationList items={appItems} selectedId={selectedId} onSelect={onSelect} loading={loading} error={error} hasAny={hasAny} />
    );
  }

  const rows: Row[] = [
    ...appItems.map((c): Row => ({ kind: "app", at: Date.parse(c.lastAt), c })),
    ...channelItems.map((c): Row => ({ kind: "ext", at: Date.parse(c.last_message_at ?? c.created_at), c })),
  ].sort((a, b) => b.at - a.at);

  return (
    <ul className="divide-y" style={{ borderColor: "#F0EDE6" }} aria-label="Conversaciones">
      {rows.map((r) => {
        const id = r.kind === "app" ? r.c.id : channelItemId(r.c.id);
        const selected = id === selectedId;
        const source = r.kind === "app" ? "app" : r.c.channel;
        const name = r.kind === "app" ? r.c.name : displayName(r.c);
        const unread = r.kind === "app" ? r.c.unread : r.c.unread_count > 0;
        const preview =
          r.kind === "app"
            ? r.c.last
              ? `${r.c.last.sender_id === r.c.demandanteId ? "" : "Vos: "}${r.c.last.content ?? ""}`
              : "Match nuevo, todavía sin mensajes"
            : `${r.c.last_message_direction === "out" ? "Vos: " : ""}${cleanIncoming(r.c.last_message_preview)}`;
        const win = r.kind === "ext" && r.c.channel !== "messenger" ? windowInfo(r.c.last_inbound_at) : null;
        return (
          <li key={id} style={{ borderColor: "#F0EDE6" }}>
            <button
              onClick={() => onSelect(id)}
              aria-current={selected ? "true" : undefined}
              className="w-full text-left flex gap-3 px-4 py-3 min-h-[72px] transition-colors hover:bg-violet-50"
              style={{ background: selected ? "#F7F0FF" : undefined }}
            >
              <div className="relative flex-shrink-0">
                <Avatar name={name} />
                <span
                  className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center border-2 border-white"
                  style={{ background: SOURCE_META[source].bg }}
                >
                  <SourceIcon source={source} size={11} />
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm truncate" style={{ color: "#1A1A1A", fontWeight: unread ? 800 : 600 }}>
                    {name}
                  </span>
                  <span className="text-xs flex-shrink-0" style={{ color: "#6B7280" }}>
                    {shortTime(new Date(r.at).toISOString())}
                  </span>
                </div>
                {r.kind === "app" && r.c.property && (
                  <span
                    className="inline-block max-w-full truncate align-top text-[11px] px-2 py-0.5 rounded-full mt-0.5"
                    style={{ background: "#F7F0FF", color: "#7C0BD8", fontWeight: 600 }}
                  >
                    {r.c.property.title}
                  </span>
                )}
                <p className="text-xs mt-1 line-clamp-2" style={{ color: unread ? "#1A1A1A" : "#6B7280", fontWeight: unread ? 600 : 400 }}>
                  {preview}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[11px]" style={{ color: SOURCE_META[source].color, fontWeight: 600 }}>
                    {SOURCE_META[source].label}
                  </span>
                  {r.kind === "app" && r.c.unanswered && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ background: "#FFFBEB", color: "#B45309", fontWeight: 700 }}>
                      Sin responder
                    </span>
                  )}
                  {win?.open && win.closingSoon && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ background: "#FFFBEB", color: "#B45309", fontWeight: 700 }}>
                      Cierra pronto
                    </span>
                  )}
                  {r.kind === "ext" && r.c.unread_count > 0 ? (
                    <span
                      className="ml-auto text-[11px] min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center text-white"
                      style={{ background: "#9B21FF", fontWeight: 700 }}
                    >
                      {r.c.unread_count}
                      <span className="sr-only"> sin leer</span>
                    </span>
                  ) : (
                    unread && (
                      <span className="ml-auto flex items-center">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#9B21FF" }} aria-hidden="true" />
                        <span className="sr-only">No leída</span>
                      </span>
                    )
                  )}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
