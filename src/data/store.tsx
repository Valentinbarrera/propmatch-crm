import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type {
  Activity,
  ActivityType,
  Agency,
  AppOffer,
  CalendarEvent,
  ClientProfile,
  Contact,
  ContactKind,
  ContactRequirement,
  ContactStatus,
  CurrencyCode,
  Deal,
  DealEventType,
  EventType,
  Match,
  OperationType,
  Opportunity,
  OpportunityStage,
  Profile,
  Property,
  PropertyType,
  Task,
  VisitChecklist,
  VisitFeedback,
  VisitStatus,
  PropertyCrmDetails,
} from "@/types/db";
import { buildMatches } from "@/lib/matching";
import { initials } from "@/lib/format";
import { isDeadPhotoUrl } from "@/lib/images";
import { isDemoActive, setDemoFlag } from "@/lib/demo";
import { applyDealPatch, dealRoomDefaults, migrateDeals, nextDealNumber } from "@/lib/dealRoom";
import { supabase } from "@/lib/supabase";
import {
  canPublishToApp,
  fetchAgencyProperties,
  pushStatusToApp,
  roomsOf,
  uploadPropertyPhotos,
  upsertAppProperty,
  TYPE_FROM_APP,
  OPERATION_FROM_APP,
  STATUS_FROM_APP,
  type AppPropertyContext,
  type AppPropertyRow,
} from "@/lib/propertySync";
import {
  fetchAgencyMatches,
  fetchAgencyOffers,
  fetchAgencySwipes,
  fetchAgencyVisits,
  fetchUsersByIds,
  respondToOffer,
  respondToSwipe,
} from "@/lib/leadSync";
import { CURRENT_USER_ID, seedAgency } from "./seed";
import { adoptSamples, markLegacySamples, restoreSamples, sampleSlices, SAMPLES_VERSION, stripSamples } from "./samples";
import { isSample } from "@/lib/samples";
import { photosBase, photosForApp, watermarkNotice } from "@/lib/appWatermark";
import { originalPhotos } from "../../shared/appWatermark";
import { RemoteSync, applyRemote, reconcileInitial, swapPhotoUrls, type RemoteStatus } from "./remote";

/**
 * Store del frontend.
 *
 * Todo el estado del CRM vive acá. Con una cuenta real se guarda en la base
 * propia del CRM (ver ./remote.ts y docs/datos-en-la-base.md) y localStorage
 * queda como copia de trabajo (sirve sin conexión). En la demo, solo
 * localStorage. Las pantallas piden `useStore()` y no saben de dónde salen
 * los datos.
 */

const STORAGE_KEY = "propmatch.store.v1";
/** Datos de la demo (cuenta `u-1`, sin Supabase), separados de los reales. */
const DEMO_STORAGE_KEY = "propmatch.store.demo.v1";
/** Sin sesión (pantalla de login): un espacio aparte, que no es de ninguna cuenta. */
const ANON_STORAGE_KEY = "propmatch.store.v1:anon";
/** Quién ya adoptó los datos guardados antes de separar por cuenta (STORAGE_KEY). */
const LEGACY_CLAIM_KEY = "propmatch.store.v1:claimedBy";
/** Cada cuenta real guarda sus datos aparte: dos cuentas en el mismo navegador no se mezclan. */
const userStorageKey = (userId: string) => `${STORAGE_KEY}:${userId}`;

/**
 * Datos de una cuenta. La primera cuenta que entra después de separar por
 * cuenta adopta lo que había guardado antes (STORAGE_KEY); las demás arrancan
 * con su espacio propio.
 */
function loadUserData(userId: string): StoreData {
  const key = userStorageKey(userId);
  try {
    if (localStorage.getItem(key) === null) {
      const legacy = localStorage.getItem(STORAGE_KEY);
      const claimedBy = localStorage.getItem(LEGACY_CLAIM_KEY);
      if (legacy !== null && !claimedBy) {
        localStorage.setItem(key, legacy);
        localStorage.setItem(LEGACY_CLAIM_KEY, userId);
      }
    }
  } catch {
    // Storage bloqueado: se trabaja en memoria.
  }
  return loadData(key);
}
const DEMO_USER_ID = "u-1";

/** Campos de Property que también viven en la app: si cambian, se re-sincroniza. */
const APP_SYNCED_FIELDS = new Set([
  "title", "description", "type", "operation", "status", "street", "street_number",
  "locality", "zone", "price", "currency", "rooms", "bedrooms", "features",
]);
const SESSION_KEY = "propmatch.session.v1";

export interface StoreData {
  /** Editables desde Configuración, por eso viven con el resto de los datos. */
  agency: Agency;
  profiles: Profile[];
  contacts: Contact[];
  requirements: ContactRequirement[];
  properties: Property[];
  photos: Record<string, string[]>;
  opportunities: Opportunity[];
  activities: Activity[];
  events: CalendarEvent[];
  tasks: Task[];
  deals: Deal[];
  /** Ids de matches ya revisados. Las ids son deterministas (requerimiento + propiedad). */
  reviewedMatches: string[];
  /** Seguimientos pospuestos: contacto -> hasta cuándo (ISO). */
  followUpSnoozes: Record<string, string>;
  /** uuids de matches/visitas/ofertas reales (de la app) ya convertidos en contacto/oportunidad/actividad. Evita duplicar en cada sincronización. */
  syncedAppEventIds: string[];
  /** Ofertas reales de la app — fuente de verdad para el Dashboard, la pantalla de Ofertas y la ficha de propiedad. */
  appOffers: AppOffer[];
  /** Feedback post-visita de visitas reales de la app (uuid de `visits`). Solo local: la app no se entera. */
  appVisitFeedback: Record<string, VisitFeedback>;
  /** Checklist de coordinación de visitas reales de la app (uuid de `visits`). Solo local. */
  appVisitChecklist: Record<string, VisitChecklist>;
  /**
   * El usuario eligió "Usar mis datos reales": los ejemplos no se vuelven a
   * agregar al abrir sesión. Sin definir = ejemplos visibles (ver data/samples.ts).
   */
  samplesHidden?: boolean;
  /** Versión de la semilla ya ofrecida a este navegador (`SAMPLES_VERSION`). */
  samplesVersion?: number;
}

function seedData(): StoreData {
  // Toda la semilla va marcada como ejemplo (`is_sample`): nunca sale del navegador.
  const samples = sampleSlices();
  return {
    agency: seedAgency,
    ...samples,
    reviewedMatches: [],
    followUpSnoozes: {},
    syncedAppEventIds: [],
    appVisitFeedback: {},
    appVisitChecklist: {},
    samplesHidden: false,
    samplesVersion: SAMPLES_VERSION,
  };
}

function loadData(key: string = STORAGE_KEY): StoreData {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return seedData();
    const parsed = JSON.parse(raw) as Partial<StoreData>;
    // Se completa con la semilla por si el guardado es de una versión anterior.
    // markLegacySamples: lo de la semilla guardado antes de existir `is_sample` queda marcado.
    const merged = markLegacySamples({ ...seedData(), ...parsed });
    // La versión de los ejemplos sale SOLO de lo guardado: sin ella, adoptSamples
    // sabe que es un guardado viejo (purgado o con la semilla anterior) y lo migra.
    merged.samplesVersion = parsed.samplesVersion;
    merged.samplesHidden = parsed.samplesHidden;
    // Deal room: pasos/documentos de boolean a {done, at, by, note}, número PM-0001 e historial.
    merged.deals = migrateDeals(merged.deals ?? [], (id) => merged.opportunities.find((o) => o.id === id)?.owner_id ?? null);
    merged.syncedAppEventIds = merged.syncedAppEventIds ?? [];
    merged.appOffers = merged.appOffers ?? [];
    // Campos que se sumaron después: los registros guardados no los tienen.
    merged.properties = merged.properties.map((p) => ({
      ...p,
      owner_contact_id: p.owner_contact_id ?? null,
      authorization_type: p.authorization_type ?? null,
      authorization_expires_at: p.authorization_expires_at ?? null,
    }));
    // Fotos guardadas como `blob:` antes de pasar a data URL: ya no existen.
    merged.photos = Object.fromEntries(
      Object.entries(merged.photos).map(([id, urls]) => [id, urls.filter((u) => !isDeadPhotoUrl(u))]),
    );
    return merged;
  } catch {
    return seedData();
  }
}

/** Qué busca un contacto. Es la mitad de la ecuación del matching. */
export interface RequirementInput {
  label: string | null;
  operation: OperationType;
  property_types: PropertyType[];
  zones: string[];
  budget_min: number | null;
  budget_max: number | null;
  currency: CurrencyCode;
  bedrooms_min: number | null;
  bathrooms_min: number | null;
  surface_min: number | null;
  surface_max: number | null;
  features: string[];
}

export interface NewContactInput {
  full_name: string;
  email: string | null;
  phone: string | null;
  kind: ContactKind;
  status: ContactStatus;
  profile_type: ClientProfile | null;
  notes: string | null;
  owner_id: string | null;
  /** Opcional: sin esto el contacto existe pero no genera matches. */
  requirement: RequirementInput | null;
}

export interface NewPropertyInput extends PropertyCrmDetails {
  title: string;
  description: string | null;
  type: Property["type"];
  operation: Property["operation"];
  status: Property["status"];
  street: string | null;
  street_number: string | null;
  locality: string | null;
  province: string | null;
  price: number | null;
  currency: Property["currency"];
  expenses: number | null;
  taxes: number | null;
  commission_pct: number | null;
  surface_total: number | null;
  surface_covered: number | null;
  /**
   * Ambientes. Opcional para no romper el importador: sin definir se deriva
   * de dormitorios + 1 (estar), que era la única regla antes de poder editarlo.
   */
  rooms?: number | null;
  /**
   * Coordenadas del pin. Solo viven en el CRM (ver buildAppPayload). Sin
   * definir = el formulario no las tocó: al editar se conservan las que había.
   */
  lat?: number | null;
  lng?: number | null;
  bedrooms: number;
  bathrooms: number;
  garages: number;
  age_years: number | null;
  features: string[];
  owner_agent_id: string | null;
  owner_contact_id: string | null;
  authorization_type: Property["authorization_type"];
  authorization_expires_at: string | null;
  photos: string[];
}

const CRM_DETAIL_KEYS = [
  "subtype", "toilettes", "surface_semicovered", "surface_uncovered", "layout", "orientation",
  "floor", "unit", "expenses_currency", "credit_eligible", "accepts_swap",
  "reserve_min_price", "reserve_min_currency",
] as const satisfies readonly (keyof PropertyCrmDetails)[];

