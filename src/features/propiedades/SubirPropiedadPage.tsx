import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { CheckIcon } from "@/components/ui/icons";
import { isLinkedAgencyId, useStore } from "@/data/store";
import { FEATURE_CHIPS, ZONES } from "@/data/seed";
import { PROPERTY_STATUS_LABEL, PROPERTY_TYPE_LABEL, relativeTime } from "@/lib/format";
import { isShortMapsLink, parseCoordinates } from "@/lib/geo";
import { DESCRIPTION_MIN, TITLE_MAX, TITLE_MIN, diagnose } from "@/lib/listingDiagnostics";
import { AUTHORIZATION_LABEL, AUTHORIZATION_TONE_STYLE, authorizationState, dateInputFromNow } from "@/lib/authorization";
import type {
  AuthorizationType,
  OperationType,
  PropertyLayout,
  PropertyOrientation,
  PropertyStatus,
  PropertyType,
} from "@/types/db";
import { coordsOf, initialForm, roomsValue, toDraftProperty, toInput, type FormState } from "./subir/form";
import { clearDraft, draftKey, loadDraft, saveDraft, type StoredDraft } from "./subir/draft";
import { Chip, CounterHint, Field, FormSection, MoneyField, Stepper, Switch, inputClass, selectClass } from "./subir/ui";
import { PhotoGallery } from "./subir/PhotoGallery";
import { BuyersPanel, ChannelsPanel, QualityPanel, useCompatibleBuyers } from "./subir/SidePanels";
import { LAYOUTS, ORIENTATIONS, editorFieldId as fid } from "./completar/fields";
import { focusField } from "./completar/focusField";
import { VozPropiedadEntry } from "@/features/voz/VozPropiedadEntry";

