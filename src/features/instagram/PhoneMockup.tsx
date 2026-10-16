import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { STORY_SAFE, type Focal, type IgFormat } from "./imageSpecs";
import { truncateForMore } from "./caption";

export interface PreviewPhoto {
  id: string;
  url: string;
  focal: Focal;
  alt: string;
  /** Si es un video: se reproduce en la maqueta (silenciado) y `url` es el video. */
  video?: boolean;
  /** Portada del video (JPEG ya capturado). */
  poster?: string;
}

export type PreviewTab = "feed" | "profile" | "story" | "reel";

interface Props {
  photos: PreviewPhoto[];
  format: IgFormat;
  caption: string;
  agencyName: string;
  handle: string;
  logoUrl: string | null;
  tab: PreviewTab;
  onTab: (t: PreviewTab) => void;
  index: number;
  onIndex: (i: number) => void;
}

const INK = "#111";
const Icon = ({ children, size = 24 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const HeartI = () => <Icon><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></Icon>;
const CommentI = () => <Icon><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4A8 8 0 1 1 20 12z" /></Icon>;
const SendI = () => <Icon><path d="M21 4 3 11l7 3 3 7 8-17zM10 14l11-10" /></Icon>;
const SaveI = () => <Icon><path d="M6 4h12v16l-6-4-6 4V4z" /></Icon>;

const imgStyle = (f: Focal): CSSProperties => ({
  width: "100%",
  height: "100%",
  objectFit: "cover",
  objectPosition: `${f.x * 100}% ${f.y * 100}%`,
  display: "block",
});

function Avatar({ name, logoUrl, size = 30 }: { name: string; logoUrl: string | null; size?: number }) {
  return logoUrl ? (
    <img src={logoUrl} alt="" style={{ width: size, height: size, borderRadius: 999, objectFit: "cover" }} />
  ) : (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, borderRadius: 999, background: "var(--gradient-brand)", color: "white", fontWeight: 700, fontSize: size * 0.42 }}
      className="flex items-center justify-center flex-shrink-0"
    >
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

const reducedMotionQuery = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null);

function useReducedMotion(): boolean {
  const [r, setR] = useState(() => reducedMotionQuery()?.matches ?? false);
  useEffect(() => {
    const q = reducedMotionQuery();
    if (!q) return;
    const on = () => setR(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return r;
}

/** Foto o video (con botón propio de reproducir/pausar, nunca arranca solo). */
function Slide({ ph, active = true }: { ph: PreviewPhoto; active?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!active && ref.current) {
      ref.current.pause();
      setPlaying(false);
    }
  }, [active]);
  if (!ph.video) return <img src={ph.url} alt={ph.alt || ""} style={imgStyle(ph.focal)} draggable={false} />;
  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) void v.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    else {
      v.pause();
      setPlaying(false);
    }
  };
  return (
    <>
      <video ref={ref} src={ph.url} poster={ph.poster} muted loop playsInline preload="metadata" style={{ ...imgStyle({ x: 0.5, y: 0.5 }), background: "#000" }} aria-label={ph.alt || "Video de la publicación"} />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pausar el video" : "Reproducir el video"}
        className="absolute inset-0 flex items-center justify-center"
        style={{ background: "transparent" }}
      >
        {!playing && (
          <span className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,.55)" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
          </span>
        )}
      </button>
    </>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="w-full h-full flex items-center justify-center text-center px-6" style={{ background: "#F3F4F6", color: "#6B7280", fontSize: 12 }}>
      {text}
    </div>
  );
}