/**
 * Copia solo los datos "de CRM" que vinieron definidos. Al editar, lo que no
 * vino se conserva tal como estaba en la propiedad.
 */
function pickCrmDetails(input: PropertyCrmDetails): PropertyCrmDetails {
  const out: Record<string, unknown> = {};
  for (const key of CRM_DETAIL_KEYS) if (input[key] !== undefined) out[key] = input[key];
  return out as PropertyCrmDetails;
}

export type GcalPatch =
  | {
      kind: "event";
      id: string;
      patch: Partial<Pick<CalendarEvent, "starts_at" | "ends_at" | "status" | "updated_at" | "google_event_id">>;
    }
  | { kind: "event"; id: string; remove: true }
  | { kind: "task"; id: string; patch: Partial<Pick<Task, "due_date" | "updated_at" | "google_event_id">> };

export interface NewEventInput {
  type: EventType;
  title: string;
  contact_id: string | null;
  property_id: string | null;
  /** ISO. La pantalla arma el día y la hora; el store no interpreta zonas. */
  starts_at: string;
  ends_at: string;
  notes: string | null;
  owner_id: string | null;
  /** Solo visitas. Sin definir = "por_confirmar". */
  status?: VisitStatus;
}

export interface LogActivityInput {
  type: ActivityType;
  title: string;
  detail: string | null;
  contact_id: string | null;
  property_id: string | null;
}

export type AgencyInput = Pick<Agency, "name" | "phone" | "email" | "city" | "province"> &
  Partial<Pick<Agency, "branding" | "doc_templates">>;
export type ProfileInput = Pick<Profile, "full_name" | "email" | "phone">;

export interface NewTaskInput {
  text: string;
  is_priority: boolean;
  due_date: string | null;
  contact_id: string | null;
  owner_id: string | null;
}

export interface NewOpportunityInput {
  contact_id: string;
  property_id: string | null;
  stage: OpportunityStage;
  value: number | null;
  currency: CurrencyCode;
  owner_id: string | null;
}

export type NewDealInput = Omit<Deal, "id" | "agency_id" | "created_at" | "updated_at" | DealRoomKeys> &
  Partial<Pick<Deal, DealRoomKeys>>;
/** Lo que una acción deja en el historial de la operación. */
export type DealEventInput = { type: DealEventType; title: string; detail?: string | null };
/** Campos del deal room que completa el store si la pantalla no los manda. */
type DealRoomKeys = keyof ReturnType<typeof dealRoomDefaults>;

interface StoreValue extends StoreData {
  agency: Agency;
  /** El agente con la sesión abierta. */
  profile: Profile;
  profiles: Profile[];
  /** `null` mientras nadie inició sesión. */
  currentUserId: string | null;
  /** Devuelve el error a mostrar, o `null` si la sesión se abrió. */
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (input: {
    name: string;
    agencyName: string;
    email: string;
    password: string;
  }) => Promise<{ error: string | null; needsEmailConfirmation: boolean }>;
  /** Redirige a Google; devuelve un error amable si no se pudo iniciar. */
  signInWithGoogle: () => Promise<string | null>;
  /** Email de una cuenta creada que aún no tiene inmobiliaria (o `null`). */
  pendingLinkEmail: string | null;
  dismissPendingLink: () => void;
  /** Entra a la demo con datos de ejemplo, sin cuenta ni Supabase. */
  enterDemo: () => void;
  signOut: () => void;
  /** Derivado: se recalcula solo cuando cambian propiedades o requerimientos. */
  matches: Match[];

  // Lecturas auxiliares
  contactById: (id: string | null | undefined) => Contact | undefined;
  propertyById: (id: string | null | undefined) => Property | undefined;
  profileById: (id: string | null | undefined) => Profile | undefined;
  coverPhoto: (propertyId: string) => string | null;

  // Acciones
  addProperty: (input: NewPropertyInput) => Property;
  /** Cambios puntuales (estado, destacada). */
  updateProperty: (id: string, patch: Partial<Property>) => void;
  /** Guarda una propiedad editada desde el formulario completo, fotos incluidas. */
  savePropertyEdit: (id: string, input: NewPropertyInput) => void;
  /**
   * Reemplaza las fotos guardadas por sus URLs públicas ya subidas (mismo orden),
   * sin volver a sincronizar con la app. Lo usa Mercado Libre al publicar una
   * propiedad que no está en la app, para no subir las mismas fotos dos veces.
   */
  replacePropertyPhotos: (id: string, photos: string[]) => void;
  /**
   * uuid de la agencia en la app si la cuenta está vinculada (agency_members);
   * `null` = modo local, no sincroniza. Lo usa «Publicar todas en la app».
   */
  appAgencyId: string | null;
  /**
   * «Publicar todas en la app»: crea (o actualiza) la fila en la app con estas
   * fotos (ya copiadas a property-photos; las `data:` se suben acá). Idempotente:
   * si ya tiene `app_property_id`, actualiza esa fila. Devuelve el error a mostrar.
   */
  /**
   * Crea o actualiza la fila en la app con estas fotos (las originales del CRM).
   * Si está prendido «Poner el logo en las fotos de la app», la app recibe las
   * copias con logo; `watermarkFailures` = fotos que fueron sin logo.
   */
  publishPropertyToApp: (id: string, appPhotos: string[]) => Promise<{ ok: true; watermarkFailures?: number } | { ok: false; error: string }>;
  addContact: (input: NewContactInput) => Contact;
  updateContact: (id: string, patch: Partial<Contact>) => void;
  /** Crea o reemplaza la búsqueda activa de un contacto. */
  saveRequirement: (contactId: string, input: RequirementInput) => void;
  /** Búsqueda activa de un contacto, si tiene. */
  requirementOf: (contactId: string) => ContactRequirement | undefined;
  /** Alta manual, sin pasar por un match. */
  addOpportunity: (input: NewOpportunityInput) => Opportunity;
  moveOpportunity: (id: string, stage: OpportunityStage) => void;
  /** Marca o desmarca una operación como urgente. `null` la desmarca. */
  setOpportunityPriority: (id: string, note: string | null) => void;
  /** Saca la operación del pipeline dejando escrito el motivo. */
  markOpportunityLost: (id: string, reason: string | null) => void;
  /** Vuelve a abrir una operación perdida, en la primera etapa. */
  reopenOpportunity: (id: string) => void;
  createOpportunityFromMatch: (matchId: string) => void;
  addEvent: (input: NewEventInput) => CalendarEvent;
  updateEvent: (id: string, input: NewEventInput) => void;
  removeEvent: (id: string) => void;
  /** Cambios puntuales de un evento (estado, feedback, checklist). */
  patchEvent: (id: string, patch: Partial<CalendarEvent>) => void;
  /**
   * Cambios que vienen de Google Calendar (o el id de Google al sincronizar).
   * No toca `updated_at` salvo que el patch lo traiga: así el próximo
   * «gana el último cambio» compara contra la hora de Google.
   */
  applyGcalPatches: (patches: GcalPatch[]) => void;
  /** Guarda el feedback de una visita real de la app (solo local). */
  saveAppVisitFeedback: (visitId: string, feedback: VisitFeedback) => void;
  /** Tilda un ítem del checklist de una visita real de la app (solo local). */
  patchAppVisitChecklist: (visitId: string, patch: VisitChecklist) => void;
  updateAgency: (input: AgencyInput) => void;
  /** Alta masiva desde un Excel. Devuelve los ids creados, para poder deshacer. */
  importContacts: (inputs: NewContactInput[]) => string[];
  importProperties: (inputs: NewPropertyInput[]) => string[];
  /** Deshace una importación: borra lo creado y todo lo que cuelga de eso. */
  undoImport: (ids: { contacts?: string[]; properties?: string[] }) => void;
  /** `true` mientras se resuelve si ya había una sesión real de Supabase abierta. */
  sessionLoading: boolean;
  /** Saca a un contacto de "para contactar hoy" por unos días. */
  snoozeFollowUp: (contactId: string, days: number) => void;
  /** Deja constancia en el historial (por ejemplo, un WhatsApp enviado). */
  logActivity: (input: LogActivityInput) => void;
  /** Recalcula las iniciales si cambia el nombre. */
  updateProfile: (id: string, input: ProfileInput) => void;
  /** Pone en el perfil propio el email de la cuenta de Supabase (tras confirmar un cambio de email). */
  syncAccountEmail: (email: string) => void;
  addTask: (input: NewTaskInput) => Task;
  toggleTask: (id: string) => void;
  removeTask: (id: string) => void;
  markMatchReviewed: (id: string) => void;
  /** Acepta/rechaza una oferta real de la app (uuid de `offers` en Supabase). Devuelve el error a mostrar, o `null` si salió bien. */
  respondOffer: (appOfferId: string, action: "accept" | "reject") => Promise<string | null>;
  /** Acepta/rechaza un "me interesa" real de la app (actividad con `app_swipe_id`). Devuelve el error a mostrar, o `null` si salió bien. */
  respondSwipe: (activityId: string, action: "accepted" | "rejected") => Promise<string | null>;
  addDeal: (input: NewDealInput) => Deal;
  /** `event` = qué dejar en el historial de la operación (además del cambio de etapa, que se registra solo). */
  updateDeal: (id: string, patch: Partial<Deal>, event?: DealEventInput) => void;
  removeDeal: (id: string) => void;
  reset: () => void;
  /** El último guardado en el navegador falló: lo nuevo no sobrevive a un refresh. */
  persistFailed: boolean;
  /** Estado de la sincronización con la base propia del CRM (ver ./remote.ts). */
  remoteStatus: RemoteStatus;
  /** Sesión de demo (sin cuenta): los ejemplos no se pueden ocultar. */
  isDemo: boolean;
  /** "Usar mis datos reales": quita los datos de ejemplo y guarda la preferencia (`samplesHidden`). */
  hideSamples: () => void;
  /** "Mostrar ejemplos otra vez": vuelve a agregar la semilla sin duplicar. */
  showSamples: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

/** Error de Supabase al publicar en la app → texto para la inmobiliaria. */
function appErrorMessage(err: unknown): string {
  const e = (err ?? {}) as { code?: string; message?: string };
  const msg = e.message ?? "";
  if (e.code === "42501" || /row-level security|permission denied/i.test(msg))
    return "La app no dio permiso (revisá que tu cuenta siga vinculada a la agencia)";
  if (e.code === "23514" || /check constraint/i.test(msg)) return "Faltan datos que exige la app (precio según la operación)";
  if (e.code === "23502" || /null value/i.test(msg)) return "Faltan datos que exige la app";
  if (/fetch|network|Failed to fetch/i.test(msg)) return "Sin conexión con la app. Reintentá en un rato";
  return msg ? `La app rechazó la propiedad: ${msg.slice(0, 160)}` : "La app rechazó la propiedad";
}

/** Ids únicos entre navegadores: varios agentes de la misma inmobiliaria crean registros a la vez. */
const uid = (prefix: string) => {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 14)
      : Math.random().toString(36).slice(2, 9) + Math.random().toString(36).slice(2, 9);
  return `${prefix}-${rnd}`;
};

