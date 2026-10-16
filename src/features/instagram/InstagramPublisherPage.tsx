import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useStore } from "@/data/store";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, Badge } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/states";
import { HomeIcon, ChevronLeftIcon, CheckIcon, AlertTriangleIcon, DownloadIcon } from "@/components/ui/icons";
import { usePublications } from "@/features/propiedades/usePublications";
import type { Agency, Property } from "@/types/db";
import { buildCaption, countHashtags, DEFAULT_OPTIONS, joinCaption, slugify, suggestHashtags, type CaptionOptions } from "./caption";
import { CaptionPanel } from "./CaptionPanel";
import { clearDraft, loadDraft, photoKey, saveDraft } from "./draft";
import { downloadBlob, exportPhotoJpeg } from "./exportImages";
import { getFormat, IG_FORMATS, IG_LIMITS, type IgFormatId } from "./imageSpecs";
import { PhoneMockup, type PreviewTab } from "./PhoneMockup";
import { PhotoPanel, type IgPhoto } from "./PhotoPanel";
import { useImageInfos } from "./useImageInfos";
import { useInstagramConnection } from "./connection";


interface EditorState {
  format: IgFormatId;
  photos: IgPhoto[];
  body: string;
  hashtags: string[];
  options: CaptionOptions;
}

let uid = 0;
const newId = () => `ig-${Date.now().toString(36)}-${uid++}`;

function initialState(property: Property, urls: string[], agency: Agency, useDraft: boolean): EditorState {
  const draft = useDraft ? loadDraft(property.id) : null;
  const base: IgPhoto[] = urls.map((url, i) => ({
    id: newId(), url, source: "property", key: photoKey(url, i), included: i < IG_LIMITS.carouselMax, focal: { x: 0.5, y: 0.5 }, alt: "",
  }));
  if (!draft) {
    const options = DEFAULT_OPTIONS;
    return {
      format: "feed45",
      photos: base,
      body: buildCaption(property, agency, options),
      hashtags: suggestHashtags(property, agency).slice(0, 5),
      options,
    };
  }
  const ordered: IgPhoto[] = [];
  for (const r of draft.photos) {
    const m = base.find((b) => b.key === r.key && !ordered.includes(b));
    if (m) ordered.push({ ...m, included: r.included, focal: { x: r.fx, y: r.fy }, alt: r.alt });
  }
  for (const b of base) if (!ordered.some((o) => o.key === b.key)) ordered.push({ ...b, included: false });
  return { format: draft.format, photos: ordered, body: draft.body, hashtags: draft.hashtags, options: draft.options };
}

type ExportStatus = { status: "working" | "done" | "error"; message?: string };

