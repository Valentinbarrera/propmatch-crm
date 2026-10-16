import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "@/data/store";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, Badge } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/states";
import { InstagramIcon, PlusIcon, ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { getPostKind } from "./imageSpecs";
import { deleteMedias, getMedia, putMedia } from "./mediaStore";
import { useMediaUrls } from "./mediaTools";
import { newPostId, postStore, usePosts, type InstagramPost } from "./postStore";
import { arParts, derivedStatus, formatAr, STATUS_META, type DerivedStatus } from "./schedule";

type Filter = "all" | DerivedStatus;
type Sort = "fecha-asc" | "fecha-desc" | "recientes";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "draft", label: "Borradores" },
  { id: "scheduled", label: "Programadas" },
  { id: "ready", label: "Listas" },
  { id: "overdue", label: "Vencidas" },
  { id: "published", label: "Publicadas" },
];

function PostThumb({ post }: { post: InstagramPost }) {
  const first = post.media.slice(0, 1);
  const { urls, covers } = useMediaUrls(first);
  const m = first[0];
  const src = m ? covers[m.id] ?? urls[m.id] : undefined;
  return (
    <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ background: "#F3F4F6" }}>
      {src ? (
        m.kind === "image" || covers[m.id] ? <img src={src} alt="" className="w-full h-full object-cover" /> : <video src={src} muted preload="metadata" className="w-full h-full object-cover" />
      ) : (
        <InstagramIcon size={24} color="#D4AAFF" />
      )}
    </div>
  );
}

