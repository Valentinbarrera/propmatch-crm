import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { Card, SectionHeader } from "@/components/ui/Card";
import { useStore } from "@/data/store";
import { agencyPatch, canPublishBrand, fetchPublishedBrand, processLogo, publishBrand } from "@/lib/branding";
import { PhotoLogoOverlay } from "./PhotoLogoOverlay";
import { UpdateAppPhotos } from "@/features/appSync/PublishAllToApp";
import { appWatermarkFor } from "@/lib/appWatermark";
import {
  DEFAULT_PHOTO_LOGO,
  EMPTY_BRAND,
  PHOTO_LOGO_BACKDROPS,
  PHOTO_LOGO_POSITIONS,
  PHOTO_LOGO_POSITION_LABEL,
  PHOTO_LOGO_SIZES,
  PROPMATCH_PRIMARY,
  PROPMATCH_SECONDARY,
  brandCssVars,
  checkContrast,
  isHexColor,
  resolveBrand,
  appWatermarkFingerprint,
  resolvePhotoLogo,
  sanitizeBrand,
  textOn,
  type AgencyBrand,
  type PhotoLogoBackdrop,
  type PhotoLogoSettings,
  type PhotoLogoSize,
} from "../../../shared/brand";

const INK = "#1A1A1A";
const SOFT = "#6B7280";

const inputClass =
  "w-full px-4 py-2.5 rounded-xl text-sm border outline-none transition-all bg-white " +
  "text-[#1A1A1A] placeholder:text-[#6B7280] border-[#E9E5DE] focus:border-[#9B21FF] focus:ring-4 focus:ring-[#E9E5DE] " +
  "disabled:bg-[#FAF8F5] disabled:text-[#6B7280] disabled:cursor-not-allowed";

/**
 * Configuración → «Marca de tu inmobiliaria». Logo, colores (con chequeo de
 * contraste AA y vista previa) y datos de contacto que salen en la ficha para
 * clientes, el PDF y la web pública. Se guarda en este navegador y, con la
 * cuenta de una inmobiliaria real, se publica en el Storage (ver
 * src/lib/branding.ts).
 */
