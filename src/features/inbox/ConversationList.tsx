import { Skeleton } from "@/components/ui/states";
import { avatarGradient, initials } from "@/lib/format";
import { CHANNEL_META, type Conversation } from "./conversations";

export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-full flex items-center justify-center text-white flex-shrink-0 bg-gradient-to-br ${avatarGradient(name)}`}
      style={{ width: size, height: size, fontSize: size * 0.34, fontWeight: 700 }}
    >
      {initials(name)}
    </div>
  );
}

/** Hora corta para la lista: "10:42", "Ayer", "12/09". */
export function shortTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  }
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

export function ConversationList({
  items,
  selectedId,
  onSelect,
  loading,
  error,
  hasAny,
}: {
  items: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
  error: string | null;
  hasAny: boolean;
}) {
  if (loading) {
    return (
      <div className="p-3 space-y-3" aria-busy="true" aria-label="Cargando conversaciones">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-3 items-center">
            <Skeleton className="w-11 h-11 !rounded-full motion-reduce:animate-none flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-2/3 motion-reduce:animate-none" />
              <Skeleton className="h-3 w-full motion-reduce:animate-none" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
          {error ? "No pudimos cargar tus conversaciones" : hasAny ? "Nada coincide con este filtro" : "Todavía no hay conversaciones"}
        </p>
        <p className="text-xs mt-1.5" style={{ color: "#6B7280" }}>
          {error
            ? "Probá de nuevo en unos segundos; se reintenta solo."
            : hasAny
              ? "Probá con otra pestaña o borrá la búsqueda."
              : "Cuando alguien haga match con una de tus propiedades en la app, su chat aparece acá."}
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y" style={{ borderColor: "#F0EDE6" }} aria-label="Conversaciones">
      {items.map((c) => {
        const selected = c.id === selectedId;
        const preview = c.last
          ? `${c.last.sender_id === c.demandanteId ? "" : "Vos: "}${c.last.content ?? ""}`
          : "Match nuevo, todavía sin mensajes";
        return (
          <li key={c.id} style={{ borderColor: "#F0EDE6" }}>
            <button
              onClick={() => onSelect(c.id)}
              aria-current={selected ? "true" : undefined}
              className="w-full text-left flex gap-3 px-4 py-3 min-h-[72px] transition-colors hover:bg-violet-50"
              style={{ background: selected ? "#F7F0FF" : undefined }}
            >
              <Avatar name={c.name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className="text-sm truncate"
                    style={{ color: "#1A1A1A", fontWeight: c.unread ? 800 : 600 }}
                  >
                    {c.name}
                  </span>
                  <span className="text-xs flex-shrink-0" style={{ color: "#6B7280" }}>
                    {shortTime(c.lastAt)}
                  </span>
                </div>
                {c.property && (
                  <span
                    className="inline-block max-w-full truncate align-top text-[11px] px-2 py-0.5 rounded-full mt-0.5"
                    style={{ background: "#F7F0FF", color: "#7C0BD8", fontWeight: 600 }}
                  >
                    {c.property.title}
                  </span>
                )}
                <p
                  className="text-xs mt-1 line-clamp-2"
                  style={{ color: c.unread ? "#1A1A1A" : "#6B7280", fontWeight: c.unread ? 600 : 400 }}
                >
                  {preview}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[11px]" style={{ color: "#6B7280", fontWeight: 600 }}>
                    {CHANNEL_META[c.channel].label}
                  </span>
                  {c.unanswered && (
                    <span
                      className="text-[11px] px-1.5 py-0.5 rounded-full"
                      style={{ background: "#FFFBEB", color: "#B45309", fontWeight: 700 }}
                    >
                      Sin responder
                    </span>
                  )}
                  {c.unread && (
                    <span className="ml-auto flex items-center">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#9B21FF" }} aria-hidden="true" />
                      <span className="sr-only">No leída</span>
                    </span>
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
