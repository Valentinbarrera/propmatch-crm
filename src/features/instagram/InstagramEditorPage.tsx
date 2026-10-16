import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useStore } from "@/data/store";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, Badge } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/states";
import { ChevronLeftIcon, InstagramIcon } from "@/components/ui/icons";
import type { Property } from "@/types/db";
import { buildCaption, buildGenericCaption, DEFAULT_OPTIONS, genericHashtags, joinCaption, suggestHashtags } from "./caption";
import { CaptionPanel } from "./CaptionPanel";
import { getFormat, IG_FORMATS, getPostKind, POST_KINDS, STORY_SAFE, type IgFormatId, type PostKind } from "./imageSpecs";
import { MediaStep, levelOf } from "./MediaStep";
import { deleteMedias, mediaAvailable, putMedia } from "./mediaStore";
import { probeFile, useMediaUrls } from "./mediaTools";
import { copyEdits, PhotoEditorPanel } from "./PhotoEditorPanel";
import { DEFAULT_EDITS, loadImage, normalizeEdits, type PhotoEdits } from "./photoEdits";
import { PhoneMockup, type PreviewTab } from "./PhoneMockup";
import { newPostId, postStore, type InstagramPost, type PostMedia } from "./postStore";
import { PublishStep } from "./PublishStep";
import { eventTitle, useReminders } from "./reminders";
import { derivedStatus, STATUS_META } from "./schedule";
import { ScheduleStep } from "./ScheduleStep";
import { useUndoState } from "./useUndo";
import { useBakedPreviews } from "./usePreviews";
import { VideoCoverPanel } from "./VideoCoverPanel";
import { LEVEL_STYLE } from "./imageSpecs";

type Step = "medios" | "editar" | "texto" | "programar" | "publicar";
const STEPS: { id: Step; label: string }[] = [
  { id: "medios", label: "Medios" },
  { id: "editar", label: "Editar" },
  { id: "texto", label: "Texto" },
  { id: "programar", label: "Programar" },
  { id: "publicar", label: "Publicar" },
];

const isVertical = (k: PostKind) => k === "story" || k === "reel";

/** Fotos de la propiedad -> medios del Estudio. Si se pueden leer (CORS), se guardan en el navegador; si no, quedan como enlace. */
async function importPropertyPhotos(urls: string[], max: number): Promise<PostMedia[]> {
  const out: PostMedia[] = [];
  for (const url of urls) {
    if (out.length >= max) break;
    const id = newPostId("m");
    const name = `foto-${out.length + 1}.jpg`;
    try {
      const blob = await (await fetch(url)).blob();
      if (!blob.type.startsWith("image/")) throw new Error("no es imagen");
      const p = await probeFile(blob, "image");
      if (!(await putMedia(id, blob, name))) throw new Error("sin espacio");
      out.push({ id, kind: "image", source: "upload", name, mime: blob.type, bytes: blob.size, width: p.width, height: p.height, alt: "", edits: { ...DEFAULT_EDITS } });
    } catch {
      try {
        const img = await loadImage(url);
        out.push({ id, kind: "image", source: "remote", url, name, mime: "", bytes: 0, width: img.naturalWidth, height: img.naturalHeight, alt: "", edits: { ...DEFAULT_EDITS } });
      } catch {
        /* foto ilegible: se omite */
      }
    }
  }
  return out;
}

/* ── Pantalla «Nueva publicación» ─────────────────────────────────────────── */