const PROP_TYPES = Object.keys(PROPERTY_TYPE_LABEL) as PropertyType[];
const STATUSES = Object.keys(PROPERTY_STATUS_LABEL) as PropertyStatus[];
const OPERATIONS: { value: OperationType; label: string }[] = [
  { value: "venta", label: "Venta" },
  { value: "alquiler", label: "Alquiler" },
  { value: "alquiler_temporal", label: "Temporal" },
];
const SUBTYPES: Record<PropertyType, string[]> = {
  casa: ["Casa", "Chalet", "Casa quinta", "Dúplex", "Prefabricada"],
  departamento: ["Monoambiente", "Loft", "Dúplex", "Semipiso", "Piso", "Penthouse"],
  ph: ["PH al frente", "PH interno", "Dúplex"],
  terreno: ["Lote", "Lote en barrio cerrado", "Fracción", "Quinta"],
  local: ["Local a la calle", "Local en galería"],
  oficina: ["Oficina", "Consultorio", "Edificio de oficinas"],
};
const SECTIONS = [
  { id: "galeria", label: "Galería" },
  { id: "informacion", label: "Información comercial" },
  { id: "precios", label: "Precios" },
  { id: "superficies", label: "Superficies y ambientes" },
  { id: "ubicacion", label: "Ubicación" },
  { id: "amenities", label: "Amenities" },
  { id: "propietario", label: "Propietario" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

/** Debounce del autoguardado del borrador. */
const AUTOSAVE_MS = 800;

/**
 * Alta y edición de una propiedad.
 *
 * Es el mismo formulario para las dos cosas: con `:propertyId` en la ruta
 * arranca precargado y guarda sobre la propiedad existente.
 *
 * Mientras se completa, el formulario se autoguarda como borrador en este
 * navegador (ver subir/draft.ts). El borrador nunca entra al store ni se
 * sincroniza con la app: solo "Guardar" crea o actualiza la propiedad.
 */
export default function SubirPropiedadPage() {
  const navigate = useNavigate();
  const { propertyId } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  /** Vino desde "Completar" del publicador: al guardar vuelve ahí. */
  const backToPublisher = searchParams.get("volver") === "publicador";
  const { addProperty, savePropertyEdit, propertyById, photos: allPhotos, profiles, profile, contacts, addContact, agency } =
    useStore();

  const editing = propertyById(propertyId);
  // Viene del Multipublicador: se muestran los pasos 1/2 y "Guardar" pasa a "Solo guardar".
  const publishAfter = !editing && searchParams.get("publicar") === "1";
  const key = draftKey(editing?.id);

  const [form, setForm] = useState<FormState>(() =>
    initialForm(editing, editing ? (allPhotos[editing.id] ?? []) : [], profile.id),
  );
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const [mapsLink, setMapsLink] = useState("");
  const [mapsMsg, setMapsMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  /** `null` mientras no se está cargando un propietario nuevo. */
  const [newOwner, setNewOwner] = useState<{ name: string; phone: string } | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ kind: "ok" | "error"; title?: string; text: string } | null>(null);
  const [confirm, setConfirm] = useState<null | { kind: "exit" | "discard"; target: string }>(null);
  const [active, setActive] = useState<SectionId>("galeria");
  const scrollRef = useRef<HTMLDivElement>(null);

  /** "Cambios sin guardar" comparando contra el estado inicial. */
  const snapshot = JSON.stringify(form);
  const initialSnapshot = useRef(snapshot);
  const touched = snapshot !== initialSnapshot.current;

  /* ── Borrador ──────────────────────────────────────────────────────── */

  /** Borrador anterior que se ofrece recuperar al abrir. Mientras se ofrece, no se pisa. */
  const [draftOffer, setDraftOffer] = useState<StoredDraft | null>(() => {
    const d = loadDraft(key);
    return d && JSON.stringify(d.form) !== initialSnapshot.current ? d : null;
  });
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (draftOffer || !touched) return;
    const t = setTimeout(() => {
      const saved = saveDraft(key, form);
      if (saved) setSavedAt(saved.savedAt);
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [form, touched, draftOffer, key]);

  // "Guardado hace X" se refresca solo.
  useEffect(() => {
    if (!savedAt) return;
    const i = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(i);
  }, [savedAt]);

  function recoverDraft() {
    if (!draftOffer) return;
    setForm(draftOffer.form);
    setSavedAt(draftOffer.savedAt);
    if (draftOffer.photosDropped) {
      setToast({
        kind: "error",
        title: "Borrador recuperado sin algunas fotos",
        text: "Las fotos nuevas no entraban en el navegador. Volvé a subirlas.",
      });
    }
    setDraftOffer(null);
  }

  function dropDraftOffer() {
    clearDraft(key);
    setDraftOffer(null);
  }

  /** Guarda sin validar y sin tocar el store: no crea la propiedad ni sincroniza nada. */
  function saveDraftNow() {
    const saved = saveDraft(key, form);
    if (!saved) {
      setToast({
        kind: "error",
        title: "No se pudo guardar el borrador",
        text: "El navegador no tiene lugar. Guardá la propiedad o liberá espacio.",
      });
      return;
    }
    setDraftOffer(null);
    setSavedAt(saved.savedAt);
    setToast({
      kind: "ok",
      title: "Borrador guardado",
      text: saved.photosDropped
        ? "Quedó en este navegador, sin las fotos nuevas (no entraban). No se publicó en ningún canal."
        : "Quedó en este navegador. No se publicó en ningún canal ni en la app.",
    });
  }

  /* ── Derivados en vivo ─────────────────────────────────────────────── */

  const draftProperty = useMemo(() => toDraftProperty(form, editing), [form, editing]);
  const checks = useMemo(() => diagnose(draftProperty, form.photos.length), [draftProperty, form.photos.length]);
  const buyers = useCompatibleBuyers(form.price ? draftProperty : null);
  const ok = (id: string) => checks.find((c) => c.id === id)?.ok ?? false;
  const done: Record<SectionId, boolean> = {
    galeria: ok("photos"),
    informacion: ok("title") && ok("description"),
    precios: ok("price"),
    superficies: ok("size"),
    ubicacion: !!form.street.trim() && ok("coords"),
    amenities: form.features.length > 0,
    propietario: !!form.ownerId && ok("authorization"),
  };
  const coords = coordsOf(form);
  const titleLen = form.title.trim().length;
  const descLen = form.description.trim().length;

  /**
   * Si la propiedad tiene una zona que no está en la lista fija, se agrega:
   * un <select> cuyo value no existe entre sus opciones muestra la primera y
   * al guardar reescribiría la zona sin que nadie lo pida.
   */
  const zoneOptions = ZONES.includes(form.locality) ? ZONES : [form.locality, ...ZONES];
  /** Lo mismo con amenities que vinieron de la app o de una importación: se muestran para poder sacarlos. */
  const featureOptions = [...FEATURE_CHIPS, ...form.features.filter((f) => !FEATURE_CHIPS.includes(f))];

  /* ── Subnav: sección activa ────────────────────────────────────────── */

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const visible = new Set<string>();
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        const first = SECTIONS.find((s) => visible.has(s.id));
        if (first) setActive(first.id);
      },
      // Franja de lectura: debajo del subnav y en la mitad superior.
      { root, rootMargin: "-72px 0px -55% 0px", threshold: 0 },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, []);

  function jumpTo(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    el.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  }

  /** "Completar": lleva al campo exacto (o a la sección) y lo resalta. */
  function fixField(id: string) {
    if (!focusField(id)) jumpTo(id);
  }

  // Llegó con #campo-… (desde el publicador): foco directo en ese campo.
  useEffect(() => {
    const id = decodeURIComponent(location.hash.replace(/^#/, ""));
    if (!id) return;
    const t = setTimeout(() => fixField(id), 150);
    return () => clearTimeout(t);
    // Solo al llegar: después el hash no cambia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Ubicación ─────────────────────────────────────────────────────── */

  function applyMapsLink(text: string) {
    setMapsLink(text);
    if (!text.trim()) return setMapsMsg(null);
    const found = parseCoordinates(text);
    if (found) {
      setForm((f) => ({ ...f, lat: String(found.lat), lng: String(found.lng) }));
      setMapsMsg({ kind: "ok", text: "Listo: tomamos las coordenadas del link." });
    } else if (isShortMapsLink(text)) {
      setMapsMsg({
        kind: "error",
        text: "Los links cortos (maps.app.goo.gl) no traen coordenadas. Abrilo en el navegador y copiá la dirección larga de la barra.",
      });
    } else {
      setMapsMsg({ kind: "error", text: "No encontramos coordenadas en ese texto." });
    }
  }

  /* ── Guardar ───────────────────────────────────────────────────────── */

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = "El título es obligatorio";
    if (!form.price.trim()) e.price = "El precio es obligatorio";
    else if (Number.isNaN(Number(form.price))) e.price = "El precio debe ser un número";
    if (!form.street.trim()) e.street = "La dirección es obligatoria";
    if ((form.lat.trim() || form.lng.trim()) && !coords)
      e.coords = "Revisá las coordenadas: latitud entre -90 y 90, longitud entre -180 y 180";
    if (form.authType && !form.authExpires) e.authExpires = "Poné hasta cuándo vale la autorización";
    setErrors(e);
    const firstBad = Object.keys(e)[0];
    if (firstBad) {
      const section: Record<string, SectionId> = {
        title: "informacion",
        price: "precios",
        street: "ubicacion",
        coords: "ubicacion",
        authExpires: "propietario",
      };
      jumpTo(section[firstBad] ?? "informacion");
    }
    return !firstBad;
  }

  /** "save" = comportamiento de siempre; "publish" = después sigue al Multipublicador. */
  function handleSave(mode: "save" | "publish") {
    if (!validate()) {
      setToast({ kind: "error", text: "Revisá los campos marcados e intentá nuevamente." });
      return;
    }
    const input = toInput(form);

    if (editing) {
      savePropertyEdit(editing.id, input);
      clearDraft(key);
      initialSnapshot.current = snapshot;
      setSavedAt(null);
      if (mode === "publish") {
        setToast({ kind: "ok", text: "Cambios guardados. Ahora elegí dónde publicarla." });
        setTimeout(() => navigate(`/publicador/${editing.id}`), 900);
      } else if (backToPublisher) {
        setToast({ kind: "ok", text: "Cambios guardados. Volvemos al multipublicador." });
        setTimeout(() => navigate(`/publicador/${editing.id}`), 900);
      } else {
        setToast({ kind: "ok", text: "Los cambios fueron guardados." });
        setTimeout(() => navigate(`/propiedades/${editing.id}`), 900);
      }
      return;
    }

    const created = addProperty(input);
    clearDraft(key);
    initialSnapshot.current = snapshot;
    setSavedAt(null);
    const count = buyers?.count ?? 0;
    if (mode === "publish") {
      setToast({ kind: "ok", text: "Propiedad guardada. Ahora elegí dónde publicarla." });
      setTimeout(() => navigate(`/publicador/${created.id}`), 900);
    } else if (count > 0) {
      setToast({
        kind: "ok",
        text: `Propiedad agregada. Coincide con ${count} ${count === 1 ? "cliente" : "clientes"}: avisales por WhatsApp.`,
      });
      setTimeout(() => navigate(`/propiedades/${created.id}?compartir=1`), 1100);
    } else {
      setToast({ kind: "ok", text: "La propiedad fue agregada correctamente." });
      setTimeout(() => navigate("/propiedades"), 900);
    }
  }

  /** Cancelar vuelve a la ficha si se estaba editando, o al listado si es alta. */
  const cancelTarget = editing ? `/propiedades/${editing.id}` : "/propiedades";
  const leave = (target: string) => (touched ? setConfirm({ kind: "exit", target }) : navigate(target));

  // Badge con el dato real de la autorización cargada, no un adorno fijo.
  const isExclusive = form.authType === "exclusiva";
  const canToggleStatus = form.status === "disponible" || form.status === "pausada";

  /* ── Render ────────────────────────────────────────────────────────── */

  return (
    <>
      <header className="flex-shrink-0 border-b px-4 md:px-8 py-3 md:py-4" style={{ borderColor: "#E9E5DE", background: "#FAF8F5" }}>
        <div className="flex flex-col xl:flex-row xl:items-center gap-3 xl:gap-6">
          <div className="min-w-0 flex-1">
            <nav aria-label="Migas" className="text-xs mb-1" style={{ color: "#6B7280", fontWeight: 500 }}>
              <button type="button" onClick={() => leave("/propiedades")} className="hover:underline">
                Propiedades
              </button>
              <span aria-hidden="true" style={{ color: "#DDD8CF" }}>
                {" "}
                /{" "}
              </span>
              <span aria-current="page" style={{ color: "#9B21FF", fontWeight: 600 }}>
                {editing ? editing.title : "Nueva propiedad"}
              </span>
            </nav>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-xl md:text-2xl tracking-tight truncate max-w-full" style={{ color: "#1A1A1A", fontWeight: 800 }}>
                {editing ? "Editar propiedad" : "Subir propiedad"}
              </h1>
              {isExclusive && (
                <span className="text-xs px-2.5 py-0.5 rounded-full text-white" style={{ background: "var(--gradient-brand)", fontWeight: 700 }}>
                  Exclusiva
                </span>
              )}
              <span className="text-xs" style={{ color: "#6B7280" }}>
                {savedAt
                  ? `Borrador guardado · ${relativeTime(savedAt).toLowerCase()}`
                  : touched
                    ? "Cambios sin guardar"
                    : editing
                      ? "Sin cambios"
                      : "Se guarda un borrador mientras completás"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canToggleStatus ? (
              <div className="pr-1">
                <Switch
                  checked={form.status === "disponible"}
                  onChange={(v) => set("status", v ? "disponible" : "pausada")}
                  label={form.status === "disponible" ? "Disponible" : "Pausada"}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => jumpTo("informacion")}
                className="text-xs px-3 min-h-11 rounded-xl border"
                style={{ borderColor: "#E9E5DE", color: "#6B7280", fontWeight: 600, background: "white" }}
              >
                Estado: {PROPERTY_STATUS_LABEL[form.status]}
              </button>
            )}
            <VozPropiedadEntry isNew={!editing} setForm={setForm} />
            <HeaderButton
              variant="ghost"
              onClick={() =>
                touched || draftOffer || savedAt ? setConfirm({ kind: "discard", target: cancelTarget }) : navigate(cancelTarget)
              }
            >
              Descartar
            </HeaderButton>
            <HeaderButton variant="outline" onClick={saveDraftNow}>
              Guardar borrador
            </HeaderButton>
            <HeaderButton variant="outline" onClick={() => handleSave("save")}>
              {publishAfter ? "Solo guardar" : editing ? "Guardar cambios" : "Guardar"}
            </HeaderButton>
            <HeaderButton variant="primary" onClick={() => handleSave("publish")}>
              Guardar y publicar en canales →
            </HeaderButton>
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {/* Subnav */}
        <nav
          aria-label="Secciones del formulario"
          className="sticky top-0 z-10 border-b px-4 md:px-8"
          style={{ background: "rgba(250, 248, 245,0.96)", borderColor: "#E9E5DE", backdropFilter: "blur(6px)" }}
        >
          <ol className="flex gap-1 overflow-x-auto py-2">
            {SECTIONS.map((s, i) => {
              const isActive = active === s.id;
              return (
                <li key={s.id} className="flex-shrink-0">
                  <a
                    href={`#${s.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      jumpTo(s.id);
                    }}
                    aria-current={isActive ? "location" : undefined}
                    className="flex items-center gap-1.5 px-3 min-h-11 rounded-xl text-sm whitespace-nowrap transition-all hover:bg-violet-50"
                    style={
                      isActive
                        ? { background: "var(--gradient-nav-active)", color: "#9B21FF", fontWeight: 700 }
                        : { color: "#6B7280", fontWeight: 500 }
                    }
                  >
                    {done[s.id] ? (
                      <span className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background: "#16A34A" }} aria-hidden="true">
                        <CheckIcon size={9} color="white" />
                      </span>
                    ) : (
                      <span className="text-xs" aria-hidden="true">
                        {i + 1}.
                      </span>
                    )}
                    {s.label}
                    {done[s.id] && <span className="sr-only"> (completa)</span>}
                  </a>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="px-4 md:px-8 pb-16">
          {publishAfter && (
            <ol
              aria-label="Pasos para publicar"
              className="mt-6 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 rounded-2xl border px-4 py-3 text-sm"
              style={{ background: "#F7F0FF", borderColor: "#E9E5DE" }}
            >
              <li aria-current="step" className="flex items-center gap-2" style={{ color: "#1A1A1A", fontWeight: 700 }}>
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs text-white" style={{ background: "#9B21FF" }}>
                  1
                </span>
                Paso 1 de 2 · Cargá la propiedad
              </li>
              <li className="flex items-center gap-2" style={{ color: "#6B7280", fontWeight: 600 }}>
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs border" style={{ borderColor: "#D4AAFF", color: "#6B7280" }}>
                  2
                </span>
                Paso 2 · Elegí dónde publicar
              </li>
            </ol>
          )}

          {draftOffer && (
            <div
              role="region"
              aria-label="Borrador sin guardar"
              className="mt-6 rounded-2xl border px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3"
              style={{ background: "#FFFBEB", borderColor: "#FDE68A" }}
            >
              <p className="text-sm flex-1" style={{ color: "#78350F" }}>
                <strong>Tenés un borrador sin guardar</strong> ({relativeTime(draftOffer.savedAt).toLowerCase()})
                {draftOffer.form.title.trim() ? `: «${draftOffer.form.title.trim()}»` : ""}. ¿Lo recuperamos?
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={dropDraftOffer} className="px-4 min-h-11 rounded-xl text-sm hover:bg-amber-100" style={{ color: "#92400E", fontWeight: 600 }}>
                  Descartarlo
                </button>
                <button
                  type="button"
                  onClick={recoverDraft}
                  className="px-4 min-h-11 rounded-xl text-sm text-white"
                  style={{ background: "var(--gradient-brand)", fontWeight: 600 }}
                >
                  Recuperar borrador
                </button>
              </div>
            </div>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-12 items-start">
            <div className="space-y-6 min-w-0 lg:col-span-8">
              {/* 1 · Galería */}
              <FormSection id="galeria" number={1} title="Galería" subtitle="La primera foto es la portada en todos los canales." done={done.galeria}>
                <PhotoGallery
                  selectId={fid("photos")}
                  photos={form.photos}
                  onChange={(next) => setForm((f) => ({ ...f, photos: typeof next === "function" ? next(f.photos) : next }))}
                  onError={(text) => setToast({ kind: "error", title: "Revisá las fotos", text })}
                />
              </FormSection>

              {/* 2 · Información comercial */}
              <FormSection id="informacion" number={2} title="Información comercial" done={done.informacion}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Tipo de propiedad">
                    <select id={fid("type")} value={form.type} onChange={(e) => set("type", e.target.value as PropertyType)} className={selectClass}>
                      {PROP_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {PROPERTY_TYPE_LABEL[t]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Subtipo (opcional)">
                    <input
                      value={form.subtype}
                      onChange={(e) => set("subtype", e.target.value)}
                      list="pm-subtypes"
                      placeholder={SUBTYPES[form.type][0]}
                      className={inputClass(false)}
                    />
                    <datalist id="pm-subtypes">
                      {SUBTYPES[form.type].map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </Field>
                </div>

                <div role="radiogroup" aria-labelledby="spp-operation-label">
                  <span id="spp-operation-label" className="block text-xs mb-1.5" style={{ color: "#6B7280", fontWeight: 600 }}>
                    Operación
                  </span>
                  <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: "#F7F0FF" }}>
                    {OPERATIONS.map((op) => (
                      <button
                        key={op.value}
                        type="button"
                        role="radio"
                        aria-checked={form.operation === op.value}
                        onClick={() => set("operation", op.value)}
                        className="flex-1 px-3 min-h-11 rounded-lg text-sm transition-all"
                        style={
                          form.operation === op.value
                            ? { background: "var(--gradient-brand)", color: "white", fontWeight: 600, boxShadow: "0 2px 8px rgba(168, 85, 255,0.25)" }
                            : { color: "#6B7280", fontWeight: 500 }
                        }
                      >
                        {op.label}
                      </button>
                    ))}
                  </div>
                </div>

                <Field
                  label="Título"
                  error={errors.title}
                  hint={
                    <CounterHint ok={titleLen >= TITLE_MIN && titleLen <= TITLE_MAX}>
                      {titleLen}/{TITLE_MAX} ·{" "}
                      {titleLen < TITLE_MIN
                        ? `faltan ${TITLE_MIN - titleLen} para el mínimo de ${TITLE_MIN}`
                        : titleLen > TITLE_MAX
                          ? `sobran ${titleLen - TITLE_MAX} sobre el máximo de ${TITLE_MAX}`
                          : "dentro de lo recomendado"}
                    </CounterHint>
                  }
                >
                  <input
                    id={fid("title")}
                    value={form.title}
                    onChange={(e) => set("title", e.target.value)}
                    placeholder="Casa moderna con jardín en City Bell"
                    className={inputClass(!!errors.title)}
                  />
                </Field>

                <Field
                  label="Descripción"
                  hint={
                    <CounterHint ok={descLen >= DESCRIPTION_MIN}>
                      {descLen} caracteres ·{" "}
                      {descLen < DESCRIPTION_MIN
                        ? `faltan ${DESCRIPTION_MIN - descLen} para el mínimo de ${DESCRIPTION_MIN}`
                        : "dentro de lo recomendado"}
                    </CounterHint>
                  }
                >
                  <textarea
                    id={fid("description")}
                    value={form.description}
                    onChange={(e) => set("description", e.target.value)}
                    rows={6}
                    placeholder="Describí ambientes, luz, estado, entorno y lo que la hace distinta…"
                    className={`${inputClass(false)} resize-y`}
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Estado de la propiedad">
                    <select value={form.status} onChange={(e) => set("status", e.target.value as PropertyStatus)} className={selectClass}>
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {PROPERTY_STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Agente responsable">
                    <select value={form.agentId} onChange={(e) => set("agentId", e.target.value)} className={selectClass}>
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </FormSection>

              {/* 3 · Precios */}
              <FormSection id="precios" number={3} title="Precios" done={done.precios}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <MoneyField
                    id={fid("price")}
                    currencyId={fid("currency")}
                    label={form.operation === "venta" ? "Precio de venta" : "Precio mensual"}
                    value={form.price}
                    onValue={(v) => set("price", v)}
                    currency={form.currency}
                    onCurrency={(c) => set("currency", c)}
                    placeholder="185000"
                    error={errors.price}
                    hint={
                      form.currency === "ARS" ? (
                        <span style={{ color: "#B45309", fontWeight: 600 }}>Solo los precios en USD se publican en la app PropMatch.</span>
                      ) : undefined
                    }
                  />
                  <MoneyField
                    id={fid("expenses")}
                    label="Expensas"
                    value={form.expenses}
                    onValue={(v) => set("expenses", v)}
                    currency={form.expensesCurrency}
                    onCurrency={(c) => set("expensesCurrency", c)}
                    placeholder="45000"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <NumberField label="Impuestos" value={form.taxes} onChange={(v) => set("taxes", v)} placeholder="12000" />
                  <Field label="Comisión (%)">
                    <input
                      value={form.commission}
                      onChange={(e) => set("commission", e.target.value.replace(/[^\d.]/g, ""))}
                      inputMode="decimal"
                      className={inputClass(false)}
                    />
                  </Field>
                </div>
                <div className="flex flex-wrap gap-x-8 gap-y-1">
                  <Switch checked={form.creditEligible} onChange={(v) => set("creditEligible", v)} label="Apta crédito" />
                  <Switch checked={form.acceptsSwap} onChange={(v) => set("acceptsSwap", v)} label="Acepta permuta" />
                </div>

                <div className="rounded-xl p-4 space-y-3" style={{ background: "#FAF8F5", border: "1px dashed #D4AAFF" }}>
                  <p className="text-xs uppercase" style={{ color: "#7C0BD8", fontWeight: 700, letterSpacing: "0.08em" }}>
                    Confidencial · solo para el equipo
                  </p>
                  <MoneyField
                    label="Precio mínimo de reserva"
                    value={form.reservePrice}
                    onValue={(v) => set("reservePrice", v)}
                    currency={form.reserveCurrency}
                    onCurrency={(c) => set("reserveCurrency", c)}
                    placeholder="Lo mínimo que acepta el propietario"
                  />
                  <p className="text-xs" style={{ color: "#6B7280" }}>
                    No sale del CRM: no aparece en la ficha que recibe el cliente, ni en los CSV, ni en el informe al propietario, ni en la app.
                  </p>
                </div>
              </FormSection>

              {/* 4 · Superficies y ambientes */}
              <FormSection id="superficies" number={4} title="Superficies y ambientes" done={done.superficies}>
                <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
                  <NumberField id={fid("surface_total")} label="Total (m²)" value={form.surfaceTotal} onChange={(v) => set("surfaceTotal", v)} placeholder="220" />
                  <NumberField id={fid("surface_covered")} label="Cubierta (m²)" value={form.surfaceCovered} onChange={(v) => set("surfaceCovered", v)} placeholder="180" />
                  <NumberField label="Semicubierta (m²)" value={form.surfaceSemicovered} onChange={(v) => set("surfaceSemicovered", v)} placeholder="15" />
                  <NumberField label="Descubierta (m²)" value={form.surfaceUncovered} onChange={(v) => set("surfaceUncovered", v)} placeholder="25" />
                </div>
                <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">
                  <Field label="Ambientes" hint={!form.rooms ? <span style={{ color: "#6B7280" }}>Sugerido: dormitorios + 1</span> : undefined}>
                    <input
                      id={fid("rooms")}
                      value={form.rooms}
                      onChange={(e) => set("rooms", e.target.value.replace(/[^\d]/g, ""))}
                      inputMode="numeric"
                      placeholder={`${form.bedrooms + 1}`}
                      className={inputClass(false)}
                    />
                  </Field>
                  <Stepper id={fid("bedrooms")} label="Dormitorios" value={form.bedrooms} onChange={(v) => set("bedrooms", v)} />
                  <Stepper id={fid("bathrooms")} label="Baños" value={form.bathrooms} onChange={(v) => set("bathrooms", v)} />
                  <Stepper label="Toilettes" value={form.toilettes} onChange={(v) => set("toilettes", v)} />
                  <Stepper id={fid("garages")} label="Cocheras" value={form.garages} onChange={(v) => set("garages", v)} />
                  <NumberField id={fid("age_years")} label="Antigüedad (años)" value={form.age} onChange={(v) => set("age", v)} placeholder="0 = a estrenar" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Disposición">
                    <select id={fid("layout")} value={form.layout} onChange={(e) => set("layout", e.target.value as PropertyLayout | "")} className={selectClass}>
                      <option value="">Sin especificar</option>
                      {LAYOUTS.map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Orientación">
                    <select
                      id={fid("orientation")}
                      value={form.orientation}
                      onChange={(e) => set("orientation", e.target.value as PropertyOrientation | "")}
                      className={selectClass}
                    >
                      <option value="">Sin especificar</option>
                      {ORIENTATIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </FormSection>

              {/* 5 · Ubicación */}
              <FormSection id="ubicacion" number={5} title="Ubicación" done={done.ubicacion}>
                <div className="grid gap-4 grid-cols-2 sm:grid-cols-6">
                  <div className="col-span-2 sm:col-span-3">
                    <Field label="Dirección" error={errors.street}>
                      <input id={fid("address")} value={form.street} onChange={(e) => set("street", e.target.value)} placeholder="Calle 13" className={inputClass(!!errors.street)} />
                    </Field>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Field label="Número">
                      <input value={form.streetNumber} onChange={(e) => set("streetNumber", e.target.value)} placeholder="450" className={inputClass(false)} />
                    </Field>
                  </div>
                  <Field label="Piso">
                    <input value={form.floor} onChange={(e) => set("floor", e.target.value)} placeholder="PB" className={inputClass(false)} />
                  </Field>
                  <Field label="Unidad">
                    <input value={form.unit} onChange={(e) => set("unit", e.target.value)} placeholder="B" className={inputClass(false)} />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Zona">
                    <select value={form.locality} onChange={(e) => set("locality", e.target.value)} className={selectClass}>
                      {zoneOptions.map((z) => (
                        <option key={z} value={z}>
                          {z}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Provincia">
                    <input value={form.province} onChange={(e) => set("province", e.target.value)} className={inputClass(false)} />
                  </Field>
                </div>

                <div className="rounded-xl p-4 space-y-3" style={{ background: "#FAF8F5", border: "1px solid #E9E5DE" }}>
                  <Field label="Pegá un link de Google Maps (opcional)">
                    <input
                      id={fid("coords")}
                      value={mapsLink}
                      onChange={(e) => applyMapsLink(e.target.value)}
                      placeholder="https://www.google.com/maps/place/…/@-34.87,-58.04,17z"
                      className={inputClass(false)}
                    />
                  </Field>
                  {mapsMsg && (
                    <p className="text-xs" role="status" style={{ color: mapsMsg.kind === "ok" ? "#15803D" : "#B45309", fontWeight: 600 }}>
                      {mapsMsg.text}
                    </p>
                  )}
                  <div className="grid gap-4 grid-cols-2">
                    <Field label="Latitud" error={errors.coords}>
                      <input
                        value={form.lat}
                        onChange={(e) => set("lat", e.target.value.replace(/[^\d.-]/g, ""))}
                        inputMode="decimal"
                        placeholder="-34.8712"
                        className={inputClass(!!errors.coords)}
                      />
                    </Field>
                    <Field label="Longitud">
                      <input
                        value={form.lng}
                        onChange={(e) => set("lng", e.target.value.replace(/[^\d.-]/g, ""))}
                        inputMode="decimal"
                        placeholder="-58.0456"
                        className={inputClass(!!errors.coords)}
                      />
                    </Field>
                  </div>
                  <p className="text-xs" style={{ color: "#6B7280" }}>
                    Quedan guardadas en el CRM. Todavía no se mandan a la app.
                    {coords && (
                      <>
                        {" "}
                        <a
                          href={`https://www.google.com/maps?q=${coords.lat},${coords.lng}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "#9B21FF", fontWeight: 600 }}
                        >
                          Ver en Google Maps ↗
                        </a>
                      </>
                    )}
                  </p>
                </div>
              </FormSection>

              {/* 6 · Amenities */}
              <FormSection id="amenities" number={6} title="Amenities" subtitle="Se comparan con lo que busca cada contacto." done={done.amenities}>
                <div id={fid("features")} role="group" aria-label="Amenities" className="flex flex-wrap gap-2">
                  {featureOptions.map((f) => (
                    <Chip
                      key={f}
                      label={f}
                      active={form.features.includes(f)}
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          features: prev.features.includes(f) ? prev.features.filter((x) => x !== f) : [...prev.features, f],
                        }))
                      }
                    />
                  ))}
                </div>
              </FormSection>

              {/* 7 · Propietario y autorización */}
              <FormSection
                id="propietario"
                number={7}
                title="Propietario y autorización"
                subtitle="Nunca se muestra en la ficha que recibe el cliente."
                done={done.propietario}
              >
                {newOwner ? (
                  <div className="rounded-xl p-4 space-y-3" style={{ background: "#FAF8F5", border: "1px solid #E9E5DE" }}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Nombre del propietario">
                        <input
                          autoFocus
                          value={newOwner.name}
                          onChange={(e) => setNewOwner({ ...newOwner, name: e.target.value })}
                          placeholder="Graciela Benítez"
                          className={inputClass(false)}
                        />
                      </Field>
                      <Field label="Teléfono">
                        <input
                          value={newOwner.phone}
                          onChange={(e) => setNewOwner({ ...newOwner, phone: e.target.value })}
                          placeholder="+54 221 520 1144"
                          className={inputClass(false)}
                        />
                      </Field>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setNewOwner(null)} className="px-4 min-h-11 rounded-xl text-xs" style={{ color: "#6B7280", fontWeight: 600 }}>
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={!newOwner.name.trim()}
                        onClick={() => {
                          const c = addContact({
                            full_name: newOwner.name.trim(),
                            phone: newOwner.phone.trim() || null,
                            email: null,
                            kind: "propietario",
                            status: "activo",
                            profile_type: null,
                            notes: null,
                            owner_id: form.agentId,
                            requirement: null,
                          });
                          set("ownerId", c.id);
                          setNewOwner(null);
                        }}
                        className="px-4 min-h-11 rounded-xl text-xs text-white disabled:opacity-50"
                        style={{ background: "var(--gradient-brand)", fontWeight: 600 }}
                      >
                        Agregar propietario
                      </button>
                    </div>
                  </div>
                ) : (
                  <Field label="Propietario">
                    <div className="flex gap-2">
                      <select value={form.ownerId} onChange={(e) => set("ownerId", e.target.value)} className={selectClass}>
                        <option value="">Sin propietario cargado</option>
                        <optgroup label="Propietarios">
                          {contacts
                            .filter((c) => c.kind === "propietario")
                            .sort((a, b) => a.full_name.localeCompare(b.full_name))
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.full_name}
                              </option>
                            ))}
                        </optgroup>
                        <optgroup label="Otros contactos">
                          {contacts
                            .filter((c) => c.kind !== "propietario")
                            .sort((a, b) => a.full_name.localeCompare(b.full_name))
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.full_name}
                              </option>
                            ))}
                        </optgroup>
                      </select>
                      <button
                        type="button"
                        onClick={() => setNewOwner({ name: "", phone: "" })}
                        className="px-3.5 min-h-11 rounded-xl text-xs border whitespace-nowrap transition-all hover:bg-violet-50"
                        style={{ borderColor: "#E9E5DE", color: "#9B21FF", fontWeight: 600, background: "white" }}
                      >
                        + Nuevo
                      </button>
                    </div>
                  </Field>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Autorización">
                    <select
                      id={fid("authorization")}
                      value={form.authType}
                      onChange={(e) => {
                        const value = e.target.value as AuthorizationType | "";
                        // Lo más común: 90 días. Se propone solo si no había fecha.
                        setForm((f) => ({
                          ...f,
                          authType: value,
                          authExpires: value && !f.authExpires ? dateInputFromNow(90) : f.authExpires,
                        }));
                      }}
                      className={selectClass}
                    >
                      <option value="">Sin autorización firmada</option>
                      {(Object.keys(AUTHORIZATION_LABEL) as AuthorizationType[]).map((t) => (
                        <option key={t} value={t}>
                          {AUTHORIZATION_LABEL[t]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Vence el" error={errors.authExpires}>
                    <input
                      type="date"
                      value={form.authType ? form.authExpires : ""}
                      disabled={!form.authType}
                      onChange={(e) => set("authExpires", e.target.value)}
                      className={inputClass(!!errors.authExpires)}
                    />
                  </Field>
                </div>
                {form.authType &&
                  form.authExpires &&
                  (() => {
                    const st = authorizationState(form.authType, form.authExpires);
                    const style = AUTHORIZATION_TONE_STYLE[st.tone];
                    return (
                      <p
                        className="text-xs px-3 py-2 rounded-lg inline-block"
                        style={{ background: style.bg, color: style.text, border: `1px solid ${style.border}`, fontWeight: 600 }}
                      >
                        {st.label}
                      </p>
                    );
                  })()}
              </FormSection>
            </div>

            {/* Columna derecha (en celular queda abajo) */}
            <aside className="space-y-6 lg:col-span-4 lg:sticky lg:top-20" aria-label="Estado de la ficha">
              <QualityPanel checks={checks} draft={draftProperty} photoCount={form.photos.length} onFix={fixField} />
              <ChannelsPanel
                draft={draftProperty}
                photos={form.photos}
                onFix={fixField}
                onNavigate={leave}
                saved={editing}
                currency={form.currency}
                status={form.status}
                photoCount={form.photos.length}
                appLinked={isLinkedAgencyId(agency.id)}
              />
              <BuyersPanel result={buyers} onSeeAll={() => leave("/matches")} />
              <Card padded>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => handleSave("publish")}
                    className="w-full min-h-11 rounded-xl text-sm text-white transition-all hover:opacity-90 active:scale-[0.98]"
                    style={{ background: "var(--gradient-brand)", fontWeight: 700, boxShadow: "var(--shadow-cta)" }}
                  >
                    Guardar y publicar en canales →
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSave("save")}
                    className="w-full min-h-11 rounded-xl text-sm border transition-all hover:bg-violet-50"
                    style={{ borderColor: "#DDD8CF", color: "#9B21FF", fontWeight: 600, background: "white" }}
                  >
                    {publishAfter ? "Solo guardar" : editing ? "Guardar cambios" : "Guardar"}
                  </button>
                  <button
                    type="button"
                    onClick={saveDraftNow}
                    className="w-full min-h-11 rounded-xl text-sm transition-all hover:bg-violet-50"
                    style={{ color: "#6B7280", fontWeight: 600 }}
                  >
                    Guardar borrador
                  </button>
                </div>
                <p className="text-xs mt-3" style={{ color: "#6B7280" }}>
                  El borrador queda solo en este navegador. Ambientes: {roomsValue(form)} · Fotos: {form.photos.length}
                </p>
              </Card>
            </aside>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="pm-toast fixed bottom-24 lg:bottom-6 left-4 right-4 sm:left-auto sm:right-6 z-50 rounded-2xl px-5 py-4 flex items-start gap-3 sm:max-w-sm"
          style={{ background: "white", border: `1px solid ${toast.kind === "ok" ? "#BBF7D0" : "#FECDD3"}`, boxShadow: "var(--shadow-pop)" }}
          role="status"
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: toast.kind === "ok" ? "#F0FDF4" : "#FFF1F2" }}>
            {toast.kind === "ok" ? <CheckIcon size={14} color="#16A34A" /> : <span style={{ color: "#E11D48", fontWeight: 700 }}>!</span>}
          </div>
          <div className="flex-1">
            <p className="text-sm" style={{ color: "#1A1A1A", fontWeight: 700 }}>
              {toast.title ?? (toast.kind === "ok" ? (editing ? "Cambios guardados" : "Propiedad guardada") : "No pudimos guardar la propiedad")}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
              {toast.text}
            </p>
          </div>
          <button onClick={() => setToast(null)} aria-label="Cerrar aviso" className="w-8 h-8 -mr-2 -mt-1 rounded-lg" style={{ color: "#6B7280", lineHeight: 1 }}>
            ×
          </button>
        </div>
      )}

      {/* Confirmaciones */}
      {confirm && (
        <div
          className="pm-backdrop fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: "rgba(8, 11, 31,0.35)" }}
          onClick={() => setConfirm(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="spp-confirm-title"
            className="pm-modal rounded-2xl p-6 max-w-sm w-full"
            style={{ background: "white", boxShadow: "var(--shadow-pop)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <p id="spp-confirm-title" className="text-lg" style={{ color: "#1A1A1A", fontWeight: 800 }}>
              {confirm.kind === "discard" ? "¿Descartar los cambios?" : "¿Salir sin guardar?"}
            </p>
            <p className="text-sm mt-1.5" style={{ color: "#6B7280" }}>
              {confirm.kind === "discard"
                ? "Se borran los cambios y el borrador de este navegador. La propiedad guardada no se toca."
                : "Los cambios quedan como borrador en este navegador: la próxima vez que abras el formulario te ofrecemos recuperarlos."}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 mt-5">
              <button
                autoFocus
                onClick={() => setConfirm(null)}
                className="flex-1 min-h-11 rounded-xl text-sm border transition-all hover:border-violet-300"
                style={{ borderColor: "#E9E5DE", color: "#9B21FF", fontWeight: 600 }}
              >
                Seguir editando
              </button>
              <button
                onClick={() => {
                  if (confirm.kind === "discard") clearDraft(key);
                  else saveDraft(key, form);
                  navigate(confirm.target);
                }}
                className="flex-1 min-h-11 rounded-xl text-sm text-white transition-all hover:opacity-90"
                style={{ background: confirm.kind === "discard" ? "#E11D48" : "var(--gradient-brand)", fontWeight: 600 }}
              >
                {confirm.kind === "discard" ? "Descartar" : "Salir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Piezas locales ──────────────────────────────────────────────────────── */

function HeaderButton({
  variant,
  onClick,
  children,
}: {
  variant: "primary" | "outline" | "ghost";
  onClick: () => void;
  children: React.ReactNode;
}) {
  const style =
    variant === "primary"
      ? { background: "var(--gradient-brand)", color: "white", fontWeight: 700, boxShadow: "var(--shadow-cta)" }
      : variant === "outline"
        ? { background: "white", color: "#9B21FF", fontWeight: 600, border: "1px solid #DDD8CF" }
        : { color: "#6B7280", fontWeight: 600 };
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-4 min-h-11 rounded-xl text-sm whitespace-nowrap transition-all hover:opacity-90 hover:bg-violet-50 active:scale-[0.98]"
      style={style}
    >
      {children}
    </button>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Field label={label}>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
        inputMode="numeric"
        placeholder={placeholder}
        className={inputClass(false)}
      />
    </Field>
  );
}