export function BrandingCard({ onSaved }: { onSaved: (msg: string) => void }) {
  const { agency, profile, updateAgency } = useStore();
  const canEdit = profile.role === "owner" || profile.role === "admin";
  const publishable = canPublishBrand(agency.id);
  // Normalizada: las marcas guardadas antes del logo para fotos no traen esos campos.
  const saved = useMemo(() => (agency.branding ? sanitizeBrand(agency.branding, { allowDataLogo: true }) : null), [agency.branding]);
  const [form, setForm] = useState<AgencyBrand>(() => saved ?? { ...EMPTY_BRAND, phone: agency.phone, email: agency.email });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const photoFileRef = useRef<HTMLInputElement>(null);
  const id = useId();

  // Otro miembro de la agencia ya publicó la marca: se trae la publicada.
  const adoptedRef = useRef(false);
  useEffect(() => {
    if (!publishable || saved || adoptedRef.current) return;
    adoptedRef.current = true;
    fetchPublishedBrand(agency.id).then((b) => {
      if (!b) return;
      updateAgency(agencyPatch(agency, { branding: b }));
      setForm(b);
      setStatus("Trajimos la marca que ya estaba publicada para tu inmobiliaria.");
    });
  }, [publishable, saved, agency, updateAgency]);

  const set = <K extends keyof AgencyBrand>(k: K, v: AgencyBrand[K]) => setForm((f) => ({ ...f, [k]: v }));
  const text = (k: keyof AgencyBrand) => ({
    value: (form[k] as string | null) ?? "",
    onChange: (e: { target: { value: string } }) => set(k, (e.target.value || null) as never),
    disabled: !canEdit,
    className: inputClass,
  });
  const dirty = JSON.stringify(form) !== JSON.stringify(saved ?? null);

  const setPhotoLogo = (patch: Partial<PhotoLogoSettings>) =>
    setForm((f) => ({ ...f, photoLogo: { ...(f.photoLogo ?? DEFAULT_PHOTO_LOGO), ...patch } }));

  async function onLogo(file: File | undefined, field: "logoUrl" | "photoLogoUrl" = "logoUrl") {
    if (!file) return;
    setError(null);
    try {
      set(field, await processLogo(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos leer el logo.");
    }
  }

  async function save() {
    if (!isHexColor(form.primary) || !isHexColor(form.secondary)) return setError("Los colores tienen que tener el formato #RRGGBB.");
    const clean = sanitizeBrand({ ...form, updatedAt: new Date().toISOString() }, { allowDataLogo: true });
    if (!clean) return setError("Revisá los datos.");
    if (form.email && !clean.email) return setError("Revisá el email.");
    if (form.website && !clean.website) return setError("Revisá la dirección de la web.");
    setError(null);
    updateAgency(agencyPatch(agency, { branding: clean }));
    setForm(clean);
    if (!publishable) {
      setStatus("Guardada en este navegador. Se publica en tu web cuando uses la cuenta de tu inmobiliaria.");
      onSaved("Marca guardada");
      return;
    }
    setBusy(true);
    setStatus("Publicando en tu web…");
    const r = await publishBrand(agency.id, clean);
    setBusy(false);
    if (r.ok) {
      updateAgency(agencyPatch(agency, { branding: r.brand }));
      setForm(r.brand);
      setStatus("Publicada: tu web y las fichas nuevas ya usan esta marca (puede tardar unos minutos en verse).");
      onSaved("Marca guardada y publicada");
    } else {
      setStatus(`Guardada en este navegador, pero no se publicó: ${r.error}`);
      onSaved("Marca guardada en este navegador");
    }
  }

  const resolved = resolveBrand(form, { name: agency.name, phone: agency.phone, email: agency.email });
  const btn = checkContrast(resolved.onPrimary, form.primary);
  const primaryText = checkContrast(form.primary, "#FFFFFF");
  const secondaryText = checkContrast(form.secondary, "#FFFFFF");

  return (
    <Card className="lg:col-span-2">
      <SectionHeader
        inCard
        title="Marca de tu inmobiliaria"
        subtitle={canEdit ? "Logo, colores y datos que ven tus clientes en la ficha, el PDF y tu web" : "Solo el dueño o un administrador puede editarla"}
      />
      <div className="p-5 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="grid gap-4 sm:grid-cols-2 content-start">
          {/* Logo */}
          <div className="sm:col-span-2 flex items-center gap-4">
            <div
              className="w-28 h-20 rounded-xl border flex items-center justify-center overflow-hidden flex-shrink-0"
              style={{ borderColor: "#E9E5DE", background: "repeating-conic-gradient(#F7F0FF 0% 25%, white 0% 50%) 50% / 16px 16px" }}
            >
              {form.logoUrl ? (
                <img src={form.logoUrl} alt="Logo actual" className="max-w-full max-h-full object-contain" />
              ) : (
                <span className="text-xs" style={{ color: SOFT }}>Sin logo</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm" style={{ color: INK, fontWeight: 700 }}>Logo</p>
              <p className="text-xs" style={{ color: SOFT }}>PNG, JPG o SVG. Lo achicamos solo. Mejor con fondo transparente.</p>
              <div className="flex gap-2 mt-2">
                <input
                  ref={fileRef}
                  id={`${id}-logo`}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  className="sr-only"
                  disabled={!canEdit}
                  onChange={(e) => {
                    onLogo(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => fileRef.current?.click()}
                  className="min-h-9 px-3 rounded-lg text-xs border bg-white disabled:opacity-50"
                  style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 700 }}
                >
                  {form.logoUrl ? "Cambiar logo" : "Subir logo"}
                </button>
                {form.logoUrl && canEdit && (
                  <button type="button" onClick={() => set("logoUrl", null)} className="min-h-9 px-3 rounded-lg text-xs" style={{ color: "#BE123C", fontWeight: 700 }}>
                    Quitar
                  </button>
                )}
              </div>
            </div>
          </div>

          <ColorField
            label="Color principal"
            hint="Botones, títulos y detalles"
            value={form.primary}
            fallback={PROPMATCH_PRIMARY}
            disabled={!canEdit}
            onChange={(v) => set("primary", v)}
          />
          <ColorField
            label="Color secundario"
            hint="Degradés y acentos"
            value={form.secondary}
            fallback={PROPMATCH_SECONDARY}
            disabled={!canEdit}
            onChange={(v) => set("secondary", v)}
          />
          <div className="sm:col-span-2 rounded-xl p-3 text-xs grid gap-1" style={{ background: "#FAF8F5", color: INK }}>
            <ContrastLine ok={btn.aa} warn={btn.aaLarge} text={`Texto de los botones sobre el principal: ${btn.ratio}:1`} />
            <ContrastLine
              ok={primaryText.aa}
              warn={primaryText.aaLarge}
              adjusted
              text={
                primaryText.aa
                  ? `Principal sobre blanco: ${primaryText.ratio}:1`
                  : `Principal sobre blanco: ${primaryText.ratio}:1 — para los textos usamos un tono más oscuro (${resolved.accent})`
              }
            />
            <ContrastLine
              ok={secondaryText.aa}
              warn={secondaryText.aaLarge}
              adjusted
              text={
                secondaryText.aa
                  ? `Secundario sobre blanco: ${secondaryText.ratio}:1`
                  : `Secundario sobre blanco: ${secondaryText.ratio}:1 — para textos usamos ${resolved.accent2}`
              }
            />
            <p style={{ color: SOFT }}>AA pide 4,5:1 para texto normal y 3:1 para texto grande.</p>
          </div>

          <Field label="Nombre comercial" className="sm:col-span-2">
            <input {...text("displayName")} placeholder={agency.name} />
          </Field>
          <Field label="Teléfono">
            <input {...text("phone")} placeholder="011 4555-0000" />
          </Field>
          <Field label="WhatsApp (si es otro)">
            <input {...text("whatsapp")} placeholder="11 5555-0000" />
          </Field>
          <Field label="Email">
            <input {...text("email")} type="email" placeholder="hola@tuinmobiliaria.com" />
          </Field>
          <Field label="Matrícula (opcional)">
            <input {...text("license")} placeholder="CUCICBA 1234" />
          </Field>
          <Field label="Dirección" className="sm:col-span-2">
            <input {...text("address")} placeholder="Av. Cabildo 1234, Belgrano, CABA" />
          </Field>
          <Field label="Web">
            <input {...text("website")} placeholder="tuinmobiliaria.com.ar" />
          </Field>
          <Field label="Instagram">
            <input {...text("instagram")} placeholder="@tuinmobiliaria" />
          </Field>
          <Field label="Facebook">
            <input {...text("facebook")} placeholder="tuinmobiliaria" />
          </Field>
          <Field label="Texto al pie" className="sm:col-span-2">
            <textarea {...text("footer")} rows={2} placeholder="Ej: Más de 20 años en zona norte. Atendemos de lunes a sábados." />
          </Field>
          <label className="sm:col-span-2 flex items-center gap-2 text-sm" style={{ color: INK }}>
            <input type="checkbox" checked={form.showPoweredBy} disabled={!canEdit} onChange={(e) => set("showPoweredBy", e.target.checked)} />
            Mostrar «Hecho con PropMatch» chiquito al pie
          </label>

          <PhotoLogoSection
            form={form}
            canEdit={canEdit}
            publishable={publishable}
            savedAppFingerprint={appWatermarkFingerprint(appWatermarkFor(saved, agency.id))}
            inputRef={photoFileRef}
            inputId={`${id}-photo-logo`}
            onFile={(f) => onLogo(f, "photoLogoUrl")}
            onRemove={() => set("photoLogoUrl", null)}
            onChange={setPhotoLogo}
          />
        </div>

        {/* Vista previa */}
        <div>
          <p className="text-xs mb-2" style={{ color: SOFT, fontWeight: 700 }}>VISTA PREVIA</p>
          <BrandPreview brand={form} fallbackName={agency.name} fallbackPhone={agency.phone} fallbackEmail={agency.email} />
          <p className="text-xs mt-2" style={{ color: SOFT }}>
            {publishable
              ? "Al guardar se publica para tu web y para las fichas que mandes desde ahora."
              : "En la demo o sin inmobiliaria vinculada, la marca queda en este navegador (las fichas que mandes ya la usan)."}
          </p>
        </div>
      </div>
      {canEdit && (
        <div className="px-5 py-3.5 border-t flex flex-wrap items-center justify-end gap-3" style={{ borderColor: "#F0EDE6", background: "#FAF8F5" }}>
          {(error || status) && (
            <span role={error ? "alert" : "status"} className="mr-auto text-xs" style={{ color: error ? "#BE123C" : "#15803D", fontWeight: 600 }}>
              {error ?? status}
            </span>
          )}
          <button
            onClick={save}
            disabled={(!dirty && !!saved) || busy}
            className="px-5 py-2 rounded-xl text-sm text-white transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "var(--gradient-brand)", fontWeight: 600 }}
          >
            {busy ? "Publicando…" : "Guardar marca"}
          </button>
        </div>
      )}
    </Card>
  );
}

const SIZE_LABEL: Record<PhotoLogoSize, string> = { sm: "Chico", md: "Mediano" };
const BACKDROP_LABEL: Record<PhotoLogoBackdrop, string> = { shadow: "Sombra suave", light: "Placa clara", dark: "Placa oscura" };

/** Fotos de ejemplo (dibujadas con CSS, sin pedir imágenes afuera). */
const SAMPLE_PHOTOS = [
  {
    label: "Foto clara",
    background:
      "linear-gradient(180deg, #DBEAFE 0%, #F1F5F9 45%, transparent 45%), linear-gradient(90deg, #F8FAFC 0 30%, #E2E8F0 30% 33%, #FFFFFF 33% 70%, #CBD5E1 70% 72%, #F1F5F9 72%), #F8FAFC",
  },
  {
    label: "Foto oscura",
    background:
      "radial-gradient(circle at 70% 30%, rgba(251,191,36,0.55) 0 6%, transparent 22%), linear-gradient(180deg, #1E293B 0%, #0F172A 55%, #3F2A1D 55%, #1C1410 100%)",
  },
];

/**
 * «Logo sobre las fotos»: versión para fotos (opcional), sí/no, esquina,
 * tamaño y fondo, con vista previa sobre una foto clara y una oscura.
 */
function PhotoLogoSection({
  form,
  canEdit,
  publishable,
  savedAppFingerprint,
  inputRef,
  inputId,
  onFile,
  onRemove,
  onChange,
}: {
  form: AgencyBrand;
  canEdit: boolean;
  /** Cuenta vinculada a una inmobiliaria real (la marca se publica). */
  publishable: boolean;
  /** Huella del logo para la app según la marca GUARDADA (no la del formulario). */
  savedAppFingerprint: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  inputId: string;
  onFile: (f: File | undefined) => void;
  onRemove: () => void;
  onChange: (patch: Partial<PhotoLogoSettings>) => void;
}) {
  const settings = form.photoLogo ?? DEFAULT_PHOTO_LOGO;
  const hasOwn = !!form.photoLogoUrl;
  // La vista previa se ve aunque esté apagado (atenuada), para poder elegir antes de prender.
  const preview = resolvePhotoLogo({ ...form, photoLogo: { ...settings, show: true } });
  // Esquina, tamaño y fondo valen para lo visual y para las fotos de la app.
  const off = !canEdit || (!settings.show && !settings.inApp);
  const prevId = useId();
  const chip = "min-h-9 px-3 rounded-lg text-xs border transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const chipStyle = (active: boolean): CSSProperties =>
    active
      ? { background: "#F7F0FF", borderColor: "#9B21FF", color: "#7C0BD8", fontWeight: 700 }
      : { background: "white", borderColor: "#DDD8CF", color: INK, fontWeight: 600 };

  return (
    <div className="sm:col-span-2 rounded-xl border p-4 grid gap-4" style={{ borderColor: "#E9E5DE" }}>
      <div>
        <p className="text-sm" style={{ color: INK, fontWeight: 700 }}>Logo sobre las fotos</p>
        <p className="text-xs mt-0.5" style={{ color: SOFT }}>
          Se ve encima de las fotos en el CRM, la ficha para clientes, el PDF y tu web. Las fotos no se modifican: a Mercado Libre van siempre sin logo.
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm" style={{ color: INK, fontWeight: 600 }}>
        <input type="checkbox" checked={settings.show} disabled={!canEdit} onChange={(e) => onChange({ show: e.target.checked })} />
        Mostrar el logo sobre las fotos
      </label>
      <div className="grid gap-2">
        <label className="flex items-start gap-2 text-sm" style={{ color: INK, fontWeight: 600 }}>
          <input
            type="checkbox"
            className="mt-0.5"
            checked={settings.inApp}
            disabled={!canEdit}
            onChange={(e) => onChange({ inApp: e.target.checked })}
            aria-describedby={`${prevId}-app`}
          />
          <span>
            Poner el logo en las fotos de la app PropMatch
            <span id={`${prevId}-app`} className="block text-xs mt-0.5" style={{ color: SOFT, fontWeight: 400 }}>
              Se agrega a una copia de cada foto que va a la app. Las fotos originales y las de Mercado Libre no cambian.
            </span>
          </span>
        </label>
        {settings.inApp && !publishable && (
          <p className="text-xs" style={{ color: SOFT }}>
            Se aplica cuando uses la cuenta de tu inmobiliaria vinculada a la app (con la marca publicada).
          </p>
        )}
        {publishable && <UpdateAppPhotos fingerprint={savedAppFingerprint} />}
      </div>

      <div className="flex items-center gap-4">
        <div
          className="w-28 h-20 rounded-xl border flex items-center justify-center overflow-hidden flex-shrink-0"
          style={{ borderColor: "#E9E5DE", background: "repeating-conic-gradient(#374151 0% 25%, #1A1A1A 0% 50%) 50% / 16px 16px" }}
        >
          {form.photoLogoUrl ? (
            <img src={form.photoLogoUrl} alt="Logo para fotos" className="max-w-full max-h-full object-contain p-2" />
          ) : (
            <span className="text-xs text-center px-2" style={{ color: "#E9E5DE" }}>Sin versión para fotos</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm" style={{ color: INK, fontWeight: 700 }}>
            Versión para fotos <span style={{ fontWeight: 400, color: SOFT }}>(opcional)</span>
          </p>
          <p className="text-xs" style={{ color: SOFT }}>
            Ideal: tu logo en blanco, PNG con fondo transparente (o SVG). Si no la subís, usamos el logo principal sobre una placa blanca.
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              className="sr-only"
              disabled={!canEdit}
              onChange={(e) => {
                onFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => inputRef.current?.click()}
              className="min-h-9 px-3 rounded-lg text-xs border bg-white disabled:opacity-50"
              style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 700 }}
            >
              {hasOwn ? "Cambiar versión para fotos" : "Subir versión para fotos"}
            </button>
            {hasOwn && canEdit && (
              <button type="button" onClick={onRemove} className="min-h-9 px-3 rounded-lg text-xs" style={{ color: "#BE123C", fontWeight: 700 }}>
                Quitar
              </button>
            )}
          </div>
        </div>
      </div>

      <fieldset>
        <legend className="text-xs mb-1.5" style={{ color: "#6B7280", fontWeight: 600 }}>Posición</legend>
        <div className="grid grid-cols-2 gap-2 max-w-sm">
          {PHOTO_LOGO_POSITIONS.map((pos) => (
            <button
              key={pos}
              type="button"
              aria-pressed={settings.position === pos}
              disabled={off}
              onClick={() => onChange({ position: pos })}
              className={chip}
              style={chipStyle(settings.position === pos)}
            >
              {PHOTO_LOGO_POSITION_LABEL[pos]}
            </button>
          ))}
        </div>
        <p className="text-xs mt-1.5" style={{ color: SOFT }}>
          Si en esa esquina ya hay algo (estado, operación, estrella, contador de fotos), el logo se corre solo a otra libre.
        </p>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset>
          <legend className="text-xs mb-1.5" style={{ color: "#6B7280", fontWeight: 600 }}>Tamaño</legend>
          <div className="flex gap-2">
            {PHOTO_LOGO_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                aria-pressed={settings.size === size}
                disabled={off}
                onClick={() => onChange({ size })}
                className={chip}
                style={chipStyle(settings.size === size)}
              >
                {SIZE_LABEL[size]}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-xs mb-1.5" style={{ color: "#6B7280", fontWeight: 600 }}>Fondo para que se lea</legend>
          <div className="flex flex-wrap gap-2">
            {PHOTO_LOGO_BACKDROPS.map((b) => {
              const active = hasOwn ? settings.backdrop === b : b === "light";
              return (
                <button
                  key={b}
                  type="button"
                  aria-pressed={active}
                  disabled={off || !hasOwn}
                  onClick={() => onChange({ backdrop: b })}
                  className={chip}
                  style={chipStyle(active)}
                >
                  {BACKDROP_LABEL[b]}
                </button>
              );
            })}
          </div>
          {!hasOwn && (
            <p className="text-xs mt-1.5" style={{ color: SOFT }}>
              Con el logo principal va siempre sobre placa clara. Subí la versión para fotos para elegir.
            </p>
          )}
        </fieldset>
      </div>

      <div>
        <p id={prevId} className="text-xs mb-2" style={{ color: SOFT, fontWeight: 700 }}>
          VISTA PREVIA SOBRE FOTOS{settings.show || settings.inApp ? "" : " · apagado: todavía no se muestra"}
        </p>
        {preview ? (
          <div role="group" aria-labelledby={prevId} className="grid grid-cols-2 gap-3" style={{ opacity: settings.show || settings.inApp ? 1 : 0.6 }}>
            {SAMPLE_PHOTOS.map((ph) => (
              <figure key={ph.label} className="m-0">
                <div className="relative rounded-xl overflow-hidden aspect-[4/3]" style={{ background: ph.background }}>
                  <span aria-hidden="true" className="absolute top-3 left-3 text-[11px] px-2 py-0.5 rounded-full bg-white" style={{ color: "#7C0BD8", fontWeight: 700 }}>
                    Venta
                  </span>
                  <PhotoLogoOverlay logo={preview} avoid={["top-left"]} />
                </div>
                <figcaption className="text-[11px] mt-1" style={{ color: SOFT }}>{ph.label}</figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <p className="text-xs" style={{ color: SOFT }}>Subí un logo (el principal o la versión para fotos) para ver cómo queda.</p>
        )}
      </div>
    </div>
  );
}

function ContrastLine({ ok, warn, adjusted, text }: { ok: boolean; warn: boolean; adjusted?: boolean; text: string }) {
  return (
    <p className="flex items-start gap-1.5" style={{ color: ok ? "#15803D" : warn || adjusted ? "#B45309" : "#BE123C", fontWeight: 600 }}>
      <span aria-hidden="true">{ok ? "✓" : "!"}</span>
      <span>
        {ok ? "AA · " : adjusted ? "Ajustado · " : warn ? "Solo texto grande · " : "No llega a AA · "}
        {text}
      </span>
    </p>
  );
}

function ColorField({
  label,
  hint,
  value,
  fallback,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  fallback: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-xs mb-1.5" style={{ color: "#6B7280", fontWeight: 600 }}>
        {label} <span style={{ fontWeight: 400 }}>· {hint}</span>
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label}: selector`}
          value={isHexColor(value) ? value : fallback}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="w-11 h-11 rounded-lg border cursor-pointer disabled:cursor-not-allowed"
          style={{ borderColor: "#E9E5DE", padding: 2, background: "white" }}
        />
        <input
          id={id}
          value={draft}
          disabled={disabled}
          maxLength={7}
          onChange={(e) => {
            const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
            setDraft(v);
            if (isHexColor(v)) onChange(v.toUpperCase());
          }}
          className={`${inputClass} font-mono uppercase`}
        />
      </div>
    </div>
  );
}

/** Mini ficha con la marca: encabezado, precio, botón y pie. */
export function BrandPreview({
  brand,
  fallbackName,
  fallbackPhone,
  fallbackEmail,
}: {
  brand: AgencyBrand;
  fallbackName: string;
  fallbackPhone: string | null;
  fallbackEmail: string | null;
}) {
  const r = resolveBrand(brand, { name: fallbackName, phone: fallbackPhone, email: fallbackEmail });
  return (
    <div className="rounded-2xl border overflow-hidden text-left" style={{ ...(brandCssVars(r) as CSSProperties), borderColor: r.border, background: "white" }}>
      <div className="px-4 py-3 flex items-center gap-2.5 border-b" style={{ borderColor: r.border }}>
        {r.logoUrl ? (
          <img src={r.logoUrl} alt="" className="h-8 max-w-[120px] object-contain" />
        ) : (
          <span className="w-8 h-8 rounded-lg flex items-center justify-center text-xs" style={{ background: r.gradient, color: textOn(r.primary), fontWeight: 800 }}>
            {r.name.slice(0, 2).toUpperCase()}
          </span>
        )}
        <span className="text-sm truncate" style={{ color: INK, fontWeight: 800 }}>{r.name}</span>
      </div>
      <div className="h-20" style={{ background: `linear-gradient(135deg, ${r.soft}, white)` }} />
      <div className="p-4">
        <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: r.soft, color: r.accent, fontWeight: 700 }}>Venta</span>
        <p className="text-sm mt-2" style={{ color: INK, fontWeight: 800 }}>Departamento 3 ambientes con balcón</p>
        <p className="text-lg mt-1" style={{ color: r.accent, fontWeight: 800 }}>USD 145.000</p>
        <span className="mt-3 inline-flex px-3 py-2 rounded-lg text-xs" style={{ background: r.primary, color: r.onPrimary, fontWeight: 700 }}>
          Consultar
        </span>
      </div>
      <div className="px-4 py-3 text-[11px] border-t" style={{ borderColor: r.border, color: SOFT }}>
        <p style={{ color: INK, fontWeight: 700 }}>{r.name}</p>
        <p>{[r.phone, r.email].filter(Boolean).join(" · ") || "Sin datos de contacto"}</p>
        {r.address && <p>{r.address}</p>}
        {r.license && <p>Matrícula: {r.license}</p>}
        {r.footer && <p className="mt-1 whitespace-pre-line">{r.footer}</p>}
        {r.showPoweredBy && <p className="mt-1" style={{ fontSize: 10 }}>Hecho con PropMatch</p>}
      </div>
    </div>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs mb-1.5" style={{ color: "#6B7280", fontWeight: 600 }}>
        {label}
      </span>
      {children}
    </label>
  );
}
