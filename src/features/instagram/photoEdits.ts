/**
 * Ediciones de foto NO destructivas: el original no se toca, las ediciones son parámetros
 * (`PhotoEdits`) que se hornean en un canvas tanto para la vista previa como para exportar.
 * Una sola función de dibujo (`drawEdited`) para ambas, así lo que se ve es lo que se descarga.
 * Puro salvo `loadImage` y `supportsCanvasFilter`, que necesitan el DOM.
 */

import { clamp01, cropRect, type CropRect, type Focal } from "./imageSpecs";

export type FilterId = "none" | "atardecer" | "luminoso" | "marmol" | "cine" | "pastel" | "vivido";

export const FILTERS: { id: FilterId; label: string; css: string; hint: string }[] = [
  { id: "none", label: "Original", css: "", hint: "Sin filtro." },
  { id: "atardecer", label: "Atardecer", css: "sepia(0.25) saturate(1.2) contrast(1.05) brightness(1.03)", hint: "Tonos cálidos y dorados." },
  { id: "luminoso", label: "Luminoso", css: "brightness(1.12) contrast(1.05) saturate(1.1)", hint: "Más luz, ideal para interiores." },
  { id: "marmol", label: "Mármol", css: "grayscale(1) contrast(1.1)", hint: "Blanco y negro suave." },
  { id: "cine", label: "Cine", css: "contrast(1.15) saturate(0.85) brightness(0.95)", hint: "Contraste profundo, colores sobrios." },
  { id: "pastel", label: "Pastel", css: "saturate(0.8) brightness(1.08) contrast(0.92)", hint: "Suave y aireado." },
  { id: "vivido", label: "Vívido", css: "saturate(1.4) contrast(1.1)", hint: "Colores intensos." },
];

export type TextPos = "top" | "center" | "bottom";
export type TextPlate = "none" | "auto";

export interface TextOverlay {
  text: string;
  /** Alto de letra como % del ancho de la imagen (3 a 14). */
  size: number;
  color: string;
  pos: TextPos;
  /** `auto` = placa que se elige sola para que el contraste con el color sea >= 4,5:1. */
  plate: TextPlate;
}

export interface PhotoEdits {
  focal: Focal;
  /** 1 a 3. */
  zoom: number;
  rotate: 0 | 90 | 180 | 270;
  flipH: boolean;
  /** -100 a 100 (0 = sin cambio). */
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
  /** 0 a 100. */
  vignette: number;
  filter: FilterId;
  text: TextOverlay | null;
  /** Sello con el nombre de la inmobiliaria. */
  stamp: boolean;
}

export const DEFAULT_EDITS: PhotoEdits = {
  focal: { x: 0.5, y: 0.5 },
  zoom: 1,
  rotate: 0,
  flipH: false,
  brightness: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  vignette: 0,
  filter: "none",
  text: null,
  stamp: false,
};

export const TEXT_COLORS = [
  { value: "#FFFFFF", label: "Blanco" },
  { value: "#111111", label: "Negro" },
  { value: "#FACC15", label: "Amarillo" },
  { value: "#6B7280", label: "Lila" },
] as const;

export const DEFAULT_TEXT: TextOverlay = { text: "", size: 7, color: "#FFFFFF", pos: "bottom", plate: "auto" };

export const TEXT_PRESETS = ["¡Nuevo!", "Oportunidad", "Recién publicado", "Visitas con cita previa"];

export const isEdited = (e: PhotoEdits) =>
  JSON.stringify({ ...e, text: e.text?.text.trim() ? e.text : null }) !== JSON.stringify(DEFAULT_EDITS);

/** Mezcla con los valores por defecto: tolera datos guardados con menos campos. */
export const normalizeEdits = (e: Partial<PhotoEdits> | undefined): PhotoEdits => ({ ...DEFAULT_EDITS, ...e, focal: { ...DEFAULT_EDITS.focal, ...e?.focal } });

/* ── Contraste (WCAG) ─────────────────────────────────────────────────────── */

function luminance(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Placa de fondo (negro o blanco) con mejor contraste contra el color del texto. */
export function plateColorFor(textColor: string): string {
  return contrastRatio(textColor, "#111111") >= contrastRatio(textColor, "#FFFFFF") ? "#111111" : "#FFFFFF";
}

/* ── Geometría ────────────────────────────────────────────────────────────── */

/** Recorte (en el espacio ya rotado) con zoom y punto focal. Con zoom 1 equivale a `cropRect`. */
export function editCrop(natW: number, natH: number, e: PhotoEdits, ratio: number): CropRect {
  const swap = e.rotate === 90 || e.rotate === 270;
  const rw = swap ? natH : natW;
  const rh = swap ? natW : natH;
  const base = cropRect(rw, rh, ratio, { x: 0.5, y: 0.5 });
  const z = Math.min(3, Math.max(1, e.zoom));
  const sw = base.sw / z;
  const sh = base.sh / z;
  return { sx: (rw - sw) * clamp01(e.focal.x), sy: (rh - sh) * clamp01(e.focal.y), sw, sh };
}

export function filterString(e: PhotoEdits): string {
  const preset = FILTERS.find((f) => f.id === e.filter)?.css ?? "";
  const parts = [preset];
  if (e.brightness) parts.push(`brightness(${(1 + e.brightness / 200).toFixed(3)})`);
  if (e.contrast) parts.push(`contrast(${(1 + e.contrast / 200).toFixed(3)})`);
  if (e.saturation) parts.push(`saturate(${(1 + e.saturation / 100).toFixed(3)})`);
  return parts.filter(Boolean).join(" ") || "none";
}

let filterOk: boolean | null = null;
/** Safari antiguo no implementa `ctx.filter`: sin esto las ediciones de color no se verían ni se exportarían. */
export function supportsCanvasFilter(): boolean {
  if (filterOk != null) return filterOk;
  try {
    const c = document.createElement("canvas").getContext("2d");
    filterOk = !!c && "filter" in c;
  } catch {
    filterOk = false;
  }
  return filterOk;
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:/i.test(url)) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo leer la imagen."));
    img.src = url;
  });
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(test).width > maxW) {
        out.push(line);
        line = word;
      } else line = test;
    }
    if (line) out.push(line);
  }
  return out.slice(0, 6);
}