function MonthCalendar({ posts, selected, onSelect }: { posts: InstagramPost[]; selected: string | null; onSelect: (d: string | null) => void }) {
  const today = arParts(Date.now()).date;
  const [ym, setYm] = useState(() => today.slice(0, 7));
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of posts) if (p.scheduledAt && p.status !== "published") map.set(arParts(p.scheduledAt).date, (map.get(arParts(p.scheduledAt).date) ?? 0) + 1);
    return map;
  }, [posts]);
  const shift = (d: number) => {
    const n = new Date(Date.UTC(y, m - 1 + d, 1));
    setYm(`${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, "0")}`);
  };
  const label = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(first);
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];

  return (
    <Card padded>
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => shift(-1)} aria-label="Mes anterior" className="w-11 h-11 rounded-lg hover:bg-violet-50 flex items-center justify-center"><ChevronLeftIcon size={14} color="#6B7280" /></button>
        <p className="text-sm capitalize" style={{ color: "#1A1A1A", fontWeight: 700 }} aria-live="polite">{label}</p>
        <button type="button" onClick={() => shift(1)} aria-label="Mes siguiente" className="w-11 h-11 rounded-lg hover:bg-violet-50 flex items-center justify-center"><ChevronRightIcon size={14} color="#6B7280" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] mb-1" style={{ color: "#6B7280" }} aria-hidden="true">
        {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d == null) return <span key={`e${i}`} />;
          const date = `${ym}-${String(d).padStart(2, "0")}`;
          const n = byDay.get(date) ?? 0;
          const on = selected === date;
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelect(on ? null : date)}
              aria-pressed={on}
              aria-label={`${d} de ${label}${n ? `: ${n} ${n === 1 ? "publicación" : "publicaciones"}` : ""}${date === today ? " (hoy)" : ""}`}
              className="min-h-11 md:min-h-9 rounded-lg text-xs flex flex-col items-center justify-center"
              style={{ background: on ? "#9B21FF" : n ? "#F7F0FF" : "transparent", color: on ? "white" : "#1A1A1A", border: `1px solid ${date === today ? "#9B21FF" : "transparent"}`, fontWeight: n ? 700 : 500 }}
            >
              {d}
              {n > 0 && <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full" style={{ background: on ? "white" : "#9B21FF" }} />}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

export default function InstagramStudioPage() {
  const navigate = useNavigate();
  const { removeEvent, isDemo } = useStore();
  const posts = usePosts();
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("fecha-asc");
  const [query, setQuery] = useState("");
  const [day, setDay] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const now = Date.now();

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return posts
      .map((p) => ({ p, s: derivedStatus(p, now) }))
      .filter(({ p, s }) => (filter === "all" || s === filter) && (!q || `${p.title} ${p.body}`.toLowerCase().includes(q)) && (!day || (p.scheduledAt && arParts(p.scheduledAt).date === day)))
      .sort((a, b) => {
        if (sort === "recientes") return b.p.updatedAt.localeCompare(a.p.updatedAt);
        const ta = a.p.scheduledAt ? new Date(a.p.scheduledAt).getTime() : sort === "fecha-asc" ? Infinity : -Infinity;
        const tb = b.p.scheduledAt ? new Date(b.p.scheduledAt).getTime() : sort === "fecha-asc" ? Infinity : -Infinity;
        return sort === "fecha-asc" ? ta - tb : tb - ta;
      });
    // `now` cambia en cada render y el estado derivado depende del reloj.
  }, [posts, filter, sort, query, day, now]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: posts.length };
    for (const p of posts) c[derivedStatus(p, now)] = (c[derivedStatus(p, now)] ?? 0) + 1;
    return c;
  }, [posts, now]);

  const duplicate = async (p: InstagramPost) => {
    const idMap = new Map<string, string>();
    const media = [] as InstagramPost["media"];
    let failed = 0;
    for (const m of p.media) {
      const id = newPostId("m");
      idMap.set(m.id, id);
      if (m.source === "upload") {
        const rec = await getMedia(m.id);
        if (!rec || !(await putMedia(id, rec.blob, rec.name))) {
          failed++;
          continue;
        }
        if (m.hasCover) {
          const c = await getMedia(`${m.id}:cover`);
          if (c) await putMedia(`${id}:cover`, c.blob, c.name);
        }
      }
      media.push({ ...m, id });
    }
    const now = new Date().toISOString();
    const copy: InstagramPost = { ...p, id: newPostId(), title: `${p.title.trim() || "Publicación"} (copia)`, media, status: "draft", scheduledAt: null, reminderEventId: null, publishedAt: null, publishedUrl: null, createdAt: now, updatedAt: now };
    postStore.save(copy);
    setNotice(failed ? `Duplicamos la publicación, pero ${failed} ${failed === 1 ? "archivo no se pudo copiar" : "archivos no se pudieron copiar"}.` : "Duplicada como borrador, sin fecha.");
  };

  const remove = (p: InstagramPost) => {
    if (!window.confirm(`¿Eliminar «${p.title.trim() || "esta publicación"}»? Se borran sus archivos de este navegador${p.reminderEventId ? " y su recordatorio de la Agenda" : ""}. No se puede deshacer.`)) return;
    if (p.reminderEventId) removeEvent(p.reminderEventId);
    void deleteMedias(p.media.flatMap((m) => [m.id, `${m.id}:cover`]));
    postStore.remove(p.id);
    setNotice("Publicación eliminada.");
  };

  const chip = (active: boolean) => ({ borderColor: active ? "#9B21FF" : "#E9E5DE", background: active ? "#F7F0FF" : "white", color: active ? "#56148F" : "#6B7280", fontWeight: 700 }) as const;

  return (
    <>
      <AppHeader title="Instagram" subtitle="Armá carruseles, fotos, stories y reels, programá el recordatorio y publicá." breadcrumb={["Publicaciones", "Instagram"]} action={{ label: "Nueva publicación", onClick: () => navigate("/instagram/nueva") }} />
      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-10">
        {!isDemo && (
          <p className="mt-4 text-xs" style={{ color: "#6B7280" }}>
            Tus publicaciones se guardan en este navegador (no en un servidor): si borrás los datos del sitio o abrís PropMatch en otro equipo, no van a estar.
          </p>
        )}
        <p role="status" aria-live="polite" className={notice ? "mt-3 text-sm px-4 py-2 rounded-xl" : "sr-only"} style={{ background: "#F0FDF4", color: "#15803D" }}>{notice}</p>

        {posts.length === 0 ? (
          <Card className="mt-6">
            <EmptyState
              icon={<InstagramIcon size={26} color="#9B21FF" />}
              title="Todavía no armaste ninguna publicación"
              description="Subí tus fotos o un video, editalos, mirá cómo queda en Instagram y programá un recordatorio para publicar."
              action={{ label: "Nueva publicación", onClick: () => navigate("/instagram/nueva") }}
            />
          </Card>
        ) : (
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start">
            <div className="flex flex-col gap-4 min-w-0">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
                {FILTERS.map((f) => (
                  <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} className="px-3 min-h-11 md:min-h-9 rounded-xl border text-xs" style={chip(filter === f.id)}>
                    {f.label} ({counts[f.id] ?? 0})
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-3">
                <div className="flex-1 min-w-[200px]">
                  <label htmlFor="ig-search" className="sr-only">Buscar publicaciones</label>
                  <input id="ig-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre o texto" className="w-full rounded-lg border px-3 min-h-11 text-sm" style={{ borderColor: "#E9E5DE", color: "#1A1A1A", background: "white" }} />
                </div>
                <div>
                  <label htmlFor="ig-sort" className="sr-only">Ordenar</label>
                  <select id="ig-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-lg border px-3 min-h-11 text-sm" style={{ borderColor: "#E9E5DE", color: "#1A1A1A", background: "white" }}>
                    <option value="fecha-asc">Fecha: próximas primero</option>
                    <option value="fecha-desc">Fecha: lejanas primero</option>
                    <option value="recientes">Editadas recientemente</option>
                  </select>
                </div>
              </div>
              {day && (
                <p className="text-xs" style={{ color: "#56148F" }}>
                  Mostrando el {day.split("-").reverse().join("/")}. <button type="button" onClick={() => setDay(null)} className="underline min-h-11 px-1">Quitar filtro de día</button>
                </p>
              )}

              {rows.length === 0 ? (
                <Card><EmptyState compact title="Ninguna publicación coincide" description="Probá con otro filtro o búsqueda." /></Card>
              ) : (
                <ul className="flex flex-col gap-3">
                  {rows.map(({ p, s }) => {
                    const meta = STATUS_META[s];
                    const kind = getPostKind(p.kind);
                    return (
                      <li key={p.id}>
                        <Card>
                          <div className="p-3 flex flex-wrap items-start gap-3">
                            <button type="button" onClick={() => navigate(`/instagram/${p.id}`)} aria-label={`Abrir ${p.title || "publicación sin título"}`} className="rounded-xl"><PostThumb post={p} /></button>
                            <div className="flex-1 min-w-[160px]">
                              <p className="text-sm truncate" style={{ color: "#1A1A1A", fontWeight: 700 }}>{p.title.trim() || "Publicación sin título"}</p>
                              <p className="text-xs mt-0.5 flex items-center gap-1.5 flex-wrap" style={{ color: "#6B7280" }}>
                                <Badge bg="#F3F4F6" text="#4B5563" size="xs">{kind.label}{p.kind === "carousel" ? ` · ${p.media.length}` : ""}</Badge>
                                <Badge bg={meta.bg} text={meta.text} size="xs">{meta.label}</Badge>
                              </p>
                              <p className="text-xs mt-1" style={{ color: "#4B5563" }}>
                                {s === "published" ? `Publicada: ${formatAr(p.publishedAt)}` : p.scheduledAt ? `Programada: ${formatAr(p.scheduledAt)}` : "Sin fecha"}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-1.5 ml-auto">
                              <button type="button" onClick={() => navigate(`/instagram/${p.id}`)} className="px-3 min-h-11 md:min-h-9 rounded-lg border text-xs hover:bg-violet-50" style={{ borderColor: "#E9E5DE", color: "#6B7280", fontWeight: 700 }}>Editar</button>
                              {s !== "published" && <button type="button" onClick={() => navigate(`/instagram/${p.id}?paso=programar`)} className="px-3 min-h-11 md:min-h-9 rounded-lg border text-xs hover:bg-violet-50" style={{ borderColor: "#E9E5DE", color: "#6B7280", fontWeight: 700 }}>{p.scheduledAt ? "Reprogramar" : "Programar"}</button>}
                              <button type="button" onClick={() => void duplicate(p)} className="px-3 min-h-11 md:min-h-9 rounded-lg border text-xs hover:bg-violet-50" style={{ borderColor: "#E9E5DE", color: "#6B7280", fontWeight: 700 }}>Duplicar</button>
                              <button type="button" onClick={() => remove(p)} className="px-3 min-h-11 md:min-h-9 rounded-lg border text-xs hover:bg-rose-50" style={{ borderColor: "#FECDD3", color: "#BE123C", fontWeight: 700 }}>Eliminar</button>
                            </div>
                          </div>
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="flex flex-col gap-4">
              <button type="button" onClick={() => navigate("/instagram/nueva")} className="px-5 min-h-11 rounded-xl text-sm text-white flex items-center justify-center gap-2 hover:opacity-90" style={{ background: "var(--gradient-brand)", fontWeight: 700, boxShadow: "var(--shadow-cta)" }}>
                <PlusIcon size={14} color="white" /> Nueva publicación
              </button>
              <MonthCalendar posts={posts} selected={day} onSelect={setDay} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