/** `agency.id` de una cuenta sin inmobiliaria: no existe en Supabase, así que nada lo consulta allá. */
export const UNLINKED_AGENCY_PREFIX = "local-";
export const isLinkedAgencyId = (id: string) => !id.startsWith(UNLINKED_AGENCY_PREFIX) && id !== "ag-1";

export function StoreProvider({ children }: { children: React.ReactNode }) {
  // La demo guarda en su propia clave: así sus datos de ejemplo nunca se
  // mezclan con los de una cuenta real en el mismo navegador.
  const [storageKey, setStorageKey] = useState(() => (isDemoActive() ? DEMO_STORAGE_KEY : ANON_STORAGE_KEY));
  const storageKeyRef = useRef(storageKey);
  storageKeyRef.current = storageKey;
  const [data, setData] = useState<StoreData>(() => loadData(storageKey));
  /** `true` si el último guardado falló (cuota llena, storage bloqueado). */
  const [persistFailed, setPersistFailed] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(data));
      setPersistFailed(false);
    } catch {
      // La app sigue andando, pero lo nuevo se pierde al recargar: hay que avisar.
      setPersistFailed(true);
    }
    // Con una cuenta real, lo que cambió también va a la base (en tandas, con un pequeño retraso).
    remoteRef.current?.track(data);
  }, [data, storageKey]);

  /**
   * Sincronización con la base propia del CRM. Se arma al abrir una sesión
   * real y se desarma al salir. `remoteEpoch` sube con cada bajada inicial:
   * los efectos que traen cosas de la app vuelven a correr sobre los datos
   * ya reconciliados.
   */
  const remoteRef = useRef<RemoteSync | null>(null);
  const [remoteStatus, setRemoteStatus] = useState<RemoteStatus>("off");
  const [remoteEpoch, setRemoteEpoch] = useState(0);

  const stopRemote = useCallback(() => {
    remoteRef.current?.stop();
    remoteRef.current = null;
    setRemoteStatus("off");
  }, []);

  const startRemote = useCallback(async (userId: string) => {
    remoteRef.current?.stop();
    const sync = new RemoteSync(userId, {
      onInitial: (records, pending) => {
        setData((d) => reconcileInitial(d, records, pending));
        setRemoteEpoch((n) => n + 1);
      },
      onRecords: (records, skip) => setData((d) => applyRemote(d, records, skip)),
      onPhotosUploaded: (propertyId, swap) => setData((d) => swapPhotoUrls(d, propertyId, swap)),
      onStatus: setRemoteStatus,
    });
    remoteRef.current = sync;
    const initial = await sync.start();
    // Cambió la sesión mientras bajaba: esta ya no va.
    if (remoteRef.current !== sync) return;
    if (initial) {
      setData((d) => reconcileInitial(d, initial, sync.pendingKeys()));
      sync.enableTracking();
    }
    setRemoteEpoch((n) => n + 1);
  }, []);

  /**
   * Los matches no se guardan: se derivan. Es lo que en la base hace el
   * trigger de `refresh_matches_*`, y garantiza que un cambio de precio o de
   * presupuesto se refleje al instante en toda la app.
   */
  const matches = useMemo(
    () => buildMatches(data.properties, data.requirements),
    [data.properties, data.requirements],
  );

  /**
   * Sesión: auth real de Supabase (mismo proyecto que la app), con el agente
   * atado a `agency_members`. Sin membresía la cuenta entra igual, con una
   * agencia local que no sincroniza con la app hasta que la vinculen.
   */
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  currentUserIdRef.current = currentUserId;
  const [sessionLoading, setSessionLoading] = useState(true);
  /** Cuenta creada que todavía tiene que confirmar el email: el login muestra los pasos que faltan. */
  const [pendingLinkEmail, setPendingLinkEmail] = useState<string | null>(null);
  const [agencyContext, setAgencyContext] = useState<AppPropertyContext | null>(null);
  const agencyContextRef = useRef<AppPropertyContext | null>(null);
  agencyContextRef.current = agencyContext;

  /** Busca la agencia del usuario y arma su Profile local si hace falta. */
  const applySession = useCallback(async (userId: string, email: string | null) => {
    // Al entrar con una cuenta real se usan los datos de ESA cuenta en este navegador.
    setDemoFlag(false);
    const accountKey = userStorageKey(userId);
    if (storageKeyRef.current !== accountKey) {
      setStorageKey(accountKey);
      setData(loadUserData(userId));
    }

    const { data: userData } = await supabase.auth.getUser();
    const meta = (userData.user?.user_metadata ?? {}) as { full_name?: string; name?: string; agency_name?: string };

    const { data: membership } = await supabase
      .from("agency_members")
      .select("role, agencies(id, name, owner_user_id)")
      .eq("user_id", userId)
      .maybeSingle();

    const agency = membership?.agencies as unknown as
      | { id: string; name: string; owner_user_id: string | null }
      | null;

    // Con membresía y agencia, la cuenta está vinculada. Las inmobiliarias
    // creadas por /api/saas/signup antes del 16/10 no tenían owner_user_id y
    // caían en modo local: el admin que entra hace de dueño.
    if (membership && agency) {
      setAgencyContext({
        agencyId: agency.id,
        agencyOwnerUserId: agency.owner_user_id ?? userId,
        managedByUserId: userId,
      });

      // Con una cuenta real, `agency` pasa a ser la agencia verdadera (su uuid es
      // el que esperan Supabase y todo lo que filtra por `agency.id`) y se quitan
      // los datos de ejemplo.
      setData((d) => {
        // Ejemplos visibles por defecto (marcados, nunca se sincronizan), salvo que eligió "Usar mis datos reales".
        const clean = adoptSamples(d, userId);
        // Si la agencia local es todavía la de ejemplo ("Inmobiliaria PropMatch",
        // La Plata, +54 221…), no heredar su contacto. Solo la de ejemplo: una
        // cuenta que venía en modo local (`local-…`) conserva lo que cargó.
        const fromSeed = clean.agency.id === seedAgency.id;
        return {
          ...clean,
          agency: fromSeed
            ? { ...clean.agency, id: agency.id, name: agency.name, phone: null, email: null, city: null, province: null }
            : { ...clean.agency, id: agency.id, name: agency.name },
        };
      });
    } else {
      // Cuenta sin inmobiliaria: entra igual y trabaja en modo local (sin
      // sincronizar con la app) hasta que alguien la vincule. La agencia local
      // toma el nombre que cargó al registrarse.
      const agencyName = meta.agency_name?.trim();
      setAgencyContext(null);
      setData((d) => {
        const clean = adoptSamples(d, userId);
        return {
          ...clean,
          agency: { ...clean.agency, id: `${UNLINKED_AGENCY_PREFIX}${userId}`, name: agencyName || clean.agency.name },
        };
      });
    }

    setData((d) => {
      const existing = d.profiles.find((p) => p.id === userId);
      if (existing) {
        // Si cambió el email de la cuenta (link de confirmación), el perfil lo refleja.
        if (!email || existing.email === email) return d;
        return { ...d, profiles: d.profiles.map((p) => (p.id === userId ? { ...p, email } : p)) };
      }
      const name = meta.full_name?.trim() || meta.name?.trim() || email?.split("@")[0] || "Agente";
      const newProfile: Profile = {
        id: userId,
        agency_id: d.agency.id,
        full_name: name,
        email,
        phone: null,
        avatar_url: null,
        initials: initials(name),
        // Sin inmobiliaria, la cuenta es dueña de su agencia local.
        role: !membership || membership.role === "admin" ? "owner" : "agente",
        is_active: true,
        created_at: new Date().toISOString(),
      };
      return { ...d, profiles: [...d.profiles, newProfile] };
    });

    setCurrentUserId(userId);
    // Baja los datos de la inmobiliaria antes de dar la sesión por abierta.
    await startRemote(userId);
    return null;
  }, [startRemote]);

  /**
   * Demo para mostrar el CRM sin cuenta: datos de ejemplo (`seed.ts`) en su
   * propia clave del navegador y sin tocar Supabase (sin `agencyContext`).
   */
  const enterDemo = useCallback(() => {
    stopRemote();
    setDemoFlag(true);
    if (storageKeyRef.current !== DEMO_STORAGE_KEY) {
      setStorageKey(DEMO_STORAGE_KEY);
      setData(adoptSamples(loadData(DEMO_STORAGE_KEY), DEMO_USER_ID, { alwaysVisible: true }));
    } else {
      // En la demo los ejemplos siempre están (también tras un refresh).
      setData((d) => adoptSamples(d, DEMO_USER_ID, { alwaysVisible: true }));
    }
    setPendingLinkEmail(null);
    setAgencyContext(null);
    setCurrentUserId(DEMO_USER_ID);
  }, [stopRemote]);

  // Restaura la sesión de Supabase si ya había una (refresh de la página).
  useEffect(() => {
    (async () => {
      try {
        localStorage.removeItem(SESSION_KEY); // limpieza del login viejo, sin backend
        if (isDemoActive()) {
          enterDemo();
          return;
        }
        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData.session?.user;
        if (user) await applySession(user.id, user.email ?? null);
      } finally {
        setSessionLoading(false);
      }
    })();
  }, [applySession, enterDemo]);

  // Trae las propiedades de agencia que ya existen en Supabase y todavía no
  // están en este navegador (ej. las creó otro agente desde otra máquina).
  // Corre después de cada bajada inicial de la base (`remoteEpoch`), así no
  // duplica lo que otro agente ya trajo.
  useEffect(() => {
    if (!agencyContext || remoteEpoch === 0) return;
    let cancelled = false;

    (async () => {
      try {
        const rows = await fetchAgencyProperties(agencyContext.agencyId);
        if (cancelled) return;

        setData((d) => {
          const known = new Set(d.properties.map((p) => p.app_property_id).filter(Boolean));
          const toAdd = rows.filter((row) => !known.has(row.id));
          if (toAdd.length === 0) return d;

          const toProperty = (row: AppPropertyRow): Property => ({
            id: uid("p"),
            agency_id: d.agency.id,
            owner_agent_id: row.managed_by_user_id,
            owner_contact_id: row.owner_contact_id,
            authorization_type: null,
            authorization_expires_at: null,
            title: row.title,
            description: row.description,
            type: TYPE_FROM_APP[row.type] ?? "casa",
            operation: OPERATION_FROM_APP[row.operation_type] ?? "alquiler",
            status: STATUS_FROM_APP[row.status] ?? "pausada",
            street: row.address,
            street_number: null,
            locality: row.barrio,
            province: null,
            zone: row.barrio,
            lat: null,
            lng: null,
            price: row.price_usd_sale ?? row.price_usd_month,
            currency: "USD",
            expenses: null,
            taxes: null,
            commission_pct: null,
            surface_total: null,
            surface_covered: null,
            rooms: row.rooms,
            bedrooms: row.rooms ? Math.max(0, row.rooms - 1) : 0,
            bathrooms: null,
            garages: null,
            age_years: null,
            features: row.amenities ?? [],
            is_featured: false,
            published_to_marketplace: false,
            published_at: row.created_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
            app_property_id: row.id,
            sync_status: "synced",
          });

          const newProperties = toAdd.map(toProperty);
          // Si la app tiene copias con el logo quemado, el CRM guarda las originales.
          const base = photosBase();
          const newPhotos = Object.fromEntries(
            toAdd.map((row, i) => [newProperties[i].id, originalPhotos(row.photos, base)]),
          );

          return {
            ...d,
            properties: [...newProperties, ...d.properties],
            photos: { ...d.photos, ...newPhotos },
          };
        });
      } catch (err) {
        console.error("No se pudieron traer las propiedades de la agencia", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [agencyContext, remoteEpoch]);

  /**
   * Leads reales: cuando alguien de la app le da like, matchea, propone una
   * visita o hace una oferta sobre una propiedad de la agencia, se crea (una
   * sola vez, dedup por `syncedAppEventIds`) un contacto + una oportunidad en
   * "nuevos" — el mismo lugar donde cae un match interno del CRM. Un like no
   * necesita esperar a que el propietario lo acepte en la app para contar
   * como lead: ya es la señal real de interés. Visitas y ofertas sobre un
   * contacto que ya tiene oportunidad quedan como actividad, no duplican la
   * tarjeta del pipeline. Poll cada 30s mientras haya sesión.
   */
  useEffect(() => {
    if (!agencyContext || remoteEpoch === 0) return;
    let cancelled = false;

    const run = async () => {
      try {
        const [swipes, matches, visits, offers] = await Promise.all([
          fetchAgencySwipes(agencyContext.agencyId),
          fetchAgencyMatches(agencyContext.agencyId),
          fetchAgencyVisits(agencyContext.agencyId),
          fetchAgencyOffers(agencyContext.agencyId),
        ]);
        if (cancelled) return;

        const seen = new Set(syncedIdsRef.current);
        const events = [
          ...swipes.map((row) => ({ kind: "swipe" as const, row })),
          ...matches.map((row) => ({ kind: "match" as const, row })),
          ...visits.map((row) => ({ kind: "visit" as const, row })),
          ...offers.map((row) => ({ kind: "offer" as const, row })),
        ].filter((e) => !seen.has(e.row.id));

        if (events.length === 0) return;

        const userIds = [...new Set(events.map((e) => e.row.demandante_id))];
        const users = await fetchUsersByIds(userIds);
        if (cancelled) return;
        const userById = new Map(users.map((u) => [u.id, u]));

        setData((d) => {
          let contacts = d.contacts;
          let opportunities = d.opportunities;
          let activities = d.activities;
          let appOffers = d.appOffers;
          const processedIds: string[] = [];
          const nowIso = new Date().toISOString();

          const findOrCreateContact = (userId: string): Contact => {
            const existing = contacts.find((c) => c.app_user_id === userId);
            if (existing) return existing;
            const u = userById.get(userId);
            const contact: Contact = {
              id: uid("c"),
              agency_id: d.agency.id,
              owner_id: actorRef.current,
              full_name: u?.name || "Interesado desde la app",
              email: null,
              phone: null,
              kind: "comprador",
              status: "nuevo",
              source: "consumer_app",
              profile_type: null,
              notes: null,
              app_user_id: userId,
              created_at: nowIso,
              updated_at: nowIso,
            };
            contacts = [contact, ...contacts];
            return contact;
          };

          for (const event of events) {
            const property = propertiesRef.current.find((p) => p.app_property_id === event.row.property_id);
            if (!property) continue; // todavía no llegó por la sincronización de propiedades: se reintenta en el próximo poll

            const contact = findOrCreateContact(event.row.demandante_id);
            processedIds.push(event.row.id);
            const existingOpp = opportunities.find(
              (o) => o.contact_id === contact.id && o.property_id === property.id,
            );

            if (event.kind === "swipe" || event.kind === "match") {
              let oppId = existingOpp?.id;
              if (!existingOpp) {
                const opp: Opportunity = {
                  id: uid("o"),
                  agency_id: d.agency.id,
                  contact_id: contact.id,
                  property_id: property.id,
                  match_id: event.kind === "match" ? event.row.id : null,
                  owner_id: actorRef.current,
                  stage: "nuevos",
                  value: property.price,
                  currency: property.currency,
                  is_priority: false,
                  priority_note: null,
                  stage_since: event.row.created_at,
                  closed_at: null,
                  created_at: event.row.created_at,
                  updated_at: event.row.created_at,
                };
                opportunities = [opp, ...opportunities];
                oppId = opp.id;
              }
              activities = [
                {
                  id: uid("a"),
                  agency_id: d.agency.id,
                  actor_id: null,
                  type: event.kind === "match" ? "match_creado" : "nota",
                  title: event.kind === "match" ? "Match confirmado desde la app" : "Le interesó tu propiedad en la app",
                  detail: `${contact.full_name} — ${property.title}`,
                  contact_id: contact.id,
                  property_id: property.id,
                  opportunity_id: oppId ?? null,
                  created_at: event.row.created_at,
                  ...(event.kind === "swipe"
                    ? {
                      app_swipe_id: event.row.id,
                      swipe_status: event.row.status === "pending" ? "pending" : (event.row.status as "accepted" | "rejected"),
                    }
                    : {}),
                },
                ...activities,
              ];
            } else if (event.kind === "visit") {
              activities = [
                {
                  id: uid("a"),
                  agency_id: d.agency.id,
                  actor_id: null,
                  type: "visita_programada",
                  title: "Visita propuesta desde la app",
                  detail: property.title,
                  contact_id: contact.id,
                  property_id: property.id,
                  opportunity_id: existingOpp?.id ?? null,
                  created_at: event.row.created_at,
                },
                ...activities,
              ];
            } else {
              appOffers = [
                {
                  id: uid("of"),
                  app_offer_id: event.row.id,
                  contact_id: contact.id,
                  property_id: property.id,
                  amount_usd: event.row.amount_usd,
                  status: event.row.status === "accepted" || event.row.status === "rejected" ? event.row.status : "pending",
                  created_at: event.row.created_at,
                },
                ...appOffers,
              ];
              activities = [
                {
                  id: uid("a"),
                  agency_id: d.agency.id,
                  actor_id: null,
                  type: "nota",
                  title: "Oferta recibida desde la app",
                  detail: `${property.title} — USD ${event.row.amount_usd.toLocaleString("es-AR")}`,
                  contact_id: contact.id,
                  property_id: property.id,
                  opportunity_id: existingOpp?.id ?? null,
                  created_at: event.row.created_at,
                  app_offer_id: event.row.id,
                  offer_status: "pending",
                },
                ...activities,
              ];
            }
          }

          if (processedIds.length === 0) return d;

          return {
            ...d,
            contacts,
            opportunities,
            activities,
            appOffers,
            syncedAppEventIds: [...d.syncedAppEventIds, ...processedIds],
          };
        });
      } catch (err) {
        console.error("No se pudieron traer los leads reales de la app", err);
      }
    };

    void run();
    const interval = setInterval(run, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [agencyContext, remoteEpoch]);

  const signIn = useCallback<StoreValue["signIn"]>(async (email, password) => {
    if (email.trim() === "valen@propmatch.com" && password === "123456") {
      enterDemo();
      return null;
    }

    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error || !authData.user) return "Email o contraseña incorrectos.";
    return applySession(authData.user.id, authData.user.email ?? null);
  }, [applySession, enterDemo]);

  /**
   * Alta con email. `handle_new_user` (trigger de la app) crea la fila en
   * `public.users` leyendo solo `name` de la metadata (`role` es nullable);
   * `agency_name` queda guardado en la metadata del usuario para cuando alguien
   * vincule la cuenta a una inmobiliaria. Con sesión inmediata entra directo;
   * si Supabase pide confirmar el email, queda en `pendingLinkEmail`.
   */
  const signUp = useCallback<StoreValue["signUp"]>(async (input) => {
    const { data: res, error } = await supabase.auth.signUp({
      email: input.email.trim(),
      password: input.password,
      options: {
        data: { name: input.name.trim(), agency_name: input.agencyName.trim() },
        // El link del email vuelve al CRM desde donde se registró (tiene que
        // estar en Auth > URL Configuration > Redirect URLs de Supabase).
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("already")) return { error: "Ese email ya tiene una cuenta. Probá ingresar.", needsEmailConfirmation: false };
      if (msg.includes("password")) return { error: "La contraseña no cumple los requisitos de seguridad.", needsEmailConfirmation: false };
      return { error: "No pudimos crear la cuenta. Probá de nuevo en un rato.", needsEmailConfirmation: false };
    }
    // Supabase no avisa que el email existe (anti-enumeración): devuelve un usuario sin identidades.
    if (res.user && res.user.identities?.length === 0) {
      return { error: "Ese email ya tiene una cuenta. Probá ingresar.", needsEmailConfirmation: false };
    }
    if (res.session && res.user) {
      await applySession(res.user.id, res.user.email ?? null);
      return { error: null, needsEmailConfirmation: false };
    }
    setPendingLinkEmail(input.email.trim());
    return { error: null, needsEmailConfirmation: true };
  }, [applySession]);

  /**
   * Requiere el provider Google habilitado en Supabase (Auth > Providers) con un
   * cliente OAuth de Google Cloud, y `window.location.origin` en las Redirect
   * URLs. Al volver, supabase-js lee la sesión de la URL y `getSession` (arriba)
   * la pasa por `applySession`.
   */
  const signInWithGoogle = useCallback<StoreValue["signInWithGoogle"]>(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (!error) return null;
    return /provider is not enabled|unsupported provider/i.test(error.message)
      ? "Google todavía no está habilitado para PropMatch."
      : "No pudimos conectar con Google. Probá de nuevo.";
  }, []);

  const dismissPendingLink = useCallback(() => setPendingLinkEmail(null), []);

  const signOut = useCallback(() => {
    stopRemote();
    void supabase.auth.signOut();
    setAgencyContext(null);
    setCurrentUserId(null);
    // Al salir no quedan a la vista los datos de la cuenta (ni de la demo).
    setDemoFlag(false);
    setStorageKey(ANON_STORAGE_KEY);
    setData(loadData(ANON_STORAGE_KEY));
  }, [stopRemote]);

  /**
   * Quién hace cada acción. Ref y no dependencia: así las acciones no cambian
   * de identidad al cambiar de sesión y siempre leen el agente actual.
   */
  const actorRef = useRef<string>(currentUserId ?? CURRENT_USER_ID);
  actorRef.current = currentUserId ?? CURRENT_USER_ID;

  /** Última versión de las propiedades, para leer `app_property_id` desde acciones con deps `[]`. */
  const propertiesRef = useRef(data.properties);
  propertiesRef.current = data.properties;
  const photosRef = useRef(data.photos);
  photosRef.current = data.photos;
  /** Marca de la agencia (para el logo en las fotos de la app). */
  const brandingRef = useRef(data.agency.branding);
  brandingRef.current = data.agency.branding;
  const dealsRef = useRef(data.deals);
  dealsRef.current = data.deals;
  const appOffersRef = useRef(data.appOffers);
  appOffersRef.current = data.appOffers;

  /** Última versión de los ids de leads ya sincronizados, para el polling de leads reales. */
  const syncedIdsRef = useRef(data.syncedAppEventIds);
  syncedIdsRef.current = data.syncedAppEventIds;

  /** Sube fotos nuevas y crea/actualiza la fila real en la app. No se espera desde la pantalla: corre en paralelo y actualiza el estado local cuando termina. */
  const syncPropertyToApp = useCallback(
    async (localId: string, input: NewPropertyInput, ctx: AppPropertyContext, existingAppId: string | null) => {
      // Seguridad: una propiedad de ejemplo nunca llega a la app de Lucas (base real).
      if (isSample(propertiesRef.current.find((p) => p.id === localId))) return;
      try {
        const photoUrls = await uploadPropertyPhotos(ctx.agencyId, localId, input.photos);
        // A la app pueden ir copias con el logo quemado; el CRM se queda con las originales.
        const forApp = await photosForApp(ctx.agencyId, localId, photoUrls, brandingRef.current);
        const appId = await upsertAppProperty(input, ctx, forApp.photos, existingAppId);
        setData((d) => ({
          ...d,
          properties: d.properties.map((p) =>
            p.id === localId
              ? { ...p, app_property_id: appId, sync_status: "synced", app_photo_notice: watermarkNotice(forApp.failures.length) }
              : p,
          ),
          photos: { ...d.photos, [localId]: photoUrls },
        }));
      } catch (err) {
        console.error("No se pudo publicar la propiedad en la app", err);
        setData((d) => ({
          ...d,
          properties: d.properties.map((p) => (p.id === localId ? { ...p, sync_status: "error" } : p)),
        }));
      }
    },
    [],
  );

  const profile = useMemo(
    () =>
      data.profiles.find((p) => p.id === currentUserId) ??
      data.profiles.find((p) => p.id === CURRENT_USER_ID) ??
      data.profiles[0],
    [currentUserId, data.profiles],
  );

  const addProperty = useCallback<StoreValue["addProperty"]>(
    (input) => {
      const id = uid("p");
      const nowIso = new Date().toISOString();
      const property: Property = {
        id,
        agency_id: seedAgency.id,
        owner_agent_id: input.owner_agent_id,
        owner_contact_id: input.owner_contact_id,
        authorization_type: input.authorization_type,
        authorization_expires_at: input.authorization_expires_at,
        title: input.title,
        description: input.description,
        type: input.type,
        operation: input.operation,
        status: input.status,
        street: input.street,
        street_number: input.street_number,
        locality: input.locality,
        province: input.province,
        zone: input.locality,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        price: input.price,
        currency: input.currency,
        expenses: input.expenses,
        taxes: input.taxes,
        commission_pct: input.commission_pct,
        surface_total: input.surface_total,
        surface_covered: input.surface_covered,
        rooms: roomsOf(input),
        bedrooms: input.bedrooms,
        bathrooms: input.bathrooms,
        garages: input.garages,
        age_years: input.age_years,
        features: input.features,
        ...pickCrmDetails(input),
        is_featured: false,
        published_to_marketplace: false,
        published_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
        app_property_id: null,
        sync_status: agencyContextRef.current
          ? canPublishToApp(input)
            ? "syncing"
            : "not_publishable"
          : undefined,
      };

      setData((d) => ({
        ...d,
        properties: [property, ...d.properties],
        photos: { ...d.photos, [id]: input.photos },
        activities: [
          {
            id: uid("a"),
            agency_id: seedAgency.id,
            actor_id: actorRef.current,
            type: "propiedad_publicada",
            title: "Propiedad publicada",
            detail: input.title,
            contact_id: null,
            property_id: id,
            opportunity_id: null,
            created_at: nowIso,
          },
          ...d.activities,
        ],
      }));

      if (agencyContextRef.current && canPublishToApp(input)) {
        void syncPropertyToApp(id, input, agencyContextRef.current, null);
      }

      return property;
    },
    [syncPropertyToApp],
  );

  const updateProperty = useCallback<StoreValue["updateProperty"]>((id, patch) => {
    setData((d) => ({
      ...d,
      properties: d.properties.map((p) =>
        p.id === id ? { ...p, ...patch, updated_at: new Date().toISOString() } : p,
      ),
    }));
    // Si cambia algo que también tiene la app (p. ej. al completar un dato desde
    // el publicador), se vuelve a sincronizar como al guardar desde el editor.
    const current = propertiesRef.current.find((p) => p.id === id);
    const touchesApp = Object.keys(patch).some((k) => APP_SYNCED_FIELDS.has(k));
    if (touchesApp && current?.app_property_id && !isSample(current) && agencyContextRef.current) {
      const merged = { ...current, ...patch };
      if (canPublishToApp(merged)) {
        const input = { ...merged, photos: photosRef.current[id] ?? [] } as unknown as NewPropertyInput;
        void syncPropertyToApp(id, input, agencyContextRef.current, current.app_property_id);
        return;
      }
    }
    if (patch.status) {
      const current = propertiesRef.current.find((p) => p.id === id);
      if (current?.app_property_id && !isSample(current)) {
        pushStatusToApp(current.app_property_id, patch.status).catch((err) =>
          console.error("No se pudo actualizar el estado en la app", err),
        );
      }
    }
  }, [syncPropertyToApp]);

  const replacePropertyPhotos = useCallback<StoreValue["replacePropertyPhotos"]>((id, next) => {
    setData((d) => (d.photos[id] ? { ...d, photos: { ...d.photos, [id]: next } } : d));
  }, []);

  const publishPropertyToApp = useCallback<StoreValue["publishPropertyToApp"]>(async (id, appPhotos) => {
    const ctx = agencyContextRef.current;
    const current = propertiesRef.current.find((p) => p.id === id);
    if (!ctx) return { ok: false, error: "Tu cuenta todavía no está vinculada a la app PropMatch" };
    if (!current) return { ok: false, error: "La propiedad ya no existe en el CRM" };
    // Seguridad: una propiedad de ejemplo nunca llega a la app (base real).
    if (isSample(current)) return { ok: false, error: "Es un dato de ejemplo: no se publica" };
    if (!canPublishToApp(current)) return { ok: false, error: "La app solo maneja precios en USD" };
    const existingAppId = current.app_property_id ?? null;
    const input = {
      ...current,
      // Sin `rooms` (dato viejo) roomsOf usa dormitorios + 1, igual que la elegibilidad.
      bedrooms: current.bedrooms ?? 0,
      photos: appPhotos,
    } as unknown as NewPropertyInput;
    setData((d) => ({ ...d, properties: d.properties.map((p) => (p.id === id ? { ...p, sync_status: "syncing" } : p)) }));
    try {
      const uploaded = await uploadPropertyPhotos(ctx.agencyId, id, appPhotos);
      // A la app pueden ir copias con el logo quemado; el CRM se queda con las originales.
      const forApp = await photosForApp(ctx.agencyId, id, uploaded, brandingRef.current);
      const appId = await upsertAppProperty(input, ctx, forApp.photos, existingAppId);
      // Las data: subidas recién se reemplazan en el CRM por su URL; el resto queda igual.
      const swap = new Map(appPhotos.map((u, i) => [u, uploaded[i]]));
      const notice = watermarkNotice(forApp.failures.length);
      setData((d) => ({
        ...d,
        properties: d.properties.map((p) =>
          p.id === id ? { ...p, app_property_id: appId, sync_status: "synced", app_photo_notice: notice } : p,
        ),
        photos: d.photos[id] ? { ...d.photos, [id]: d.photos[id].map((u) => (u.startsWith("data:") ? swap.get(u) ?? u : u)) } : d.photos,
      }));
      return { ok: true, watermarkFailures: forApp.failures.length };
    } catch (err) {
      console.error("No se pudo publicar la propiedad en la app", err);
      setData((d) => ({ ...d, properties: d.properties.map((p) => (p.id === id ? { ...p, sync_status: "error" } : p)) }));
      return { ok: false, error: appErrorMessage(err) };
    }
  }, []);

  const savePropertyEdit = useCallback<StoreValue["savePropertyEdit"]>(
    (id, input) => {
      const nowIso = new Date().toISOString();
      const current = propertiesRef.current.find((p) => p.id === id);
      // Editar un ejemplo no lo vuelve real: sigue sin sincronizarse.
      const willPublish = Boolean(agencyContextRef.current) && canPublishToApp({ ...input, is_sample: isSample(current) });

      setData((d) => ({
        ...d,
        properties: d.properties.map((p) =>
          p.id === id
            ? {
              ...p,
              title: input.title,
              description: input.description,
              type: input.type,
              operation: input.operation,
              status: input.status,
              street: input.street,
              street_number: input.street_number,
              locality: input.locality,
              province: input.province,
              zone: input.locality,
              lat: input.lat !== undefined ? input.lat : p.lat,
              lng: input.lng !== undefined ? input.lng : p.lng,
              price: input.price,
              currency: input.currency,
              expenses: input.expenses,
              taxes: input.taxes,
              commission_pct: input.commission_pct,
              surface_total: input.surface_total,
              surface_covered: input.surface_covered,
              rooms: roomsOf(input),
              bedrooms: input.bedrooms,
              bathrooms: input.bathrooms,
              garages: input.garages,
              age_years: input.age_years,
              features: input.features,
              owner_agent_id: input.owner_agent_id,
              owner_contact_id: input.owner_contact_id,
              authorization_type: input.authorization_type,
              authorization_expires_at: input.authorization_expires_at,
              ...pickCrmDetails(input),
              updated_at: nowIso,
              sync_status: agencyContextRef.current && !isSample(p)
                ? willPublish
                  ? "syncing"
                  : "not_publishable"
                : p.sync_status,
            }
            : p,
        ),
        photos: { ...d.photos, [id]: input.photos },
      }));

      if (agencyContextRef.current && willPublish) {
        void syncPropertyToApp(id, input, agencyContextRef.current, current?.app_property_id ?? null);
      }
    },
    [syncPropertyToApp],
  );

  const addContact = useCallback<StoreValue["addContact"]>((input) => {
    const nowIso = new Date().toISOString();
    const contactId = uid("c");

    const contact: Contact = {
      id: contactId,
      agency_id: seedAgency.id,
      owner_id: input.owner_id ?? actorRef.current,
      full_name: input.full_name,
      email: input.email,
      phone: input.phone,
      kind: input.kind,
      status: input.status,
      source: "manual",
      profile_type: input.profile_type,
      notes: input.notes,
      created_at: nowIso,
      updated_at: nowIso,
    };

    // El contacto y su búsqueda se guardan juntos: si se guardaran en dos
    // pasos, entre uno y otro habría un contacto sin criterios y el motor de
    // matching lo ignoraría.
    const requirement: ContactRequirement | null = input.requirement
      ? {
        id: uid("r"),
        agency_id: seedAgency.id,
        contact_id: contactId,
        ...input.requirement,
        rooms_min: null,
        is_active: true,
        created_at: nowIso,
        updated_at: nowIso,
      }
      : null;

    setData((d) => ({
      ...d,
      contacts: [contact, ...d.contacts],
      requirements: requirement ? [requirement, ...d.requirements] : d.requirements,
      activities: [
        {
          id: uid("a"),
          agency_id: seedAgency.id,
          actor_id: actorRef.current,
          type: "contacto_creado",
          title: "Nuevo contacto agregado",
          detail: input.full_name,
          contact_id: contactId,
          property_id: null,
          opportunity_id: null,
          created_at: nowIso,
        },
        ...d.activities,
      ],
    }));

    return contact;
  }, []);

  const updateContact = useCallback<StoreValue["updateContact"]>((id, patch) => {
    setData((d) => ({
      ...d,
      contacts: d.contacts.map((c) =>
        c.id === id ? { ...c, ...patch, updated_at: new Date().toISOString() } : c,
      ),
    }));
  }, []);

  const saveRequirement = useCallback<StoreValue["saveRequirement"]>((contactId, input) => {
    const nowIso = new Date().toISOString();
    setData((d) => {
      const existing = d.requirements.find((r) => r.contact_id === contactId && r.is_active);

      const next: ContactRequirement = existing
        ? { ...existing, ...input, rooms_min: null, updated_at: nowIso }
        : {
          id: uid("r"),
          agency_id: seedAgency.id,
          contact_id: contactId,
          ...input,
          rooms_min: null,
          is_active: true,
          created_at: nowIso,
          updated_at: nowIso,
        };

      return {
        ...d,
        requirements: existing
          ? d.requirements.map((r) => (r.id === existing.id ? next : r))
          : [next, ...d.requirements],
        contacts: d.contacts.map((c) =>
          c.id === contactId ? { ...c, updated_at: nowIso } : c,
        ),
      };
    });
  }, []);

  const moveOpportunity = useCallback<StoreValue["moveOpportunity"]>((id, stage) => {
    setData((d) => {
      const opp = d.opportunities.find((o) => o.id === id);
      // Soltar la tarjeta en su propia columna no es un avance.
      if (!opp || opp.stage === stage) return d;
      const contact = d.contacts.find((c) => c.id === opp.contact_id);
      const nowIso = new Date().toISOString();

      return {
        ...d,
        opportunities: d.opportunities.map((o) =>
          o.id === id
            ? {
              ...o,
              stage,
              stage_since: nowIso,
              updated_at: nowIso,
              // Salir de cierre deshace el cierre: si no, Reportes lo seguiría contando.
              closed_at: stage === "cierre" ? nowIso : null,
            }
            : o,
        ),
        activities: [
          {
            id: uid("a"),
            agency_id: seedAgency.id,
            actor_id: actorRef.current,
            type: "etapa_avanzada" as ActivityType,
            title: `${contact?.full_name.split(" ")[0] ?? "Oportunidad"} pasó a ${STAGE_LABEL[stage]}`,
            detail: d.properties.find((p) => p.id === opp.property_id)?.title ?? null,
            contact_id: opp.contact_id,
            property_id: opp.property_id,
            opportunity_id: opp.id,
            created_at: nowIso,
          },
          ...d.activities,
        ],
      };
    });
  }, []);

  const createOpportunityFromMatch = useCallback<StoreValue["createOpportunityFromMatch"]>(
    (matchId) => {
      const match = matches.find((m) => m.id === matchId);
      if (!match) return;

      setData((d) => {
        // No duplicar: si ya existe una oportunidad para ese par, no se crea otra.
        const exists = d.opportunities.some(
          (o) => o.contact_id === match.contact_id && o.property_id === match.property_id,
        );
        if (exists) return d;

        const property = d.properties.find((p) => p.id === match.property_id);
        const contact = d.contacts.find((c) => c.id === match.contact_id);
        const nowIso = new Date().toISOString();
        const id = uid("o");
        const sample = isSample(property) || isSample(contact);

        return {
          ...d,
          opportunities: [
            {
              id,
              agency_id: seedAgency.id,
              contact_id: match.contact_id,
              property_id: match.property_id,
              match_id: match.id,
              owner_id: actorRef.current,
              stage: "nuevos",
              value: property?.price ?? null,
              currency: property?.currency ?? "USD",
              is_priority: false,
              priority_note: null,
              stage_since: nowIso,
              closed_at: null,
              created_at: nowIso,
              updated_at: nowIso,
              // Nace de un ejemplo: también es ejemplo (se va con "Usar mis datos reales").
              ...(sample ? { is_sample: true } : {}),
            },
            ...d.opportunities,
          ],
          activities: [
            {
              id: uid("a"),
              agency_id: seedAgency.id,
              actor_id: actorRef.current,
              type: "match_creado" as ActivityType,
              title: "Oportunidad creada desde un match",
              detail: `${contact?.full_name ?? ""} — ${property?.title ?? ""}`,
              contact_id: match.contact_id,
              property_id: match.property_id,
              opportunity_id: id,
              created_at: nowIso,
            },
            ...d.activities,
          ],
        };
      });
    },
    [matches],
  );

  /**
   * Alta manual de una oportunidad: la misma pieza que `createOpportunityFromMatch`
   * pero arrancando de un contacto elegido a mano, sin match detrás.
   */
  const addOpportunity = useCallback<StoreValue["addOpportunity"]>((input) => {
    const nowIso = new Date().toISOString();
    const id = uid("o");
    const opportunity: Opportunity = {
      id,
      agency_id: seedAgency.id,
      contact_id: input.contact_id,
      property_id: input.property_id,
      match_id: null,
      owner_id: input.owner_id,
      stage: input.stage,
      value: input.value,
      currency: input.currency,
      is_priority: false,
      priority_note: null,
      stage_since: nowIso,
      closed_at: input.stage === "cierre" ? nowIso : null,
      created_at: nowIso,
      updated_at: nowIso,
    };

    setData((d) => {
      const contact = d.contacts.find((c) => c.id === input.contact_id);
      const property = d.properties.find((p) => p.id === input.property_id);
      const sample = isSample(contact) || isSample(property);
      return {
        ...d,
        opportunities: [sample ? { ...opportunity, is_sample: true } : opportunity, ...d.opportunities],
        activities: [
          {
            id: uid("a"),
            agency_id: seedAgency.id,
            actor_id: actorRef.current,
            type: "etapa_avanzada" as ActivityType,
            title: `Oportunidad nueva en ${STAGE_LABEL[input.stage]}`,
            detail: [contact?.full_name, property?.title].filter(Boolean).join(" — ") || null,
            contact_id: input.contact_id,
            property_id: input.property_id,
            opportunity_id: id,
            created_at: nowIso,
          },
          ...d.activities,
        ],
      };
    });

    return opportunity;
  }, []);

  const addEvent = useCallback<StoreValue["addEvent"]>((input) => {
    const nowIso = new Date().toISOString();
    const event: CalendarEvent = {
      id: uid("e"),
      agency_id: seedAgency.id,
      owner_id: input.owner_id,
      type: input.type,
      title: input.title,
      contact_id: input.contact_id,
      property_id: input.property_id,
      opportunity_id: null,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      notes: input.notes,
      created_at: nowIso,
      ...(input.type === "visita" ? { status: input.status ?? "por_confirmar" } : {}),
    };

    setData((d) => {
      const contact = d.contacts.find((c) => c.id === input.contact_id);
      const property = d.properties.find((p) => p.id === input.property_id);
      const sample = isSample(contact) || isSample(property);
      return {
        ...d,
        events: [...d.events, sample ? { ...event, is_sample: true } : event],
        activities: [
          {
            id: uid("a"),
            agency_id: seedAgency.id,
            actor_id: actorRef.current,
            type: EVENT_ACTIVITY[input.type],
            title: input.title,
            detail: [contact?.full_name, property?.title].filter(Boolean).join(" — ") || null,
            contact_id: input.contact_id,
            property_id: input.property_id,
            opportunity_id: null,
            created_at: nowIso,
          },
          ...d.activities,
        ],
      };
    });

    return event;
  }, []);

  const updateEvent = useCallback<StoreValue["updateEvent"]>((id, input) => {
    setData((d) => ({
      ...d,
      events: d.events.map((e) => (e.id === id ? { ...e, ...input, updated_at: new Date().toISOString() } : e)),
    }));
  }, []);

  const removeEvent = useCallback<StoreValue["removeEvent"]>((id) => {
    setData((d) => ({ ...d, events: d.events.filter((e) => e.id !== id) }));
  }, []);

  const patchEvent = useCallback<StoreValue["patchEvent"]>((id, patch) => {
    setData((d) => ({
      ...d,
      events: d.events.map((e) => (e.id === id ? { ...e, ...patch, updated_at: new Date().toISOString() } : e)),
    }));
  }, []);

  const applyGcalPatches = useCallback<StoreValue["applyGcalPatches"]>((patches) => {
    if (patches.length === 0) return;
    setData((d) => {
      let events = d.events;
      let tasks = d.tasks;
      for (const p of patches) {
        if (p.kind === "task") tasks = tasks.map((t) => (t.id === p.id ? { ...t, ...p.patch } : t));
        else if ("remove" in p) events = events.filter((e) => e.id !== p.id);
        else events = events.map((e) => (e.id === p.id ? { ...e, ...p.patch } : e));
      }
      return { ...d, events, tasks };
    });
  }, []);

  const saveAppVisitFeedback = useCallback<StoreValue["saveAppVisitFeedback"]>((visitId, feedback) => {
    setData((d) => ({ ...d, appVisitFeedback: { ...d.appVisitFeedback, [visitId]: feedback } }));
  }, []);

  const patchAppVisitChecklist = useCallback<StoreValue["patchAppVisitChecklist"]>((visitId, patch) => {
    setData((d) => ({
      ...d,
      appVisitChecklist: { ...d.appVisitChecklist, [visitId]: { ...d.appVisitChecklist[visitId], ...patch } },
    }));
  }, []);

  const importContacts = useCallback<StoreValue["importContacts"]>((inputs) => {
    const nowIso = new Date().toISOString();
    const contacts: Contact[] = [];
    const requirements: ContactRequirement[] = [];
    for (const input of inputs) {
      const id = uid("c");
      contacts.push({
        id,
        agency_id: seedAgency.id,
        owner_id: input.owner_id ?? actorRef.current,
        full_name: input.full_name,
        email: input.email,
        phone: input.phone,
        kind: input.kind,
        status: input.status,
        source: "manual",
        profile_type: input.profile_type,
        notes: input.notes,
        created_at: nowIso,
        updated_at: nowIso,
      });
      if (input.requirement) {
        requirements.push({
          id: uid("r"),
          agency_id: seedAgency.id,
          contact_id: id,
          ...input.requirement,
          rooms_min: null,
          is_active: true,
          created_at: nowIso,
          updated_at: nowIso,
        });
      }
    }
    setData((d) => ({
      ...d,
      contacts: [...contacts, ...d.contacts],
      requirements: [...requirements, ...d.requirements],
      activities: [
        {
          id: uid("a"),
          agency_id: seedAgency.id,
          actor_id: actorRef.current,
          type: "nota",
          title: `Importación de ${contacts.length} ${contacts.length === 1 ? "contacto" : "contactos"}`,
          detail: requirements.length ? `${requirements.length} con búsqueda cargada` : null,
          contact_id: null,
          property_id: null,
          opportunity_id: null,
          created_at: nowIso,
        },
        ...d.activities,
      ],
    }));
    return contacts.map((c) => c.id);
  }, []);

  const importProperties = useCallback<StoreValue["importProperties"]>((inputs) => {
    const nowIso = new Date().toISOString();
    const properties: Property[] = inputs.map((input) => ({
      id: uid("p"),
      agency_id: seedAgency.id,
      owner_agent_id: input.owner_agent_id,
      owner_contact_id: input.owner_contact_id,
      authorization_type: input.authorization_type,
      authorization_expires_at: input.authorization_expires_at,
      title: input.title,
      description: input.description,
      type: input.type,
      operation: input.operation,
      status: input.status,
      street: input.street,
      street_number: input.street_number,
      locality: input.locality,
      province: input.province,
      zone: input.locality,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      price: input.price,
      currency: input.currency,
      expenses: input.expenses,
      taxes: input.taxes,
      commission_pct: input.commission_pct,
      surface_total: input.surface_total,
      surface_covered: input.surface_covered,
      rooms: input.rooms !== undefined ? input.rooms : input.bedrooms ? input.bedrooms + 1 : null,
      bedrooms: input.bedrooms,
      bathrooms: input.bathrooms,
      garages: input.garages,
      age_years: input.age_years,
      features: input.features,
      is_featured: false,
      published_to_marketplace: false,
      published_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    }));
    const photoMap = Object.fromEntries(properties.map((p, i) => [p.id, inputs[i].photos]));
    setData((d) => ({
      ...d,
      properties: [...properties, ...d.properties],
      photos: { ...d.photos, ...photoMap },
      activities: [
        {
          id: uid("a"),
          agency_id: seedAgency.id,
          actor_id: actorRef.current,
          type: "nota",
          title: `Importación de ${properties.length} ${properties.length === 1 ? "propiedad" : "propiedades"}`,
          detail: null,
          contact_id: null,
          property_id: null,
          opportunity_id: null,
          created_at: nowIso,
        },
        ...d.activities,
      ],
    }));
    return properties.map((p) => p.id);
  }, []);

  const undoImport = useCallback<StoreValue["undoImport"]>(({ contacts = [], properties = [] }) => {
    const c = new Set(contacts);
    const p = new Set(properties);
    setData((d) => ({
      ...d,
      contacts: d.contacts.filter((x) => !c.has(x.id)),
      requirements: d.requirements.filter((x) => !c.has(x.contact_id)),
      properties: d.properties
        .filter((x) => !p.has(x.id))
        .map((x) => (x.owner_contact_id && c.has(x.owner_contact_id) ? { ...x, owner_contact_id: null } : x)),
      photos: Object.fromEntries(Object.entries(d.photos).filter(([id]) => !p.has(id))),
      opportunities: d.opportunities.filter((o) => !c.has(o.contact_id) && !(o.property_id && p.has(o.property_id))),
      events: d.events.map((e) => ({
        ...e,
        contact_id: e.contact_id && c.has(e.contact_id) ? null : e.contact_id,
        property_id: e.property_id && p.has(e.property_id) ? null : e.property_id,
      })),
      activities: d.activities.filter(
        (a) => !(a.contact_id && c.has(a.contact_id)) && !(a.property_id && p.has(a.property_id)),
      ),
    }));
  }, []);

  const snoozeFollowUp = useCallback<StoreValue["snoozeFollowUp"]>((contactId, days) => {
    const until = new Date(Date.now() + days * 86_400_000).toISOString();
    setData((d) => ({ ...d, followUpSnoozes: { ...d.followUpSnoozes, [contactId]: until } }));
  }, []);

  const logActivity = useCallback<StoreValue["logActivity"]>((input) => {
    const nowIso = new Date().toISOString();
    setData((d) => ({
      ...d,
      activities: [
        {
          id: uid("a"),
          agency_id: seedAgency.id,
          actor_id: actorRef.current,
          opportunity_id: null,
          created_at: nowIso,
          ...input,
        },
        ...d.activities,
      ],
    }));
  }, []);

  const updateAgency = useCallback<StoreValue["updateAgency"]>((input) => {
    setData((d) => ({ ...d, agency: { ...d.agency, ...input } }));
  }, []);

  const updateProfile = useCallback<StoreValue["updateProfile"]>((id, input) => {
    setData((d) => ({
      ...d,
      profiles: d.profiles.map((p) =>
        p.id === id ? { ...p, ...input, initials: initials(input.full_name) } : p,
      ),
    }));
  }, []);

  const syncAccountEmail = useCallback<StoreValue["syncAccountEmail"]>((email) => {
    const id = currentUserIdRef.current;
    if (!id) return;
    setData((d) => {
      if (!d.profiles.some((p) => p.id === id && p.email !== email)) return d;
      return { ...d, profiles: d.profiles.map((p) => (p.id === id ? { ...p, email } : p)) };
    });
  }, []);

  const setOpportunityPriority = useCallback<StoreValue["setOpportunityPriority"]>(
    (id, note) => {
      const nowIso = new Date().toISOString();
      setData((d) => ({
        ...d,
        opportunities: d.opportunities.map((o) =>
          o.id === id
            ? { ...o, is_priority: note !== null, priority_note: note, updated_at: nowIso }
            : o,
        ),
      }));
    },
    [],
  );

  /**
   * Perder una operación no es "una etapa más": deja de contar en el pipeline
   * y el motivo queda en el historial, que es lo único que después sirve para
   * entender por qué se cae la gente.
   */
  const markOpportunityLost = useCallback<StoreValue["markOpportunityLost"]>((id, reason) => {
    const nowIso = new Date().toISOString();
    setData((d) => {
      const opp = d.opportunities.find((o) => o.id === id);
      if (!opp) return d;
      const contact = d.contacts.find((c) => c.id === opp.contact_id);

      return {
        ...d,
        opportunities: d.opportunities.map((o) =>
          o.id === id
            ? {
              ...o,
              stage: "perdida",
              stage_since: nowIso,
              updated_at: nowIso,
              closed_at: nowIso,
              is_priority: false,
              priority_note: reason,
            }
            : o,
        ),
        activities: [
          {
            id: uid("a"),
            agency_id: seedAgency.id,
            actor_id: actorRef.current,
            type: "etapa_avanzada" as ActivityType,
            title: `${contact?.full_name.split(" ")[0] ?? "Oportunidad"} se dio de baja`,
            detail: reason,
            contact_id: opp.contact_id,
            property_id: opp.property_id,
            opportunity_id: opp.id,
            created_at: nowIso,
          },
          ...d.activities,
        ],
      };
    });
  }, []);

  const reopenOpportunity = useCallback<StoreValue["reopenOpportunity"]>((id) => {
    const nowIso = new Date().toISOString();
    setData((d) => ({
      ...d,
      opportunities: d.opportunities.map((o) =>
        o.id === id
          ? {
            ...o,
            stage: "nuevos",
            stage_since: nowIso,
            updated_at: nowIso,
            closed_at: null,
            priority_note: null,
          }
          : o,
      ),
    }));
  }, []);

  const addTask = useCallback<StoreValue["addTask"]>((input) => {
    const task: Task = {
      id: uid("t"),
      agency_id: seedAgency.id,
      owner_id: input.owner_id,
      text: input.text,
      is_priority: input.is_priority,
      is_done: false,
      due_date: input.due_date,
      contact_id: input.contact_id,
      created_at: new Date().toISOString(),
    };
    // Las urgentes arriba: es el orden en el que la pantalla las muestra.
    setData((d) => ({
      ...d,
      tasks: input.is_priority ? [task, ...d.tasks] : [...d.tasks, task],
    }));
    return task;
  }, []);

  const removeTask = useCallback<StoreValue["removeTask"]>((id) => {
    setData((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== id) }));
  }, []);

  const toggleTask = useCallback<StoreValue["toggleTask"]>((id) => {
    setData((d) => ({
      ...d,
      tasks: d.tasks.map((t) => (t.id === id ? { ...t, is_done: !t.is_done, updated_at: new Date().toISOString() } : t)),
    }));
  }, []);

  const markMatchReviewed = useCallback((id: string) => {
    setData((d) =>
      d.reviewedMatches.includes(id) ? d : { ...d, reviewedMatches: [...d.reviewedMatches, id] },
    );
  }, []);

  const respondOffer = useCallback<StoreValue["respondOffer"]>(async (appOfferId, action) => {
    // Oferta de ejemplo: su id no existe en la app. Se resuelve solo en el navegador.
    const sampleOffer = appOffersRef.current.some((o) => o.app_offer_id === appOfferId && isSample(o));
    if (!sampleOffer) {
      const { error } = await respondToOffer(appOfferId, action);
      if (error) return error;
    }

    const newStatus = action === "accept" ? "accepted" : "rejected";
    setData((d) => ({
      ...d,
      appOffers: d.appOffers.map((o) => (o.app_offer_id === appOfferId ? { ...o, status: newStatus } : o)),
      activities: d.activities.map((a) =>
        a.app_offer_id === appOfferId ? { ...a, offer_status: newStatus } : a,
      ),
    }));
    return null;
  }, []);

  const respondSwipe = useCallback<StoreValue["respondSwipe"]>(async (activityId, action) => {
    const activity = data.activities.find((a) => a.id === activityId);
    if (!activity?.app_swipe_id) return "Esta actividad no tiene un interés real asociado.";

    const { error } = await respondToSwipe(activity.app_swipe_id, action);
    if (error) return error;

    setData((d) => ({
      ...d,
      activities: d.activities.map((a) => (a.id === activityId ? { ...a, swipe_status: action } : a)),
    }));
    return null;
  }, [data.activities]);

  const reviewed = useMemo(() => new Set(data.reviewedMatches), [data.reviewedMatches]);

  const matchesWithReview = useMemo(() => {
    const sampleProps = new Set(data.properties.filter(isSample).map((p) => p.id));
    const sampleReqs = new Set(data.requirements.filter(isSample).map((r) => r.id));
    return matches.map((m) => {
      const sample = sampleProps.has(m.property_id) || sampleReqs.has(m.requirement_id);
      const next = reviewed.has(m.id) ? { ...m, is_reviewed: true } : m;
      return sample ? { ...next, is_sample: true } : next;
    });
  }, [matches, reviewed, data.properties, data.requirements]);

  const addDeal = useCallback<StoreValue["addDeal"]>((input) => {
    const nowIso = new Date().toISOString();
    const base = { ...input, id: uid("d"), agency_id: seedAgency.id, created_at: nowIso, updated_at: nowIso };
    // El número se calcula afuera del setData para poder devolver el deal completo.
    const number = nextDealNumber(dealsRef.current);
    const deal: Deal = applyDealPatch(
      { ...base, ...dealRoomDefaults(input, actorRef.current, number, nowIso) },
      {},
      actorRef.current,
      { type: "created", title: "Operación iniciada" },
    );
    setData((d) => ({
      ...d,
      deals: [
        {
          ...deal,
          number: Math.max(number, nextDealNumber(d.deals)),
          // Una operación sobre una propiedad o un contacto de ejemplo también es de ejemplo.
          ...([d.properties.find((p) => p.id === input.property_id), d.contacts.find((c) => c.id === input.client_contact_id)].some(isSample)
            ? { is_sample: true }
            : {}),
        },
        ...d.deals,
      ],
      activities: [
        {
          id: uid("a"),
          agency_id: seedAgency.id,
          actor_id: actorRef.current,
          type: "nota" as ActivityType,
          title: `Operación de ${input.kind} iniciada`,
          detail: d.properties.find((p) => p.id === input.property_id)?.title ?? null,
          contact_id: input.client_contact_id,
          property_id: input.property_id,
          opportunity_id: input.opportunity_id,
          created_at: nowIso,
        },
        ...d.activities,
      ],
    }));
    return deal;
  }, []);

  const updateDeal = useCallback<StoreValue["updateDeal"]>((id, patch, event) => {
    setData((d) => ({
      ...d,
      deals: d.deals.map((x) => (x.id === id ? applyDealPatch(x, patch, actorRef.current, event) : x)),
    }));
  }, []);

  const removeDeal = useCallback<StoreValue["removeDeal"]>((id) => {
    setData((d) => ({ ...d, deals: d.deals.filter((x) => x.id !== id) }));
  }, []);

  /** "Usar mis datos reales": saca los ejemplos y lo que depende de ellos. La demo siempre los tiene. */
  const hideSamples = useCallback(() => {
    if (storageKeyRef.current === DEMO_STORAGE_KEY) return;
    setData((d) => stripSamples(d));
  }, []);

  /** "Mostrar ejemplos otra vez": vuelve a agregar la semilla, sin duplicar. */
  const showSamples = useCallback(() => {
    setData((d) => restoreSamples(d, actorRef.current));
  }, []);

  /** Solo este navegador: lo guardado en la base no se toca (al volver a entrar se baja de nuevo). */
  const reset = useCallback(() => {
    stopRemote();
    try {
      localStorage.removeItem(storageKeyRef.current);
    } catch {
      // Storage bloqueado: igual se vuelve a la semilla en memoria.
    }
    setData(seedData());
    setCurrentUserId(null);
  }, [stopRemote]);

  const value = useMemo<StoreValue>(() => {
    const contactIndex = new Map(data.contacts.map((c) => [c.id, c]));
    const propertyIndex = new Map(data.properties.map((p) => [p.id, p]));
    const profileIndex = new Map(data.profiles.map((p) => [p.id, p]));

    return {
      ...data,
      profile,
      currentUserId,
      signIn,
      signUp,
      signInWithGoogle,
      pendingLinkEmail,
      dismissPendingLink,
      enterDemo,
      signOut,
      matches: matchesWithReview,
      contactById: (id) => (id ? contactIndex.get(id) : undefined),
      propertyById: (id) => (id ? propertyIndex.get(id) : undefined),
      profileById: (id) => (id ? profileIndex.get(id) : undefined),
      coverPhoto: (propertyId) => data.photos[propertyId]?.[0] ?? null,
      requirementOf: (contactId) =>
        data.requirements.find((r) => r.contact_id === contactId && r.is_active),
      addProperty,
      updateProperty,
      savePropertyEdit,
      replacePropertyPhotos,
      appAgencyId: agencyContext?.agencyId ?? null,
      publishPropertyToApp,
      addContact,
      updateContact,
      saveRequirement,
      addOpportunity,
      moveOpportunity,
      setOpportunityPriority,
      markOpportunityLost,
      reopenOpportunity,
      createOpportunityFromMatch,
      addEvent,
      updateEvent,
      removeEvent,
      patchEvent,
      applyGcalPatches,
      saveAppVisitFeedback,
      patchAppVisitChecklist,
      updateAgency,
      updateProfile,
      syncAccountEmail,
      logActivity,
      snoozeFollowUp,
      importContacts,
      importProperties,
      undoImport,
      addTask,
      toggleTask,
      removeTask,
      markMatchReviewed,
      respondOffer,
      respondSwipe,
      addDeal,
      updateDeal,
      removeDeal,
      reset,
      persistFailed,
      remoteStatus,
      sessionLoading,
      isDemo: storageKey === DEMO_STORAGE_KEY,
      hideSamples,
      showSamples,
    };
  }, [
    data,
    profile,
    matchesWithReview,
    currentUserId,
    sessionLoading,
    signIn,
    signUp,
    signInWithGoogle,
    pendingLinkEmail,
    dismissPendingLink,
    enterDemo,
    signOut,
    addProperty,
    updateProperty,
    savePropertyEdit,
    replacePropertyPhotos,
    agencyContext,
    publishPropertyToApp,
    addContact,
    updateContact,
    saveRequirement,
    addOpportunity,
    moveOpportunity,
    setOpportunityPriority,
    markOpportunityLost,
    reopenOpportunity,
    createOpportunityFromMatch,
    addEvent,
    updateEvent,
    removeEvent,
    patchEvent,
    applyGcalPatches,
    saveAppVisitFeedback,
    patchAppVisitChecklist,
    updateAgency,
    updateProfile,
    syncAccountEmail,
    logActivity,
    snoozeFollowUp,
    importContacts,
    importProperties,
    undoImport,
    addTask,
    toggleTask,
    removeTask,
    markMatchReviewed,
    respondOffer,
    respondSwipe,
    addDeal,
    updateDeal,
    removeDeal,
    reset,
    persistFailed,
    remoteStatus,
    storageKey,
    hideSamples,
    showSamples,
  ]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore debe usarse dentro de <StoreProvider>");
  return ctx;
}

/** Qué queda escrito en el historial según el tipo de evento agendado. */
const EVENT_ACTIVITY: Record<EventType, ActivityType> = {
  visita: "visita_programada",
  llamada: "llamada",
  reunion: "nota",
  seguimiento: "nota",
  publicacion: "nota",
};

export const STAGE_LABEL: Record<OpportunityStage, string> = {
  nuevos: "Nuevos",
  contactados: "Contactados",
  visita: "Visita programada",
  negociacion: "Negociación",
  cierre: "Cierre",
  perdida: "Perdida",
};