function Editor({ property }: { property: Property }) {
  const navigate = useNavigate();
  const { photos: photoMap, agency } = useStore();
  const { channelsOf, queue } = usePublications();
  const igConn = useInstagramConnection();
  const urls = photoMap[property.id] ?? [];

  const [s, setS] = useState<EditorState>(() => initialState(property, urls, agency, true));
  const [hadDraft] = useState(() => loadDraft(property.id) !== null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<PreviewTab>(s.format === "story" ? "story" : "feed");
  const [index, setIndex] = useState(0);
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState<"ok" | "fail" | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportState, setExportState] = useState<Record<string, ExportStatus>>({});
  const [exportSummary, setExportSummary] = useState("");
  const [queued, setQueued] = useState(false);
  const blobUrls = useRef<string[]>([]);
  const firstRun = useRef(true);

  useEffect(() => () => blobUrls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const format = getFormat(s.format);
  const infos = useImageInfos(useMemo(() => s.photos.map((p) => p.url), [s.photos]));
  const included = s.photos.filter((p) => p.included);
  const suggested = useMemo(() => suggestHashtags(property, agency), [property, agency]);
  const fullCaption = joinCaption(s.body, s.hashtags);
  const tagCount = countHashtags(fullCaption);
  const isStory = s.format === "story";

  // Autoguardado del borrador (solo referencias; ver draft.ts).
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const t = setTimeout(() => {
      const ok = saveDraft(property.id, {
        v: 1,
        format: s.format,
        photos: s.photos.filter((p) => p.source === "property").map((p) => ({ key: p.key, included: p.included, fx: p.focal.x, fy: p.focal.y, alt: p.alt })),
        body: s.body,
        hashtags: s.hashtags,
        options: s.options,
        savedAt: new Date().toISOString(),
      });
      setSaved(ok ? "ok" : "fail");
    }, 600);
    return () => clearTimeout(t);
  }, [s, property.id]);

  const setFormat = (f: IgFormatId) => {
    setS((p) => ({ ...p, format: f }));
    setTab(f === "story" ? "story" : "feed");
  };

  const changePhotos = (photos: IgPhoto[]) => {
    const prev = s.photos.filter((p) => p.included).length;
    const next = photos.filter((p) => p.included);
    if (next.length > IG_LIMITS.carouselMax) {
      setNotice(`Instagram admite hasta ${IG_LIMITS.carouselMax} fotos por carrusel. Destildá alguna para sumar otra.`);
      return;
    }
    setNotice(next.length === IG_LIMITS.carouselMax && next.length > prev ? `Llegaste al máximo de ${IG_LIMITS.carouselMax} fotos.` : "");
    setS((p) => ({ ...p, photos }));
  };

  const onUpload = (files: FileList) => {
    const room = () => IG_LIMITS.carouselMax - s.photos.filter((p) => p.included).length;
    let left = room();
    let skipped = 0;
    const added: IgPhoto[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      const url = URL.createObjectURL(f);
      blobUrls.current.push(url);
      const include = left > 0;
      if (include) left--;
      else skipped++;
      added.push({ id: newId(), url, source: "upload", key: `upload:${f.name}`, included: include, focal: { x: 0.5, y: 0.5 }, alt: "" });
    }
    if (!added.length) return;
    setS((p) => ({ ...p, photos: [...p.photos, ...added] }));
    setNotice(skipped ? `Instagram admite hasta ${IG_LIMITS.carouselMax} fotos: ${skipped} quedaron sin tildar.` : "");
  };

  const regenerate = () => {
    const generated = buildCaption(property, agency, s.options);
    if (s.body.trim() && s.body !== generated && !window.confirm("Esto reemplaza el texto actual, incluidas tus ediciones. ¿Continuar?")) return;
    setS((p) => ({ ...p, body: generated }));
  };

  const reset = () => {
    if (!window.confirm("Restablecer borra el borrador guardado y las fotos subidas. ¿Seguir?")) return;
    clearDraft(property.id);
    blobUrls.current.forEach((u) => URL.revokeObjectURL(u));
    blobUrls.current = [];
    setS(initialState(property, urls, agency, false));
    setSelectedId(null);
    setIndex(0);
    setTab("feed");
    setNotice("");
    setSaved(null);
    setExportState({});
    setExportSummary("");
  };

  const downloadAll = async () => {
    if (!included.length || exporting) return;
    setExporting(true);
    setExportSummary("");
    setExportState({});
    const slug = slugify(property.title);
    let ok = 0;
    for (let i = 0; i < included.length; i++) {
      const p = included[i];
      setExportState((st) => ({ ...st, [p.id]: { status: "working" } }));
      try {
        const blob = await exportPhotoJpeg(p.url, format, p.focal);
        downloadBlob(blob, `${String(i + 1).padStart(2, "0")}-${slug}.jpg`);
        ok++;
        setExportState((st) => ({ ...st, [p.id]: { status: "done" } }));
      } catch (e) {
        setExportState((st) => ({ ...st, [p.id]: { status: "error", message: e instanceof Error ? e.message : "Error desconocido." } }));
      }
      // Los navegadores frenan descargas encadenadas muy rápidas.
      await new Promise((r) => setTimeout(r, 350));
    }
    setExporting(false);
    setExportSummary(
      ok === included.length
        ? `Listo: se descargaron ${ok} ${ok === 1 ? "foto" : "fotos"}. Si el navegador pide permiso para descargas múltiples, aceptalo.`
        : `Se descargaron ${ok} de ${included.length}. Revisá las que fallaron abajo.`,
    );
  };

  const igChannel = channelsOf(property).find((c) => c.info.channel === "instagram");
  const alreadyQueued = igChannel?.status === "pending" || queued;

  const checklist: { ok: boolean; label: string; detail: string }[] = [
    {
      ok: igConn.hasInstagram,
      label: "Cuenta profesional de Instagram conectada",
      detail: igConn.approvalPending
        ? "Publicar por API requiere aprobación de Meta. Mientras tanto, descargá las fotos y subilas a mano."
        : "Conectá tu Página de Facebook (con su Instagram profesional vinculado) en el multipublicador. Para publicar ya, abrí el Estudio.",
    },
    { ok: included.length >= 1, label: "Al menos una foto", detail: "Elegí una o más fotos." },
    {
      ok: included.length <= IG_LIMITS.carouselMax,
      label: `Formato válido (hasta ${IG_LIMITS.carouselMax} fotos)`,
      detail: `Un carrusel admite de ${IG_LIMITS.carouselMin} a ${IG_LIMITS.carouselMax} elementos; con una sola foto se publica como foto simple.`,
    },
    {
      ok: isStory || (fullCaption.length <= IG_LIMITS.captionMax && tagCount <= IG_LIMITS.hashtagsMax),
      label: "Texto dentro del límite",
      detail: `Máximo ${IG_LIMITS.captionMax.toLocaleString("es-AR")} caracteres y ${IG_LIMITS.hashtagsMax} hashtags.`,
    },
  ];

  const handle = agency.slug || agency.name;
  const hasPhone = !!agency.phone?.trim();
  const previewPhotos = included.map((p) => ({ id: p.id, url: p.url, focal: p.focal, alt: p.alt }));

  const savedLine =
    saved === "fail"
      ? "No pudimos guardar el borrador en este navegador (almacenamiento bloqueado o lleno)."
      : saved === "ok"
        ? "Borrador guardado en este navegador."
        : hadDraft
          ? "Recuperamos tu borrador guardado en este navegador."
          : "Se guarda en este navegador.";

  return (
    <>
      <AppHeader title="Publicación en Instagram" subtitle={property.title} breadcrumb={["Publicaciones", "Multipublicador", "Instagram"]}>
        <button
          onClick={() => navigate(`/publicador/${property.id}`)}
          className="px-3 min-h-11 md:min-h-9 rounded-xl text-xs border flex items-center gap-1 hover:bg-violet-50"
          style={{ borderColor: "#E9E5DE", color: "#6B7280", fontWeight: 700, background: "white" }}
        >
          <ChevronLeftIcon size={12} /> Volver
        </button>
        <button
          onClick={() => navigate(`/instagram/nueva?propiedad=${property.id}`)}
          className="px-3 min-h-11 md:min-h-9 rounded-xl text-xs text-white flex items-center gap-1 hover:opacity-90"
          style={{ background: "var(--gradient-brand)", fontWeight: 700 }}
        >
          Abrir en el Estudio (carrusel, reel, edición)
        </button>
      </AppHeader>

      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-10">
        <div className="lg:hidden mt-4 inline-flex p-1 rounded-xl" role="tablist" aria-label="Pantalla" style={{ background: "#F7F0FF" }}>
          {(["edit", "preview"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={mobileView === v}
              onClick={() => setMobileView(v)}
              className="px-5 min-h-11 rounded-lg text-sm"
              style={{ background: mobileView === v ? "white" : "transparent", color: "#6B7280", fontWeight: mobileView === v ? 700 : 600 }}
            >
              {v === "edit" ? "Editar" : "Vista previa"}
            </button>
          ))}
        </div>

        <div className="mt-4 lg:mt-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
          <div className={`${mobileView === "preview" ? "hidden" : "flex"} lg:flex flex-col gap-6 min-w-0`}>
            <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: "#6B7280" }}>
              <span role="status" aria-live="polite">{savedLine}</span>
              <button type="button" onClick={reset} className="px-3 min-h-11 md:min-h-8 rounded-lg border hover:bg-rose-50" style={{ borderColor: "#FECDD3", color: "#BE123C", fontWeight: 700 }}>
                Restablecer
              </button>
            </div>

            <Card>
              <div className="px-5 py-4 border-b" style={{ borderColor: "#F0EDE6" }}>
                <h3 className="text-base" style={{ color: "#1A1A1A", fontWeight: 700 }}>Formato</h3>
              </div>
              <fieldset className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <legend className="sr-only">Formato de la publicación</legend>
                {IG_FORMATS.map((f) => {
                  const on = s.format === f.id;
                  return (
                    <label
                      key={f.id}
                      className="rounded-xl border p-3 cursor-pointer min-h-11 flex flex-col gap-1 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
                      style={{ borderColor: on ? "#9B21FF" : "#E9E5DE", background: on ? "#F7F0FF" : "white" }}
                    >
                      <input type="radio" name="ig-format" className="sr-only" checked={on} onChange={() => setFormat(f.id)} />
                      <span className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>{f.label}</span>
                        {f.recommended && <Badge bg="#DCFCE7" text="#15803D" size="xs">Recomendado</Badge>}
                      </span>
                      <span className="text-[11px]" style={{ color: "#6B7280" }}>{f.width}×{f.height} px</span>
                      <span className="text-[11px]" style={{ color: "#6B7280" }}>{f.hint}</span>
                    </label>
                  );
                })}
              </fieldset>
            </Card>

            <PhotoPanel
              photos={s.photos}
              infos={infos}
              format={format}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onChange={changePhotos}
              onUpload={onUpload}
              notice={notice}
            />

            <CaptionPanel
              body={s.body}
              onBody={(body) => setS((p) => ({ ...p, body }))}
              hashtags={s.hashtags}
              suggested={suggested}
              onHashtags={(hashtags) => setS((p) => ({ ...p, hashtags }))}
              options={s.options}
              onOptions={(options) => setS((p) => ({ ...p, options }))}
              onRegenerate={regenerate}
              hasPhone={hasPhone}
              isStory={isStory}
            />

            <Card>
              <div className="px-5 py-4 border-b" style={{ borderColor: "#F0EDE6" }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base" style={{ color: "#1A1A1A", fontWeight: 700 }}>Publicar manualmente</h3>
                  <Badge bg="#DCFCE7" text="#15803D" size="xs">Disponible ahora</Badge>
                </div>
                <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
                  Descargá las fotos ya recortadas ({format.width}×{format.height}, JPEG), copiá el texto y subilo desde la app de Instagram.
                </p>
              </div>
              <div className="p-5 flex flex-col gap-3">
                <div>
                  <button
                    type="button"
                    onClick={downloadAll}
                    disabled={!included.length || exporting}
                    className="px-5 min-h-11 rounded-xl text-sm text-white flex items-center gap-2 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: "var(--gradient-brand)", fontWeight: 700 }}
                  >
                    <DownloadIcon size={14} color="white" /> {exporting ? "Preparando…" : "Descargar fotos para Instagram"}
                  </button>
                </div>
                <p role="status" aria-live="polite" className={exportSummary ? "text-sm" : "sr-only"} style={{ color: "#1A1A1A" }}>{exportSummary}</p>
                {Object.keys(exportState).length > 0 && (
                  <ul className="flex flex-col gap-1.5">
                    {included.map((p, i) => {
                      const st = exportState[p.id];
                      if (!st) return null;
                      return (
                        <li key={p.id} className="text-xs flex items-start gap-2" style={{ color: st.status === "error" ? "#BE123C" : "#4B5563" }}>
                          {st.status === "done" ? <CheckIcon size={12} color="#16A34A" /> : st.status === "error" ? <AlertTriangleIcon size={12} color="#E11D48" /> : <span aria-hidden="true">…</span>}
                          <span>
                            Foto {i + 1}: {st.status === "done" ? "descargada" : st.status === "working" ? "procesando" : st.message}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="text-xs" style={{ color: "#6B7280" }}>
                  Se descargan una por una, en orden y con nombre <code>01-{slugify(property.title)}.jpg</code>. Usá «Copiar texto» más arriba para el texto.
                </p>
              </div>
            </Card>

            <Card>
              <div className="px-5 py-4 border-b flex items-center gap-2 flex-wrap" style={{ borderColor: "#F0EDE6" }}>
                <h3 className="text-base" style={{ color: "#1A1A1A", fontWeight: 700 }}>Publicar en Instagram</h3>
                <Badge bg="#FEF3C7" text="#92400E" size="xs">Requiere conexión</Badge>
              </div>
              <div className="p-5 flex flex-col gap-4">
                <ul className="flex flex-col gap-2">
                  {checklist.map((c) => (
                    <li key={c.label} className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: c.ok ? "#DCFCE7" : "#FEF3C7" }} aria-hidden="true">
                        {c.ok ? <CheckIcon size={11} color="#16A34A" /> : <AlertTriangleIcon size={11} color="#D97706" />}
                      </span>
                      <div>
                        <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 600 }}>
                          <span className="sr-only">{c.ok ? "Cumplido: " : "Falta: "}</span>
                          {c.label}
                        </p>
                        {!c.ok && <p className="text-xs" style={{ color: "#B45309" }}>{c.detail}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" disabled aria-describedby="ig-publish-why" className="px-5 min-h-11 rounded-xl text-sm text-white opacity-40 cursor-not-allowed" style={{ background: "var(--gradient-brand)", fontWeight: 700 }}>
                    Publicar en Instagram
                  </button>
                  <span id="ig-publish-why" className="text-xs" style={{ color: "#6B7280" }}>Disponible al conectar Instagram</span>
                </div>
                <div className="border-t pt-4" style={{ borderColor: "#F0EDE6" }}>
                  <button
                    type="button"
                    disabled={alreadyQueued}
                    onClick={() => { void queue(property, ["instagram"]); setQueued(true); }}
                    className="px-4 min-h-11 rounded-xl text-sm border hover:bg-violet-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ borderColor: "#E9E5DE", color: "#6B7280", fontWeight: 700 }}
                  >
                    {alreadyQueued ? "En cola" : "Dejar en cola"}
                  </button>
                  <p className="text-xs mt-2" role="status" aria-live="polite" style={{ color: "#6B7280" }}>
                    {alreadyQueued
                      ? "Quedó registrado: se publicará al conectar Instagram. Por ahora la cola solo anota el canal; el diseño de esta pantalla no se envía."
                      : "Registra la intención de publicar: se publicará al conectar Instagram. No publica nada ahora."}
                  </p>
                </div>
              </div>
            </Card>
          </div>

          <div className={`${mobileView === "edit" ? "hidden" : "block"} lg:block lg:sticky lg:top-4`}>
            <PhoneMockup
              photos={previewPhotos}
              format={format}
              caption={isStory && tab === "feed" ? "" : fullCaption}
              agencyName={agency.name}
              handle={handle}
              logoUrl={agency.logo_url}
              tab={tab}
              onTab={setTab}
              index={index}
              onIndex={setIndex}
            />
            <p className="text-[11px] text-center mt-3" style={{ color: "#6B7280" }}>
              Maqueta aproximada con diseño propio: el aspecto final depende de la versión de la app de Instagram.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export default function InstagramPublisherPage() {
  const { propertyId } = useParams<{ propertyId: string }>();
  const navigate = useNavigate();
  const { properties } = useStore();
  const property = properties.find((p) => p.id === propertyId);

  if (!property) {
    return (
      <>
        <AppHeader title="Publicación en Instagram" breadcrumb={["Publicaciones"]} />
        <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-10">
          <Card className="mt-8">
            <EmptyState
              icon={<HomeIcon size={24} color="#9B21FF" />}
              title="No encontramos esta propiedad"
              description="Puede que se haya eliminado o que el enlace no sea correcto."
              action={{ label: "Volver al multipublicador", onClick: () => navigate("/publicador") }}
            />
          </Card>
        </div>
      </>
    );
  }
  return <Editor key={property.id} property={property} />;
}