export function PhoneMockup(p: Props) {
  const [expanded, setExpanded] = useState(false);
  const [safe, setSafe] = useState(true);
  const swipe = useRef<number | null>(null);
  const reduced = useReducedMotion();
  const count = p.photos.length;
  const idx = Math.min(p.index, Math.max(0, count - 1));
  const go = (d: number) => count > 0 && p.onIndex(Math.min(count - 1, Math.max(0, idx + d)));
  const current = p.photos[idx];

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
  };
  const swipeHandlers = {
    onPointerDown: (e: React.PointerEvent) => { swipe.current = e.clientX; },
    onPointerUp: (e: React.PointerEvent) => {
      if (swipe.current != null && Math.abs(e.clientX - swipe.current) > 40) go(e.clientX < swipe.current ? 1 : -1);
      swipe.current = null;
    },
    onPointerCancel: () => { swipe.current = null; },
  };

  const { visible, rest, truncated } = truncateForMore(p.caption);

  const arrows = count > 1 && (
    <>
      {idx > 0 && (
        <button type="button" onClick={() => go(-1)} aria-label="Foto anterior" className="absolute left-0 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center">
          <span className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background: "rgba(255,255,255,0.85)", color: INK }}>‹</span>
        </button>
      )}
      {idx < count - 1 && (
        <button type="button" onClick={() => go(1)} aria-label="Foto siguiente" className="absolute right-0 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center">
          <span className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background: "rgba(255,255,255,0.85)", color: INK }}>›</span>
        </button>
      )}
    </>
  );

  const tabs: { id: PreviewTab; label: string }[] = [
    { id: "feed", label: "Feed" },
    { id: "profile", label: "Perfil" },
    { id: "story", label: "Story" },
    { id: "reel", label: "Reel" },
  ];

  return (
    <div className="flex flex-col items-center gap-3">
      <div role="tablist" aria-label="Tipo de vista previa" className="inline-flex p-1 rounded-xl" style={{ background: "#F7F0FF" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={p.tab === t.id}
            onClick={() => p.onTab(t.id)}
            className="px-4 min-h-11 md:min-h-9 rounded-lg text-sm"
            style={{ background: p.tab === t.id ? "white" : "transparent", color: "#6B7280", fontWeight: p.tab === t.id ? 700 : 600, boxShadow: p.tab === t.id ? "var(--shadow-card)" : undefined }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Marco del teléfono */}
      <div
        className="relative"
        style={{ width: 300, maxWidth: "100%", borderRadius: 38, padding: 8, background: "#18181B", boxShadow: "var(--shadow-pop)" }}
      >
        <span aria-hidden="true" className="absolute left-1/2 -translate-x-1/2 z-20" style={{ top: 14, width: 64, height: 6, borderRadius: 99, background: "#000" }} />
        <div
          tabIndex={0}
          onKeyDown={onKey}
          aria-label={`Vista previa de Instagram, ${tabs.find((t) => t.id === p.tab)!.label}. Usá las flechas izquierda y derecha para cambiar de foto.`}
          className="overflow-hidden"
          style={{ borderRadius: 30, background: "white", minHeight: 420, color: INK }}
        >
          {p.tab === "feed" && (
            <div style={{ paddingTop: 22 }}>
              <div className="flex items-center gap-2 px-3 py-2">
                <Avatar name={p.agencyName} logoUrl={p.logoUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate" style={{ fontSize: 12.5, fontWeight: 700 }}>{p.handle}</p>
                </div>
                <span aria-hidden="true" style={{ fontWeight: 800, letterSpacing: 1 }}>···</span>
              </div>

              {p.format.id === "story" ? (
                <div style={{ aspectRatio: "4 / 5" }}><Empty text="El formato Story no se publica en el feed. Mirá la pestaña Story." /></div>
              ) : !current ? (
                <div style={{ aspectRatio: String(p.format.ratio) }}><Empty text="Elegí al menos una foto para ver la vista previa." /></div>
              ) : (
                <div className="relative select-none touch-pan-y overflow-hidden" style={{ aspectRatio: String(p.format.ratio), background: "#F3F4F6" }} {...swipeHandlers}>
                  <div className="h-full flex" style={{ transform: `translateX(-${idx * 100}%)`, transition: reduced ? "none" : "transform 220ms ease-out" }}>
                    {p.photos.map((ph, i) => (
                      <div key={ph.id} className="relative h-full" style={{ flex: "0 0 100%" }} aria-hidden={i !== idx}>
                        <Slide ph={ph} active={i === idx} />
                      </div>
                    ))}
                  </div>
                  {count > 1 && (
                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-white" style={{ background: "rgba(0,0,0,0.65)", fontSize: 11, fontWeight: 600 }}>
                      {idx + 1}/{count}
                    </span>
                  )}
                  {arrows}
                </div>
              )}

              <div className="flex items-center gap-3 px-3 pt-2.5 relative">
                <HeartI /><CommentI /><SendI />
                {count > 1 && p.format.id !== "story" && (
                  <div className="absolute left-1/2 -translate-x-1/2 flex gap-1" aria-hidden="true">
                    {p.photos.map((ph, i) => (
                      <span key={ph.id} style={{ width: 6, height: 6, borderRadius: 99, background: i === idx ? "#3B82F6" : "#D1D5DB" }} />
                    ))}
                  </div>
                )}
                <span className="ml-auto"><SaveI /></span>
              </div>

              <div className="px-3 pt-2 pb-3" style={{ fontSize: 12.5, lineHeight: 1.4 }}>
                {p.caption.trim() ? (
                  <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                    <strong>{p.handle}</strong>{" "}
                    {expanded || !truncated ? p.caption : visible}
                    {truncated && !expanded && (
                      <>
                        …{" "}
                        <button type="button" onClick={() => setExpanded(true)} className="min-h-11 -my-3 px-1" style={{ color: "#6B7280" }} aria-label="Mostrar el texto completo">
                          más
                        </button>
                      </>
                    )}
                    {expanded && truncated && (
                      <>
                        {" "}
                        <button type="button" onClick={() => setExpanded(false)} className="min-h-11 -my-3 px-1" style={{ color: "#6B7280" }}>
                          menos
                        </button>
                      </>
                    )}
                  </p>
                ) : (
                  <p style={{ color: "#9CA3AF" }}>Todavía no hay texto.</p>
                )}
                <p className="mt-1.5 uppercase" style={{ color: "#9CA3AF", fontSize: 9.5, letterSpacing: "0.04em" }}>Ahora</p>
                {/* `rest` solo se usa para saber que hay más texto oculto */}
                <span className="sr-only">{rest ? "El texto continúa después del «más»." : ""}</span>
              </div>
            </div>
          )}

          {p.tab === "profile" && (
            <div style={{ paddingTop: 22 }}>
              <div className="flex items-center gap-3 px-3 py-3">
                <Avatar name={p.agencyName} logoUrl={p.logoUrl} size={54} />
                <div className="min-w-0">
                  <p className="truncate" style={{ fontSize: 13, fontWeight: 700 }}>{p.handle}</p>
                  <p className="truncate" style={{ fontSize: 11.5, color: "#6B7280" }}>{p.agencyName}</p>
                </div>
              </div>
              <div className="grid grid-cols-3" style={{ gap: 2 }}>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <div key={i} className="relative" style={{ aspectRatio: "3 / 4", background: i === 0 ? "#F3F4F6" : "#EEF0F3" }} aria-hidden={i !== 0}>
                    {i === 0 && current && (
                      <>
                        <img src={p.photos[0].poster ?? p.photos[0].url} alt="Miniatura de la publicación en la grilla del perfil" style={imgStyle(p.photos[0].focal)} draggable={false} />
                        {count > 1 && (
                          <svg className="absolute top-1 right-1" width="14" height="14" viewBox="0 0 24 24" fill="white" aria-hidden="true">
                            <rect x="8" y="3" width="13" height="13" rx="2" /><rect x="3" y="8" width="13" height="13" rx="2" opacity="0.7" />
                          </svg>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
              <p className="px-3 py-2" style={{ fontSize: 10.5, color: "#6B7280" }}>
                En la grilla se muestra la primera foto recortada a 3:4. Los demás cuadros son de relleno.
              </p>
            </div>
          )}

          {p.tab === "story" && (
            <div className="relative" style={{ aspectRatio: "9 / 16", background: "#111" }}>
              {current ? (
                <div className="select-none" style={{ position: "absolute", inset: 0 }} {...swipeHandlers}>
                  <Slide ph={current} />
                </div>
              ) : (
                <Empty text="Elegí al menos una foto para ver la Story." />
              )}
              <div className="absolute left-2 right-2 flex gap-1" style={{ top: 18 }} aria-hidden="true">
                {(count ? p.photos : [null]).map((_, i) => (
                  <span key={i} className="flex-1" style={{ height: 2.5, borderRadius: 2, background: i <= idx ? "white" : "rgba(255,255,255,0.4)" }} />
                ))}
              </div>
              <div className="absolute left-3 right-3 flex items-center gap-2" style={{ top: 28 }}>
                <Avatar name={p.agencyName} logoUrl={p.logoUrl} size={26} />
                <span className="truncate text-white" style={{ fontSize: 12, fontWeight: 700, textShadow: "0 1px 3px rgba(0,0,0,.5)" }}>{p.handle}</span>
              </div>
              <div className="absolute left-3 right-3 bottom-3 px-3 flex items-center text-white" style={{ height: 34, borderRadius: 99, border: "1px solid rgba(255,255,255,.7)", fontSize: 11.5 }} aria-hidden="true">
                Enviar mensaje
              </div>
              {safe && (
                <>
                  <div className="absolute left-0 right-0 top-0 pointer-events-none" style={{ height: `${(STORY_SAFE.topPx / STORY_SAFE.heightPx) * 100}%`, background: "repeating-linear-gradient(45deg, rgba(225,29,72,.35) 0 6px, rgba(225,29,72,.15) 6px 12px)" }} aria-hidden="true" />
                  <div className="absolute left-0 right-0 bottom-0 pointer-events-none" style={{ height: `${(STORY_SAFE.bottomPx / STORY_SAFE.heightPx) * 100}%`, background: "repeating-linear-gradient(45deg, rgba(225,29,72,.35) 0 6px, rgba(225,29,72,.15) 6px 12px)" }} aria-hidden="true" />
                </>
              )}
              {arrows}
            </div>
          )}

          {p.tab === "reel" && (
            <div className="relative overflow-hidden" style={{ aspectRatio: "9 / 16", background: "#111" }}>
              {current ? (
                <div className="select-none" style={{ position: "absolute", inset: 0 }} {...swipeHandlers}>
                  <Slide ph={current} />
                </div>
              ) : (
                <Empty text="Subí un video para ver el Reel." />
              )}
              <div className="absolute inset-x-0 top-0 pointer-events-none" style={{ height: 90, background: "linear-gradient(rgba(0,0,0,.45), transparent)" }} aria-hidden="true" />
              <div className="absolute inset-x-0 bottom-0 pointer-events-none" style={{ height: 190, background: "linear-gradient(transparent, rgba(0,0,0,.7))" }} aria-hidden="true" />
              <p className="absolute left-3 text-white" style={{ top: 26, fontSize: 15, fontWeight: 800, textShadow: "0 1px 3px rgba(0,0,0,.5)" }}>Reels</p>
              <div className="absolute flex flex-col items-center gap-4 text-white pointer-events-none" style={{ right: 10, bottom: 70 }} aria-hidden="true">
                {[
                  "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
                  "M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4A8 8 0 1 1 20 12z",
                  "M21 4 3 11l7 3 3 7 8-17zM10 14l11-10",
                  "M5 12h.01M12 12h.01M19 12h.01",
                ].map((d) => (
                  <svg key={d} width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,.5))" }}>
                    <path d={d} />
                  </svg>
                ))}
              </div>
              <div className="absolute left-3 text-white" style={{ right: 56, bottom: 14, fontSize: 12, lineHeight: 1.35, textShadow: "0 1px 3px rgba(0,0,0,.5)" }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <Avatar name={p.agencyName} logoUrl={p.logoUrl} size={26} />
                  <span className="truncate" style={{ fontWeight: 700 }}>{p.handle}</span>
                  <span className="px-2 py-0.5 rounded-md" style={{ border: "1px solid rgba(255,255,255,.8)", fontSize: 10.5, fontWeight: 600 }} aria-hidden="true">Seguir</span>
                </div>
                {p.caption.trim() ? (
                  <p style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>
                    {expanded || !truncated ? p.caption : visible}
                    {truncated && !expanded && (
                      <>
                        …{" "}
                        <button type="button" onClick={() => setExpanded(true)} className="min-h-11 -my-3 px-1 text-white" style={{ opacity: 0.85 }} aria-label="Mostrar el texto completo">más</button>
                      </>
                    )}
                    {expanded && truncated && (
                      <button type="button" onClick={() => setExpanded(false)} className="min-h-11 -my-3 px-1 text-white" style={{ opacity: 0.85 }}>menos</button>
                    )}
                  </p>
                ) : (
                  <p style={{ opacity: 0.7 }}>Todavía no hay texto.</p>
                )}
                <p className="mt-1.5" style={{ fontSize: 10.5, opacity: 0.85 }}>♪ Audio original · {p.handle}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {p.tab === "story" && (
        <label className="flex items-center gap-2 text-xs min-h-11" style={{ color: "#4B5563" }}>
          <input type="checkbox" checked={safe} onChange={(e) => setSafe(e.target.checked)} className="w-5 h-5" style={{ accentColor: "#9B21FF" }} />
          Mostrar zonas seguras (a verificar: {STORY_SAFE.topPx} px arriba y {STORY_SAFE.bottomPx} px abajo)
        </label>
      )}
      {count > 0 && p.tab !== "profile" && (
        <p className="text-xs" style={{ color: "#6B7280" }} aria-live="polite">
          Foto {idx + 1} de {count}
        </p>
      )}
    </div>
  );
}
