import { InstagramIcon, WhatsAppIcon } from "@/components/ui/icons";
import type { ChannelConversation, ExternalChannel } from "@/lib/inbox/api";
import { norm } from "../conversations";

/** Fuente del inbox unificado: la app PropMatch o un canal externo. */
export type InboxSource = "all" | "app" | ExternalChannel;

export const SOURCE_META: Record<Exclude<InboxSource, "all">, { label: string; color: string; bg: string }> = {
  app: { label: "App PropMatch", color: "#9B21FF", bg: "#F7F0FF" },
  whatsapp: { label: "WhatsApp", color: "#128C7E", bg: "#E7F8F1" },
  instagram: { label: "Instagram", color: "#C13584", bg: "#FFF1FA" },
  messenger: { label: "Messenger", color: "#0866FF", bg: "#EAF2FF" },
};

function MessengerIcon({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill={color}
        d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.42 3.14 7.16.16.15.26.35.27.57l.05 1.78a.8.8 0 0 0 1.12.71l1.98-.87a.8.8 0 0 1 .53-.04c.91.25 1.88.38 2.9.38 5.64 0 10-4.13 10-9.7S17.64 2 12 2Zm6 7.46-2.94 4.66a1.5 1.5 0 0 1-2.17.4l-2.34-1.75a.6.6 0 0 0-.72 0l-3.16 2.4c-.42.32-.97-.18-.69-.63l2.94-4.66a1.5 1.5 0 0 1 2.17-.4l2.34 1.75a.6.6 0 0 0 .72 0l3.16-2.4c.42-.32.97.18.69.63Z"
      />
    </svg>
  );
}

function AppGlyph({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 11L12 4l9 7v9H3v-9Z" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <path d="M9.5 15.5a3.5 3.5 0 0 0 5 0" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function SourceIcon({ source, size = 14 }: { source: Exclude<InboxSource, "all">; size?: number }) {
  const color = SOURCE_META[source].color;
  if (source === "whatsapp") return <WhatsAppIcon size={size} color={color} />;
  if (source === "instagram") return <InstagramIcon size={size} color={color} />;
  if (source === "messenger") return <MessengerIcon size={size} color={color} />;
  return <AppGlyph size={size} color={color} />;
}

export function displayName(c: ChannelConversation): string {
  return c.contact_name || (c.contact_username ? `@${c.contact_username}` : null) || c.contact_phone || "Sin nombre";
}

/** Filtros del inbox aplicados a las conversaciones de canales externos. */
export function filterChannelConversations(
  list: ChannelConversation[],
  f: { source: InboxSource; tab: string; query: string; agentId: string },
): ChannelConversation[] {
  if (f.source === "app" || f.tab === "app") return [];
  const q = norm(f.query.trim());
  return list.filter((c) => {
    if (f.source !== "all" && c.channel !== f.source) return false;
    if (f.tab === "no_leidas" && c.unread_count === 0) return false;
    if (f.agentId && c.assigned_to !== f.agentId) return false;
    if (!q) return true;
    return norm(`${displayName(c)} ${c.contact_phone ?? ""} ${c.contact_username ?? ""} ${c.last_message_preview ?? ""}`).includes(q);
  });
}

export const CHANNEL_ID_PREFIX = "ch:";
export const channelItemId = (id: string) => `${CHANNEL_ID_PREFIX}${id}`;
export const channelIdOf = (itemId: string | null) =>
  itemId && itemId.startsWith(CHANNEL_ID_PREFIX) ? itemId.slice(CHANNEL_ID_PREFIX.length) : null;