function NewPost() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { properties, photos, agency } = useStore();
  const [kind, setKind] = useState<PostKind>("carousel");
  const [propertyId, setPropertyId] = useState(params.get("propiedad") ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const info = getPostKind(kind);
  const property = properties.find((p) => p.id === propertyId) ?? null;

  const create = async () => {
    setBusy(true);
    const now = new Date().toISOString();
    const options = DEFAULT_OPTIONS;
    let media: PostMedia[] = [];
    if (property && info.accepts.includes("image")) {
      setNote("Preparando las fotos de la propiedad…");
      media = await importPropertyPhotos(photos[property.id] ?? [], info.max);
    }
    const post: InstagramPost = {
      v: 1,
      id: newPostId(),
      kind,
      title: property?.title ?? "",
      format: info.formatId,
      media,
      body: !info.hasCaption ? "" : property ? buildCaption(property, agency, options) : buildGenericCaption(agency, options),
      hashtags: (property ? suggestHashtags(property, agency) : genericHashtags(agency)).slice(0, 5),
      options,
      propertyId: property?.id ?? null,
      status: "draft",
      scheduledAt: null,
      reminderEventId: null,
      publishedAt: null,
      publishedUrl: null,
      createdAt: now,
      updatedAt: now,
    };
    postStore.save(post);
    navigate(`/instagram/${post.id}`, { replace: true });
  };

  return (
    <>
      <AppHeader title="Nueva publicación" subtitle="Elegí qué vas a armar." breadcrumb={["Instagram", "Nueva"]}>
        <button onClick={() => navigate("/instagram")} className="px-3 min-h-11 md:min-h-9 rounded-xl text-xs border flex items-center gap-1 hover:bg-violet-50" style={{ borderColor: "#E9E5DE", color: "#6B7280", fontWeight: 700, background: "white" }}>
          <ChevronLeftIcon size={12} /> Volver
        </button>
      </AppHeader>
      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-10">
        <div className="mt-6 max-w-4xl flex flex-col gap-6">
          <fieldset>
            <legend className="text-sm mb-3" style={{ color: "#1A1A1A", fontWeight: 700 }}>Tipo de publicación</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {POST_KINDS.map((k) => {
                const on = kind === k.id;
                return (
                  <label key={k.id} className="rounded-2xl border p-4 cursor-pointer flex flex-col gap-1.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 min-h-11" style={{ borderColor: on ? "#9B21FF" : "#E9E5DE", background: on ? "#F7F0FF" : "white" }}>
                    <input type="radio" name="post-kind" className="sr-only" checked={on} onChange={() => setKind(k.id)} />
                    <span className="flex items-center gap-2">
                      <span className="text-base" style={{ color: "#1A1A1A", fontWeight: 800 }}>{k.label}</span>
                      <Badge bg="#F3F4F6" text="#4B5563" size="xs">{k.short}</Badge>
                    </span>
                    <span className="text-xs" style={{ color: "#4B5563" }}>{k.help}</span>
                    <span className="text-[11px]" style={{ color: "#6B7280" }}>{k.limits}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <Card padded>
            <label htmlFor="new-prop" className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>Crear desde una propiedad (opcional)</label>
            <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
              Precarga sus fotos y arma el texto con sus datos reales. Si no elegís ninguna, empezás con tus propias fotos o videos y una plantilla editable.
              {kind === "reel" && " Un Reel es un video: no se precargan fotos."}
            </p>
            <select id="new-prop" value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="mt-2 w-full max-w-md rounded-lg border px-3 min-h-11 text-sm" style={{ borderColor: "#E9E5DE", color: "#1A1A1A", background: "white" }}>
              <option value="">Sin propiedad (publicación independiente)</option>
              {[...properties].sort((a, b) => a.title.localeCompare(b.title)).map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </Card>

          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" onClick={create} disabled={busy} className="px-6 min-h-11 rounded-xl text-sm text-white hover:opacity-90 disabled:opacity-50" style={{ background: "var(--gradient-brand)", fontWeight: 700, boxShadow: "var(--shadow-cta)" }}>
              {busy ? "Creando…" : `Crear ${info.label.toLowerCase()}`}
            </button>
            <span role="status" aria-live="polite" className="text-xs" style={{ color: "#6B7280" }}>{note}</span>
          </div>
          <p className="text-xs" style={{ color: "#6B7280" }}>Se guarda en este navegador: las fotos y los videos no se suben a ningún servidor.</p>
        </div>
      </div>
    </>
  );
}

/* ── Editor ───────────────────────────────────────────────────────────────── */

type Meta = Omit<InstagramPost, "media">;

function Editor({ initial }: { initial: InstagramPost }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { agency, properties } = useStore();
  const { schedule } = useReminders();
  const { media: _m, ...metaInit } = initial;
  void _m;
  const [meta, setMeta] = useState<Meta>(metaInit);
  const hist = useUndoState<PostMedia[]>(initial.media.map((m) => ({ ...m, edits: normalizeEdits(m.edits) })));
  const media = hist.value;
  const post = useMemo<InstagramPost>(() => ({ ...meta, media }), [meta, media]);

  const initialStep = STEPS.find((s) => s.id === params.get("paso"))?.id ?? (initial.media.length ? "editar" : "medios");
  const [step, setStep] = useState<Step>(initialStep);
  const [selectedId, setSelectedId] = useState<string | null>(initial.media[0]?.id ?? null);
  const [tab, setTab] = useState<PreviewTab>(initial.kind === "reel" ? "reel" : initial.kind === "story" ? "story" : "feed");
  const [index, setIndex] = useState(0);
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const [saved, setSaved] = useState<"ok" | "fail">("ok");
  const [storageOk, setStorageOk] = useState<boolean | null>(null);

  const kind = getPostKind(meta.kind);
  const format = getFormat(isVertical(meta.kind) ? "story" : meta.format);
  const vertical = isVertical(meta.kind);
  const safeMargin = vertical ? Math.round((STORY_SAFE.topPx / STORY_SAFE.heightPx) * 100) / 100 : 0;
  const { urls, covers, missing } = useMediaUrls(media);
  const baked = useBakedPreviews(media, urls, format, { stampText: agency.name, safeMargin });
  const fullCaption = joinCaption(meta.body, meta.hashtags);
  const status = derivedStatus(post);

  useEffect(() => {
    void mediaAvailable().then(setStorageOk);
  }, []);

  /* Autoguardado: metadatos en localStorage, archivos ya están en IndexedDB. */
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => setSaved(postStore.save(post) ? "ok" : "fail"), 600);
    return () => clearTimeout(t);
  }, [post]);

  /* Si el título cambia con un recordatorio activo, el evento de la Agenda lo acompaña. */
  const syncedTitle = useRef(eventTitle(initial));
  useEffect(() => {
    if (meta.status !== "scheduled" || !meta.scheduledAt || !meta.reminderEventId) return;
    const t = eventTitle(meta);
    if (t === syncedTitle.current) return;
    const timer = setTimeout(() => {
      syncedTitle.current = t;
      schedule(post, meta.scheduledAt!);
    }, 800);
    return () => clearTimeout(timer);
  }, [meta, post, schedule]);

  /* Al salir, se borran los archivos que se quitaron de la publicación (no antes: deshacer los puede traer de vuelta). */
  const everUsed = useRef(new Set(initial.media.flatMap((m) => [m.id, `${m.id}:cover`])));
  const latest = useRef(media);
  latest.current = media;
  // Al salir se guarda lo último aunque no haya vencido el autoguardado.
  const latestPost = useRef(post);
  latestPost.current = post;
  media.forEach((m) => {
    everUsed.current.add(m.id);
    everUsed.current.add(`${m.id}:cover`);
  });
  useEffect(
    () => () => {
      postStore.save(latestPost.current);
      const keep = new Set(latest.current.flatMap((m) => [m.id, `${m.id}:cover`]));
      const orphans = [...everUsed.current].filter((id) => !keep.has(id));
      if (orphans.length) void deleteMedias(orphans);
    },
    [],
  );

  const patch = useCallback((part: Partial<InstagramPost>) => {
    const { media: nextMedia, ...rest } = part;
    if (Object.keys(rest).length) setMeta((p) => ({ ...p, ...rest }));
    if (nextMedia) hist.set(nextMedia);
  }, [hist]);

  const selected = media.find((m) => m.id === selectedId) ?? media[0] ?? null;
  const selectedImage = selected?.kind === "image" ? selected : null;
  const videoMedia = media.find((m) => m.kind === "video") ?? null;

  const setEdits = (id: string, e: PhotoEdits, group = "") => hist.set((list) => list.map((m) => (m.id === id ? { ...m, edits: e } : m)), group ? `${id}:${group}` : "");
  const copyAll = (mode: "adjust" | "all") => {
    if (!selectedImage) return;
    hist.set((list) => list.map((m) => (m.kind === "image" && m.id !== selectedImage.id ? { ...m, edits: copyEdits(selectedImage.edits, m.edits, mode === "all") } : m)));
  };

  const property: Property | null = properties.find((p) => p.id === meta.propertyId) ?? null;
  const suggested = useMemo(() => (property ? suggestHashtags(property, agency) : genericHashtags(agency)), [property, agency]);
  const generate = (options = meta.options) => (property ? buildCaption(property, agency, options) : buildGenericCaption(agency, options));
  const regenerate = () => {
    const g = generate();
    if (meta.body.trim() && meta.body !== g && !window.confirm("Esto reemplaza el texto actual, incluidas tus ediciones. ¿Continuar?")) return;
    setMeta((p) => ({ ...p, body: g }));
  };

  const previewPhotos = media
    .map((m) => ({
      id: m.id,
      url: m.kind === "image" ? baked[m.id] ?? urls[m.id] : urls[m.id],
      focal: { x: 0.5, y: 0.5 },
      alt: m.alt,
      video: m.kind === "video",
      poster: covers[m.id],
    }))
    .filter((p): p is typeof p & { url: string } => !!p.url);

  const go = (d: number) => {
    const i = STEPS.findIndex((s) => s.id === step);
    const n = STEPS[Math.min(STEPS.length - 1, Math.max(0, i + d))];
    setStep(n.id);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); go(1); }
    if (e.altKey && e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
  };

  const stepIdx = STEPS.findIndex((s) => s.id === step);
  const handle = agency.slug || agency.name;
  const hasPhone = !!agency.phone?.trim();
  const sm = STATUS_META[status];

  return (
    <div className="contents" onKeyDown={onKey}>
      <AppHeader title={meta.title.trim() || "Publicación sin título"} subtitle={`${kind.label} · Estudio de Instagram`} breadcrumb={["Instagram", kind.label]}>
        <button onClick={() => navigate("/instagram")} className="px-3 min-h-11 md:min-h-9 rounded-xl text-xs border flex items-center gap-1 hover:bg-violet-50" style={{ borderColor: "#E9E5DE", color: "#6B7280", fontWeight: 700, background: "white" }}>
          <ChevronLeftIcon size={12} /> Mis publicaciones
        </button>
      </AppHeader>

      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-10">
        <div className="lg:hidden mt-4 inline-flex p-1 rounded-xl" role="tablist" aria-label="Pantalla" style={{ background: "#F7F0FF" }}>
          {(["edit", "preview"] as const).map((v) => (
            <button key={v} role="tab" aria-selected={mobileView === v} onClick={() => setMobileView(v)} className="px-5 min-h-11 rounded-lg text-sm" style={{ background: mobileView === v ? "white" : "transparent", color: "#6B7280", fontWeight: mobileView === v ? 700 : 600 }}>
              {v === "edit" ? "Editar" : "Vista previa"}
            </button>
          ))}
        </div>

        <div className="mt-4 lg:mt-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
          <div className={`${mobileView === "preview" ? "hidden" : "flex"} lg:flex flex-col gap-5 min-w-0`}>
            <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: "#6B7280" }}>
              <Badge bg={sm.bg} text={sm.text}>{sm.label}</Badge>
              <span role="status" aria-live="polite">
                {saved === "fail" ? "No pudimos guardar en este navegador (almacenamiento bloqueado o lleno)." : "Se guarda en este navegador, sin subirse a ningún servidor."}
              </span>
            </div>

            <div>
              <label htmlFor="post-title" className="text-xs" style={{ color: "#6B7280", fontWeight: 700 }}>Nombre interno (solo para vos)</label>
              <input id="post-title" type="text" value={meta.title} maxLength={80} onChange={(e) => setMeta((p) => ({ ...p, title: e.target.value }))} placeholder="Ej.: Casa de City Bell, fotos del living" className="mt-1 w-full max-w-lg rounded-lg border px-3 min-h-11 text-sm" style={{ borderColor: "#E9E5DE", color: "#1A1A1A", background: "white" }} />
            </div>

            <nav aria-label="Pasos" className="flex gap-1 overflow-x-auto pb-1">
              <div role="tablist" className="flex gap-1">
                {STEPS.map((s, i) => (
                  <button key={s.id} role="tab" aria-selected={step === s.id} onClick={() => setStep(s.id)} className="px-3 min-h-11 rounded-xl text-sm flex items-center gap-2 whitespace-nowrap" style={{ background: step === s.id ? "#F7F0FF" : "transparent", border: `1px solid ${step === s.id ? "#9B21FF" : "#E9E5DE"}`, color: step === s.id ? "#56148F" : "#6B7280", fontWeight: step === s.id ? 700 : 600 }}>
                    <span aria-hidden="true" className="w-5 h-5 rounded-full text-[11px] flex items-center justify-center" style={{ background: step === s.id ? "#9B21FF" : "#E9E5DE", color: step === s.id ? "white" : "#7C0BD8", fontWeight: 700 }}>{i + 1}</span>
                    {s.label}
                  </button>
                ))}
              </div>
            </nav>

            {step === "medios" && (
              <MediaStep
                kind={kind}
                media={media}
                urls={urls}
                missing={missing}
                format={format}
                selectedId={selected?.id ?? null}
                onSelect={setSelectedId}
                onMedia={(next) => hist.set(next)}
                storageOk={storageOk}
              />
            )}

            {step === "editar" && (
              <>
                {media.length === 0 && (
                  <Card>
                    <EmptyState icon={<InstagramIcon size={24} color="#9B21FF" />} title="Todavía no subiste nada" description="Subí fotos o un video en el paso Medios para poder editarlos." action={{ label: "Ir a Medios", onClick: () => setStep("medios") }} compact />
                  </Card>
                )}
                {!vertical && media.some((m) => m.kind === "image") && (
                  <Card>
                    <fieldset className="p-4">
                      <legend className="text-sm mb-2 px-1" style={{ color: "#1A1A1A", fontWeight: 700 }}>Formato de las fotos</legend>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {IG_FORMATS.filter((f) => f.id !== "story").map((f) => {
                          const on = meta.format === f.id;
                          return (
                            <label key={f.id} className="rounded-xl border p-3 cursor-pointer min-h-11 flex flex-col gap-0.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2" style={{ borderColor: on ? "#9B21FF" : "#E9E5DE", background: on ? "#F7F0FF" : "white" }}>
                              <input type="radio" name="post-format" className="sr-only" checked={on} onChange={() => setMeta((p) => ({ ...p, format: f.id as IgFormatId }))} />
                              <span className="text-sm flex items-center gap-1.5 flex-wrap" style={{ color: "#1A1A1A", fontWeight: 700 }}>{f.label}{f.recommended && <Badge bg="#DCFCE7" text="#15803D" size="xs">Recomendado</Badge>}</span>
                              <span className="text-[11px]" style={{ color: "#6B7280" }}>{f.width}×{f.height} px · {f.hint}</span>
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                  </Card>
                )}
                {media.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto py-1" role="group" aria-label="Elegir foto para editar">
                    {media.map((m, i) => {
                      const st = LEVEL_STYLE[levelOf(m, kind, format)];
                      return (
                        <button key={m.id} type="button" onClick={() => setSelectedId(m.id)} aria-pressed={selected?.id === m.id} aria-label={`Editar el archivo ${i + 1}`} className="relative w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 border-2" style={{ borderColor: selected?.id === m.id ? "#9B21FF" : "#E9E5DE", background: "#F3F4F6" }}>
                          {(baked[m.id] ?? urls[m.id]) && (m.kind === "image" ? <img src={baked[m.id] ?? urls[m.id]} alt="" className="w-full h-full object-cover" draggable={false} /> : <video src={urls[m.id]} className="w-full h-full object-cover" muted preload="metadata" />)}
                          <span aria-hidden="true" className="absolute right-1 bottom-1 w-2.5 h-2.5 rounded-full border border-white" style={{ background: st.dot }} />
                        </button>
                      );
                    })}
                  </div>
                )}
                {selectedImage && (
                  <PhotoEditorPanel
                    key={selectedImage.id}
                    media={selectedImage}
                    src={urls[selectedImage.id]}
                    format={format}
                    stampName={agency.name}
                    safeMargin={safeMargin}
                    onEdits={(e, g) => setEdits(selectedImage.id, e, g)}
                    onCopyAll={copyAll}
                    canCopy={media.filter((m) => m.kind === "image").length > 1}
                    undo={hist.undo}
                    redo={hist.redo}
                    canUndo={hist.canUndo}
                    canRedo={hist.canRedo}
                  />
                )}
                {videoMedia && (meta.kind === "reel" || meta.kind === "story") && (
                  <VideoCoverPanel
                    key={videoMedia.id}
                    media={videoMedia}
                    kind={meta.kind}
                    videoUrl={urls[videoMedia.id]}
                    coverUrl={covers[videoMedia.id]}
                    onChange={(part) => hist.set((list) => list.map((m) => (m.id === videoMedia.id ? { ...m, ...part } : m)))}
                  />
                )}
              </>
            )}

            {step === "texto" &&
              (kind.hasCaption ? (
                <CaptionPanel
                  body={meta.body}
                  onBody={(body) => setMeta((p) => ({ ...p, body }))}
                  hashtags={meta.hashtags}
                  suggested={suggested}
                  onHashtags={(hashtags) => setMeta((p) => ({ ...p, hashtags }))}
                  options={meta.options}
                  onOptions={(options) => setMeta((p) => ({ ...p, options }))}
                  onRegenerate={regenerate}
                  hasPhone={hasPhone}
                  isStory={false}
                  intro={property ? `Armado con los datos de «${property.title}». Editalo libremente.` : "Plantilla genérica con [campos] para completar. Editalo libremente o autocompletalo desde una propiedad."}
                  extra={
                    <div className="rounded-xl border p-3" style={{ borderColor: "#E9E5DE", background: "#FAF8F5" }}>
                      <label htmlFor="ig-prop" className="text-xs" style={{ color: "#6B7280", fontWeight: 700 }}>Autocompletar desde una propiedad</label>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <select
                          id="ig-prop"
                          value={meta.propertyId ?? ""}
                          onChange={(e) => {
                            const id = e.target.value || null;
                            const p = properties.find((x) => x.id === id) ?? null;
                            if (p && (!meta.body.trim() || window.confirm("Esto reemplaza el texto y los hashtags actuales con los datos de la propiedad. ¿Continuar?"))) {
                              setMeta((m) => ({ ...m, propertyId: id, body: buildCaption(p, agency, m.options), hashtags: suggestHashtags(p, agency).slice(0, 5) }));
                            } else if (!p) setMeta((m) => ({ ...m, propertyId: null }));
                          }}
                          className="flex-1 min-w-[200px] rounded-lg border px-3 min-h-11 text-sm"
                          style={{ borderColor: "#E9E5DE", color: "#1A1A1A", background: "white" }}
                        >
                          <option value="">Ninguna (plantilla genérica)</option>
                          {[...properties].sort((a, b) => a.title.localeCompare(b.title)).map((p) => (
                            <option key={p.id} value={p.id}>{p.title}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  }
                />
              ) : (
                <Card padded>
                  <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>Las Stories no llevan texto de publicación</p>
                  <p className="text-xs mt-1" style={{ color: "#6B7280" }}>Si querés un mensaje, ponelo sobre la foto en el paso Editar («Texto sobre la foto»). El texto de alternativa de cada imagen se carga en el paso Medios.</p>
                </Card>
              ))}

            {step === "programar" && <ScheduleStep post={post} onPatch={patch} />}
            {step === "publicar" && <PublishStep post={post} urls={urls} stampName={agency.name} safeMargin={safeMargin} onPatch={patch} />}

            <div className="flex items-center justify-between gap-3">
              <button type="button" disabled={stepIdx === 0} onClick={() => go(-1)} className="px-4 min-h-11 rounded-xl text-sm border hover:bg-violet-50 disabled:opacity-40" style={{ borderColor: "#E9E5DE", color: "#6B7280", fontWeight: 700 }}>Anterior</button>
              <span className="hidden md:inline text-[11px]" style={{ color: "#6B7280" }}>Atajos: Alt + ← / → cambia de paso · Ctrl + Z deshace una edición</span>
              <button type="button" disabled={stepIdx === STEPS.length - 1} onClick={() => go(1)} className="px-5 min-h-11 rounded-xl text-sm text-white hover:opacity-90 disabled:opacity-40" style={{ background: "var(--gradient-brand)", fontWeight: 700 }}>Siguiente</button>
            </div>
          </div>

          <div className={`${mobileView === "edit" ? "hidden" : "block"} lg:block lg:sticky lg:top-4`}>
            <PhoneMockup photos={previewPhotos} format={format} caption={kind.hasCaption ? fullCaption : ""} agencyName={agency.name} handle={handle} logoUrl={agency.logo_url} tab={tab} onTab={setTab} index={index} onIndex={setIndex} />
            <p className="text-[11px] text-center mt-3" style={{ color: "#6B7280" }}>Maqueta aproximada con diseño propio: el aspecto final depende de la versión de la app de Instagram.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InstagramEditorPage() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const post = useMemo(() => (postId ? postStore.get(postId) : null), [postId]);
  if (!postId) return <NewPost />;
  if (!post) {
    return (
      <>
        <AppHeader title="Estudio de Instagram" breadcrumb={["Instagram"]} />
        <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-10">
          <Card className="mt-8">
            <EmptyState icon={<InstagramIcon size={24} color="#9B21FF" />} title="No encontramos esta publicación" description="Se guardan en este navegador: puede que se haya borrado o que la abras desde otro equipo." action={{ label: "Ir a mis publicaciones", onClick: () => navigate("/instagram") }} />
          </Card>
        </div>
      </>
    );
  }
  return <Editor key={post.id} initial={post} />;
}