function plate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, color: string, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export interface DrawOptions {
  /** Nombre de la inmobiliaria para el sello. */
  stampText?: string;
  /** Margen vertical extra (Stories/Reels: zonas que tapa la interfaz), como fracción del alto. */
  safeMargin?: number;
}

/** Dibuja la foto con todas sus ediciones en un canvas de `outW`×`outH`. */
export function drawEdited(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  natW: number,
  natH: number,
  e: PhotoEdits,
  outW: number,
  outH: number,
  opts: DrawOptions = {},
) {
  const swap = e.rotate === 90 || e.rotate === 270;
  const rw = swap ? natH : natW;
  const rh = swap ? natW : natH;
  const { sx, sy, sw, sh } = editCrop(natW, natH, e, outW / outH);

  ctx.save();
  // JPEG no tiene transparencia: fondo blanco para PNG/WebP con alfa.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, outW, outH);
  ctx.imageSmoothingQuality = "high";
  ctx.translate(outW / 2, outH / 2);
  ctx.scale(outW / sw, outH / sh);
  ctx.translate(-(sx + sw / 2), -(sy + sh / 2));
  // A partir de acá: coordenadas del espacio rotado -> imagen original.
  ctx.translate(rw / 2, rh / 2);
  ctx.rotate((e.rotate * Math.PI) / 180);
  ctx.scale(e.flipH ? -1 : 1, 1);
  ctx.translate(-natW / 2, -natH / 2);
  if (supportsCanvasFilter()) ctx.filter = filterString(e);
  ctx.drawImage(src, 0, 0);
  ctx.restore();

  if (e.warmth) {
    ctx.save();
    ctx.globalCompositeOperation = "soft-light";
    ctx.globalAlpha = Math.min(1, (Math.abs(e.warmth) / 100) * 0.55);
    ctx.fillStyle = e.warmth > 0 ? "#FF8A00" : "#2F7BFF";
    ctx.fillRect(0, 0, outW, outH);
    ctx.restore();
  }

  if (e.vignette > 0) {
    const g = ctx.createRadialGradient(outW / 2, outH / 2, Math.min(outW, outH) * 0.3, outW / 2, outH / 2, Math.hypot(outW, outH) / 2);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${(e.vignette / 100) * 0.75})`);
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, outW, outH);
    ctx.restore();
  }

  const t = e.text;
  if (t && t.text.trim()) {
    ctx.save();
    const fs = Math.round((outW * t.size) / 100);
    ctx.font = `800 ${fs}px "SF Pro Display", -apple-system, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lines = wrapLines(ctx, t.text.trim(), outW * 0.78);
    const lh = fs * 1.2;
    const blockW = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const padX = fs * 0.6;
    const padY = fs * 0.4;
    const boxW = blockW + padX * 2;
    const boxH = lines.length * lh + padY * 2;
    const margin = outH * (0.07 + (opts.safeMargin ?? 0));
    const top = t.pos === "top" ? margin : t.pos === "bottom" ? outH - margin - boxH : (outH - boxH) / 2;
    if (t.plate === "auto") plate(ctx, (outW - boxW) / 2, top, boxW, boxH, fs * 0.35, plateColorFor(t.color), 0.88);
    else {
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = fs * 0.25;
    }
    ctx.fillStyle = t.color;
    lines.forEach((l, i) => ctx.fillText(l, outW / 2, top + padY + lh * (i + 0.5)));
    ctx.restore();
  }

  if (e.stamp && opts.stampText?.trim()) {
    ctx.save();
    const fs = Math.round(outW * 0.028);
    ctx.font = `700 ${fs}px "SF Pro Display", -apple-system, system-ui, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const w = ctx.measureText(opts.stampText).width;
    const px = fs * 0.7;
    const x = outW - w - px * 2 - outW * 0.035;
    const y = outH * (0.035 + (opts.safeMargin ?? 0));
    plate(ctx, x, y, w + px * 2, fs * 1.9, fs * 0.5, "#111111", 0.6);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(opts.stampText, x + px, y + fs * 0.95);
    ctx.restore();
  }
}

/** Solo los ajustes de imagen (no encuadre ni texto) para «copiar ajustes a todas». */
export function adjustmentsOf(e: PhotoEdits): Pick<PhotoEdits, "brightness" | "contrast" | "saturation" | "warmth" | "vignette" | "filter" | "stamp"> {
  const { brightness, contrast, saturation, warmth, vignette, filter, stamp } = e;
  return { brightness, contrast, saturation, warmth, vignette, filter, stamp };
}
