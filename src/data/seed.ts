/**
 * Datos de arranque.
 *
 * Son los mismos contactos, propiedades y operaciones que traía el prototipo
 * de Figma Make, pero unificados en un solo lugar y tipados con el modelo real.
 * En el prototipo cada pantalla tenía su propio array y no coincidían entre sí:
 * "Camila Torres" era "Sofía Torres" en Matches, "Carolina Méndez" era "Laura
 * Méndez" en Oportunidades, y Juan Pérez buscaba un lote pero le asignaban una
 * casa. Acá hay una sola fuente de verdad.
 *
 * Los scores NO están acá: se calculan en lib/matching.ts a partir de lo que
 * busca cada contacto y de lo que es cada propiedad.
 */

import type {
  Activity,
  Agency,
  AppOffer,
  CalendarEvent,
  Contact,
  ContactRequirement,
  Deal,
  DealCheck,
  DealDocState,
  DealEvent,
  DealParty,
  Opportunity,
  Profile,
  Property,
  Task,
  VisitFeedback,
} from "@/types/db";

const AGENCY_ID = "ag-1";

/** Fechas relativas a hoy, para que la agenda y los feeds nunca queden viejos. */
const now = new Date();
const iso = (daysAgo: number, hour = 10, minute = 0) => {
  const d = new Date(now);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};
/** `YYYY-MM-DD` local a `days` días de hoy (negativo = pasado). */
const dateFromToday = (days: number) => {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Día de esta semana laboral (0 = lunes) a una hora dada. */
const weekday = (dayIndex: number, hour: number, minute = 0) => {
  const d = new Date(now);
  const offset = (d.getDay() + 6) % 7; // 0 = lunes
  d.setDate(d.getDate() - offset + dayIndex);
  d.setHours(Math.floor(hour), minute || (hour % 1) * 60, 0, 0);
  return d.toISOString();
};

export const seedAgency: Agency = {
  id: AGENCY_ID,
  name: "Inmobiliaria PropMatch",
  slug: "propmatch",
  logo_url: null,
  phone: "+54 221 555-0100",
  email: "hola@propmatch.com",
  city: "La Plata",
  province: "Buenos Aires",
  created_at: iso(120),
};

export const seedProfiles: Profile[] = [
  {
    id: "u-1",
    agency_id: AGENCY_ID,
    full_name: "Valen Martínez",
    email: "valen@propmatch.com",
    phone: "+54 221 555-0191",
    avatar_url: null,
    initials: "VM",
    role: "owner",
    is_active: true,
    created_at: iso(120),
  },
  {
    id: "u-2",
    agency_id: AGENCY_ID,
    full_name: "Martina López",
    email: "martina@propmatch.com",
    phone: null,
    avatar_url: null,
    initials: "ML",
    role: "agente",
    is_active: true,
    created_at: iso(90),
  },
  {
    id: "u-3",
    agency_id: AGENCY_ID,
    full_name: "Lucas Soria",
    email: "lucas@propmatch.com",
    phone: null,
    avatar_url: null,
    initials: "LS",
    role: "agente",
    is_active: true,
    created_at: iso(80),
  },
  {
    id: "u-4",
    agency_id: AGENCY_ID,
    full_name: "Sofía Vargas",
    email: "sofia@propmatch.com",
    phone: null,
    avatar_url: null,
    initials: "SV",
    role: "agente",
    is_active: true,
    created_at: iso(60),
  },
  {
    id: "u-5",
    agency_id: AGENCY_ID,
    full_name: "Diego Herrera",
    email: "diego.h@propmatch.com",
    phone: null,
    avatar_url: null,
    initials: "DH",
    role: "agente",
    is_active: true,
    created_at: iso(45),
  },
];

/** El usuario "logueado" mientras no haya backend. */
export const CURRENT_USER_ID = "u-1";

type ContactSeed = Omit<Contact, "agency_id" | "created_at" | "updated_at"> & {
  createdDaysAgo: number;
  updatedDaysAgo: number;
};

const contactSeeds: ContactSeed[] = [
  { id: "c-1", owner_id: "u-1", full_name: "Martín Rodríguez", email: "martin.rodriguez@example.com", phone: "+54 221 555-0101", kind: "comprador", status: "activo", source: "referido", profile_type: "familia", notes: "Busca mudarse antes de fin de año.", createdDaysAgo: 40, updatedDaysAgo: 0 },
  { id: "c-2", owner_id: "u-1", full_name: "Lucía Fernández", email: "lucia.fernandez@example.com", phone: "+54 221 555-0102", kind: "comprador", status: "activo", source: "web", profile_type: "profesional", notes: null, createdDaysAgo: 35, updatedDaysAgo: 1 },
  { id: "c-3", owner_id: "u-2", full_name: "Juan Pérez", email: "juan.perez@example.com", phone: "+54 221 555-0103", kind: "inversor", status: "nuevo", source: "portal", profile_type: "inversor", notes: "Quiere terreno para construir.", createdDaysAgo: 2, updatedDaysAgo: 0 },
  { id: "c-4", owner_id: "u-1", full_name: "Camila Torres", email: "camila.torres@example.com", phone: "+54 221 555-0104", kind: "comprador", status: "visita_programada", source: "referido", profile_type: "familia", notes: null, createdDaysAgo: 28, updatedDaysAgo: 0 },
  { id: "c-5", owner_id: "u-3", full_name: "Roberto Silva", email: "roberto.silva@example.com", phone: "+54 221 555-0105", kind: "comprador", status: "en_seguimiento", source: "manual", profile_type: "primera_vivienda", notes: null, createdDaysAgo: 50, updatedDaysAgo: 3 },
  { id: "c-6", owner_id: "u-2", full_name: "Valentina López", email: "valentina.lopez@example.com", phone: "+54 221 555-0106", kind: "comprador", status: "activo", source: "web", profile_type: "familia", notes: null, createdDaysAgo: 22, updatedDaysAgo: 0 },
  { id: "c-7", owner_id: "u-4", full_name: "Diego Morales", email: "diego.morales@example.com", phone: "+54 221 555-0107", kind: "comprador", status: "nuevo", source: "portal", profile_type: "estudiante", notes: null, createdDaysAgo: 1, updatedDaysAgo: 0 },
  { id: "c-8", owner_id: "u-1", full_name: "Federico Álvarez", email: "federico.alvarez@example.com", phone: "+54 221 555-0108", kind: "comprador", status: "nuevo", source: "web", profile_type: "profesional", notes: null, createdDaysAgo: 0, updatedDaysAgo: 0 },
  { id: "c-9", owner_id: "u-3", full_name: "Laura Méndez", email: "laura.mendez@example.com", phone: "+54 221 555-0109", kind: "comprador", status: "nuevo", source: "referido", profile_type: "familia", notes: null, createdDaysAgo: 0, updatedDaysAgo: 0 },
  { id: "c-10", owner_id: "u-2", full_name: "Pablo Soto", email: "pablo.soto@example.com", phone: "+54 221 555-0110", kind: "inversor", status: "nuevo", source: "portal", profile_type: "inversor", notes: null, createdDaysAgo: 0, updatedDaysAgo: 0 },
  { id: "c-11", owner_id: "u-4", full_name: "Sofía Guerrero", email: "sofia.guerrero@example.com", phone: "+54 221 555-0111", kind: "comprador", status: "en_seguimiento", source: "web", profile_type: "primera_vivienda", notes: null, createdDaysAgo: 12, updatedDaysAgo: 2 },
  { id: "c-12", owner_id: "u-5", full_name: "Ramiro Díaz", email: "ramiro.diaz@example.com", phone: "+54 221 555-0112", kind: "comprador", status: "en_seguimiento", source: "manual", profile_type: "familia", notes: null, createdDaysAgo: 15, updatedDaysAgo: 2 },
  { id: "c-13", owner_id: "u-1", full_name: "Carolina Méndez", email: "carolina.mendez@example.com", phone: "+54 221 555-0113", kind: "comprador", status: "visita_programada", source: "referido", profile_type: "profesional", notes: null, createdDaysAgo: 18, updatedDaysAgo: 3 },
  { id: "c-14", owner_id: "u-3", full_name: "Ana García", email: "ana.garcia@example.com", phone: "+54 221 555-0114", kind: "comprador", status: "activo", source: "web", profile_type: "primera_vivienda", notes: null, createdDaysAgo: 60, updatedDaysAgo: 1 },
  { id: "c-15", owner_id: "u-1", full_name: "Graciela Benítez", email: "graciela.benitez@example.com", phone: "+54 221 555-0115", kind: "propietario", status: "activo", source: "referido", profile_type: null, notes: "Dueña de dos propiedades. Prefiere que le escriban por WhatsApp.", createdDaysAgo: 90, updatedDaysAgo: 10 },
  { id: "c-16", owner_id: "u-2", full_name: "Hernán Castro", email: "hernan.castro@example.com", phone: "+54 221 555-0116", kind: "propietario", status: "activo", source: "manual", profile_type: null, notes: null, createdDaysAgo: 70, updatedDaysAgo: 7 },
  { id: "c-17", owner_id: "u-3", full_name: "Mirta Aguirre", email: null, phone: "+54 221 555-0117", kind: "propietario", status: "en_seguimiento", source: "referido", profile_type: null, notes: "La autorización venció: llamar para renovar.", createdDaysAgo: 200, updatedDaysAgo: 30 },
  { id: "c-18", owner_id: "u-5", full_name: "Oscar Pereyra", email: "oscar.pereyra@example.com", phone: "+54 221 555-0118", kind: "propietario", status: "activo", source: "portal", profile_type: null, notes: null, createdDaysAgo: 45, updatedDaysAgo: 5 },
  { id: "c-19", owner_id: "u-1", full_name: "Alberto Ríos", email: "alberto.rios@example.com", phone: "+54 221 555-0119", kind: "propietario", status: "activo", source: "referido", profile_type: null, notes: "Vende la casa de Gonnet para mudarse a la costa. Firma con su esposa (asentimiento conyugal).", createdDaysAgo: 75, updatedDaysAgo: 2 },
  { id: "c-20", owner_id: "u-4", full_name: "Micaela Ponce", email: "micaela.ponce@example.com", phone: "+54 221 555-0120", kind: "inquilino", status: "visita_programada", source: "portal", profile_type: "estudiante", notes: "Estudiante de Medicina. Garantía: seguro de caución.", createdDaysAgo: 9, updatedDaysAgo: 1 },
  { id: "c-21", owner_id: "u-4", full_name: "Tomás Benedetti", email: "tomas.benedetti@example.com", phone: "+54 221 555-0121", kind: "propietario", status: "activo", source: "manual", profile_type: null, notes: null, createdDaysAgo: 40, updatedDaysAgo: 6 },
];

export const seedContacts: Contact[] = contactSeeds.map((c) => {
  const { createdDaysAgo, updatedDaysAgo, ...rest } = c;
  return {
    ...rest,
    agency_id: AGENCY_ID,
    created_at: iso(createdDaysAgo),
    updated_at: iso(updatedDaysAgo, 14, 42),
  };
});

/**
 * Lo que busca cada contacto. Es la mitad de la ecuación del matching y es la
 * tabla que el prototipo no tenía: guardaba un solo `interest` y una sola
 * `zone` por persona, cuando en la realidad se busca en varias zonas y se
 * aceptan varios tipos.
 */
type ReqSeed = Omit<ContactRequirement, "agency_id" | "created_at" | "updated_at">;

const requirementSeeds: ReqSeed[] = [
  { id: "r-1", contact_id: "c-1", label: "Casa familiar", operation: "venta", property_types: ["casa"], zones: ["City Bell", "Gonnet"], budget_min: 150000, budget_max: 200000, currency: "USD", rooms_min: 4, bedrooms_min: 3, bathrooms_min: 2, surface_min: 150, surface_max: 300, features: ["Cochera", "Jardín"], is_active: true },
  { id: "r-2", contact_id: "c-2", label: "Depto céntrico", operation: "venta", property_types: ["departamento"], zones: ["La Plata Centro"], budget_min: 80000, budget_max: 120000, currency: "USD", rooms_min: 2, bedrooms_min: 2, bathrooms_min: 1, surface_min: 60, surface_max: null, features: ["Balcón", "Amenities"], is_active: true },
  { id: "r-3", contact_id: "c-3", label: "Terreno para construir", operation: "venta", property_types: ["terreno"], zones: ["Gonnet", "City Bell"], budget_min: 50000, budget_max: 80000, currency: "USD", rooms_min: null, bedrooms_min: null, bathrooms_min: null, surface_min: 300, surface_max: null, features: [], is_active: true },
  { id: "r-4", contact_id: "c-4", label: "Casa amplia", operation: "venta", property_types: ["casa"], zones: ["Los Hornos", "Gonnet", "Tolosa"], budget_min: 200000, budget_max: 300000, currency: "USD", rooms_min: 5, bedrooms_min: 4, bathrooms_min: 2, surface_min: 250, surface_max: null, features: ["Pileta", "Parque"], is_active: true },
  { id: "r-5", contact_id: "c-5", label: "PH con terraza", operation: "venta", property_types: ["ph"], zones: ["Berisso", "La Plata Norte"], budget_min: 90000, budget_max: 130000, currency: "USD", rooms_min: 3, bedrooms_min: 2, bathrooms_min: 1, surface_min: 100, surface_max: null, features: ["Terraza", "Parrilla"], is_active: true },
  { id: "r-6", contact_id: "c-6", label: "Casa en zona sur", operation: "venta", property_types: ["casa", "ph"], zones: ["Ensenada", "Tolosa"], budget_min: 120000, budget_max: 180000, currency: "USD", rooms_min: 3, bedrooms_min: 3, bathrooms_min: 2, surface_min: 140, surface_max: null, features: ["Patio"], is_active: true },
  { id: "r-7", contact_id: "c-7", label: "Depto chico", operation: "venta", property_types: ["departamento"], zones: ["La Plata Norte", "La Plata Centro"], budget_min: 60000, budget_max: 90000, currency: "USD", rooms_min: 2, bedrooms_min: 1, bathrooms_min: 1, surface_min: null, surface_max: null, features: ["Luminoso"], is_active: true },
  { id: "r-8", contact_id: "c-8", label: "Primer departamento", operation: "venta", property_types: ["departamento"], zones: ["La Plata Centro"], budget_min: 80000, budget_max: 110000, currency: "USD", rooms_min: 2, bedrooms_min: 2, bathrooms_min: 1, surface_min: null, surface_max: null, features: ["Balcón"], is_active: true },
  { id: "r-9", contact_id: "c-9", label: "Casa con jardín", operation: "venta", property_types: ["casa"], zones: ["Gonnet"], budget_min: 150000, budget_max: 200000, currency: "USD", rooms_min: 4, bedrooms_min: 3, bathrooms_min: 2, surface_min: 180, surface_max: null, features: ["Jardín"], is_active: true },
  { id: "r-10", contact_id: "c-10", label: "Lote de inversión", operation: "venta", property_types: ["terreno"], zones: ["City Bell"], budget_min: 55000, budget_max: 75000, currency: "USD", rooms_min: null, bedrooms_min: null, bathrooms_min: null, surface_min: 250, surface_max: null, features: [], is_active: true },
  { id: "r-11", contact_id: "c-11", label: "PH en Berisso", operation: "venta", property_types: ["ph"], zones: ["Berisso"], budget_min: 110000, budget_max: 140000, currency: "USD", rooms_min: 3, bedrooms_min: 2, bathrooms_min: 1, surface_min: null, surface_max: null, features: ["Terraza"], is_active: true },
  { id: "r-12", contact_id: "c-12", label: "Casa en Tolosa", operation: "venta", property_types: ["casa"], zones: ["Tolosa"], budget_min: 140000, budget_max: 180000, currency: "USD", rooms_min: 4, bedrooms_min: 3, bathrooms_min: 2, surface_min: null, surface_max: null, features: ["Moderna", "Patio"], is_active: true },
  { id: "r-13", contact_id: "c-13", label: "PH La Plata", operation: "venta", property_types: ["ph"], zones: ["La Plata Norte"], budget_min: 110000, budget_max: 145000, currency: "USD", rooms_min: 4, bedrooms_min: 3, bathrooms_min: 2, surface_min: null, surface_max: null, features: ["Terraza", "2 plantas"], is_active: true },
  { id: "r-14", contact_id: "c-14", label: "Depto para estrenar", operation: "venta", property_types: ["departamento"], zones: ["La Plata Centro"], budget_min: 95000, budget_max: 130000, currency: "USD", rooms_min: 3, bedrooms_min: 2, bathrooms_min: 1, surface_min: null, surface_max: null, features: ["Amenities"], is_active: true },
  { id: "r-15", contact_id: "c-20", label: "Alquiler cerca de la facultad", operation: "alquiler", property_types: ["departamento"], zones: ["La Plata Centro", "La Plata Norte"], budget_min: 450000, budget_max: 700000, currency: "ARS", rooms_min: 2, bedrooms_min: 1, bathrooms_min: 1, surface_min: 35, surface_max: null, features: ["Luminoso", "Balcón"], is_active: true },
];

export const seedRequirements: ContactRequirement[] = requirementSeeds.map((r) => ({
  ...r,
  agency_id: AGENCY_ID,
  created_at: iso(30),
  updated_at: iso(2),
}));

type PropSeed = Omit<Property, "agency_id" | "created_at" | "updated_at" | "published_at"> & {
  publishedDaysAgo: number;
};

const propertySeeds: PropSeed[] = [
  { id: "p-1", owner_agent_id: "u-1", owner_contact_id: "c-15", title: "Casa moderna en City Bell", description: "Casa a estrenar con jardín y cochera doble, en una de las mejores zonas de City Bell.", type: "casa", operation: "venta", status: "disponible", street: "Calle 13", street_number: "450", locality: "City Bell", province: "Buenos Aires", zone: "City Bell", lat: null, lng: null, price: 185000, currency: "USD", expenses: null, taxes: 12000, commission_pct: 3, surface_total: 220, surface_covered: 180, rooms: 4, bedrooms: 3, bathrooms: 2, garages: 2, age_years: 0, features: ["Cochera", "Jardín", "A estrenar"], authorization_type: "exclusiva", authorization_expires_at: dateFromToday(12), is_featured: true, published_to_marketplace: false, publishedDaysAgo: 3 },
  { id: "p-2", owner_agent_id: "u-2", owner_contact_id: "c-16", title: "Departamento en el centro", description: "Luminoso, con balcón al frente y amenities en el edificio.", type: "departamento", operation: "venta", status: "disponible", street: "Calle 7", street_number: "1220", locality: "La Plata", province: "Buenos Aires", zone: "La Plata Centro", lat: null, lng: null, price: 95000, currency: "USD", expenses: 45000, taxes: 8000, commission_pct: 3, surface_total: 85, surface_covered: 78, rooms: 3, bedrooms: 2, bathrooms: 1, garages: 0, age_years: 8, features: ["Balcón", "Luminoso", "Amenities"], authorization_type: "no_exclusiva", authorization_expires_at: dateFromToday(75), is_featured: false, published_to_marketplace: false, publishedDaysAgo: 7 },
  { id: "p-3", owner_agent_id: "u-1", owner_contact_id: "c-19", title: "Casa con parque en Gonnet", description: "Gran casa familiar con pileta, parque y quincho con parrilla.", type: "casa", operation: "venta", status: "reservada", street: "Camino Centenario", street_number: "3400", locality: "Gonnet", province: "Buenos Aires", zone: "Gonnet", lat: null, lng: null, price: 230000, currency: "USD", expenses: null, taxes: 18000, commission_pct: 3, surface_total: 310, surface_covered: 240, rooms: 5, bedrooms: 4, bathrooms: 3, garages: 2, age_years: 12, features: ["Pileta", "Parque", "Parrilla"], authorization_type: null, authorization_expires_at: null, is_featured: true, published_to_marketplace: false, publishedDaysAgo: 1 },
  { id: "p-4", owner_agent_id: "u-3", owner_contact_id: "c-17", title: "PH amplio en La Plata Norte", description: "PH de dos plantas con terraza propia y parrilla.", type: "ph", operation: "venta", status: "disponible", street: "Calle 32", street_number: "780", locality: "La Plata", province: "Buenos Aires", zone: "La Plata Norte", lat: null, lng: null, price: 130000, currency: "USD", expenses: null, taxes: 9500, commission_pct: 3, surface_total: 150, surface_covered: 130, rooms: 4, bedrooms: 3, bathrooms: 2, garages: 1, age_years: 20, features: ["Terraza", "Parrilla", "2 plantas"], authorization_type: "exclusiva", authorization_expires_at: dateFromToday(-4), is_featured: false, published_to_marketplace: false, publishedDaysAgo: 14 },
  { id: "p-5", owner_agent_id: "u-4", owner_contact_id: null, title: "Casa de campo en Ringuelet", description: "Gran terreno arbolado con quincho.", type: "casa", operation: "venta", status: "en_revision", street: "Calle 514", street_number: "1100", locality: "Ringuelet", province: "Buenos Aires", zone: "Ringuelet", lat: null, lng: null, price: 148000, currency: "USD", expenses: null, taxes: 7000, commission_pct: 3, surface_total: 180, surface_covered: 120, rooms: 3, bedrooms: 2, bathrooms: 1, garages: 1, age_years: 30, features: ["Gran terreno", "Quincho", "Arboleda"], authorization_type: null, authorization_expires_at: null, is_featured: false, published_to_marketplace: false, publishedDaysAgo: 21 },
  { id: "p-6", owner_agent_id: "u-2", owner_contact_id: "c-15", title: "Casa de diseño en Tolosa", description: "Casa moderna, muy luminosa, con patio.", type: "casa", operation: "venta", status: "disponible", street: "Calle 3", street_number: "530", locality: "Tolosa", province: "Buenos Aires", zone: "Tolosa", lat: null, lng: null, price: 175000, currency: "USD", expenses: null, taxes: 11000, commission_pct: 3, surface_total: 190, surface_covered: 165, rooms: 4, bedrooms: 3, bathrooms: 2, garages: 1, age_years: 3, features: ["Moderna", "Luminoso", "Patio"], authorization_type: "exclusiva", authorization_expires_at: dateFromToday(110), is_featured: false, published_to_marketplace: false, publishedDaysAgo: 5 },
  { id: "p-7", owner_agent_id: "u-1", owner_contact_id: null, title: "Lote en City Bell", description: "Lote plano en zona residencial, listo para construir.", type: "terreno", operation: "venta", status: "disponible", street: "Calle 19", street_number: "890", locality: "City Bell", province: "Buenos Aires", zone: "City Bell", lat: null, lng: null, price: 65000, currency: "USD", expenses: null, taxes: 3000, commission_pct: 4, surface_total: 400, surface_covered: 0, rooms: null, bedrooms: null, bathrooms: null, garages: 0, age_years: null, features: ["Gran terreno"], authorization_type: null, authorization_expires_at: null, is_featured: false, published_to_marketplace: false, publishedDaysAgo: 9 },
  { id: "p-8", owner_agent_id: "u-5", owner_contact_id: "c-18", title: "Casa en Los Hornos", description: "Casa amplia con parque y pileta, ideal para familia numerosa.", type: "casa", operation: "venta", status: "disponible", street: "Calle 66", street_number: "1450", locality: "Los Hornos", province: "Buenos Aires", zone: "Los Hornos", lat: null, lng: null, price: 220000, currency: "USD", expenses: null, taxes: 15000, commission_pct: 3, surface_total: 280, surface_covered: 210, rooms: 5, bedrooms: 4, bathrooms: 3, garages: 2, age_years: 6, features: ["Pileta", "Parque", "Cochera"], authorization_type: "no_exclusiva", authorization_expires_at: dateFromToday(40), is_featured: false, published_to_marketplace: false, publishedDaysAgo: 11 },
  { id: "p-9", owner_agent_id: "u-3", owner_contact_id: null, title: "PH en Berisso", description: "PH reciclado con terraza y parrilla.", type: "ph", operation: "venta", status: "disponible", street: "Calle Montevideo", street_number: "620", locality: "Berisso", province: "Buenos Aires", zone: "Berisso", lat: null, lng: null, price: 128000, currency: "USD", expenses: null, taxes: 8000, commission_pct: 3, surface_total: 135, surface_covered: 115, rooms: 4, bedrooms: 3, bathrooms: 2, garages: 1, age_years: 25, features: ["Terraza", "Parrilla"], authorization_type: null, authorization_expires_at: null, is_featured: false, published_to_marketplace: false, publishedDaysAgo: 17 },
  { id: "p-10", owner_agent_id: "u-2", owner_contact_id: null, title: "Casa en Ensenada", description: "Casa con patio grande y quincho, sobre calle tranquila.", type: "casa", operation: "venta", status: "disponible", street: "Calle La Merced", street_number: "340", locality: "Ensenada", province: "Buenos Aires", zone: "Ensenada", lat: null, lng: null, price: 175000, currency: "USD", expenses: null, taxes: 10000, commission_pct: 3, surface_total: 200, surface_covered: 150, rooms: 4, bedrooms: 3, bathrooms: 2, garages: 1, age_years: 10, features: ["Patio", "Parrilla"], authorization_type: null, authorization_expires_at: null, is_featured: false, published_to_marketplace: false, publishedDaysAgo: 6 },
  { id: "p-11", owner_agent_id: "u-4", owner_contact_id: "c-21", title: "Departamento en La Plata Norte", description: "Dos ambientes muy luminoso, apto profesional.", type: "departamento", operation: "venta", status: "disponible", street: "Calle 44", street_number: "1580", locality: "La Plata", province: "Buenos Aires", zone: "La Plata Norte", lat: null, lng: null, price: 88000, currency: "USD", expenses: 38000, taxes: 6000, commission_pct: 3, surface_total: 55, surface_covered: 52, rooms: 2, bedrooms: 1, bathrooms: 1, garages: 0, age_years: 5, features: ["Luminoso", "Balcón"], authorization_type: null, authorization_expires_at: null, is_featured: false, published_to_marketplace: false, publishedDaysAgo: 4 },
  { id: "p-12", owner_agent_id: "u-1", owner_contact_id: "c-16", title: "Departamento a estrenar en el centro", description: "Tres ambientes con amenities completos y cochera opcional.", type: "departamento", operation: "venta", status: "disponible", street: "Calle 12", street_number: "980", locality: "La Plata", province: "Buenos Aires", zone: "La Plata Centro", lat: null, lng: null, price: 112000, currency: "USD", expenses: 52000, taxes: 9000, commission_pct: 3, surface_total: 95, surface_covered: 88, rooms: 3, bedrooms: 2, bathrooms: 2, garages: 0, age_years: 0, features: ["Amenities", "A estrenar", "Balcón"], authorization_type: "exclusiva", authorization_expires_at: dateFromToday(160), is_featured: true, published_to_marketplace: false, publishedDaysAgo: 2 },
  { id: "p-13", owner_agent_id: "u-4", owner_contact_id: "c-21", title: "Departamento de 2 ambientes en alquiler frente a Plaza Moreno", description: "", type: "departamento", operation: "alquiler", status: "disponible", street: "Calle 14", street_number: "860", locality: "La Plata", province: "Buenos Aires", zone: "La Plata Centro", lat: null, lng: null, price: 620000, currency: "ARS", expenses: 85000, taxes: null, commission_pct: 4.15, surface_total: 48, surface_covered: 44, rooms: 2, bedrooms: 1, bathrooms: 1, garages: 0, age_years: 15, features: ["Luminoso", "Balcón", "Ascensor"], authorization_type: "no_exclusiva", authorization_expires_at: dateFromToday(60), is_featured: false, published_to_marketplace: false, publishedDaysAgo: 8 },
  { id: "p-14", owner_agent_id: "u-1", owner_contact_id: "c-15", title: "Casa en City Bell con pileta, quincho y jardín", description: "", type: "casa", operation: "venta", status: "disponible", street: "Calle 476", street_number: "1830", locality: "City Bell", province: "Buenos Aires", zone: "City Bell", lat: null, lng: null, price: 198000, currency: "USD", expenses: null, taxes: 14000, commission_pct: 3, surface_total: 600, surface_covered: 190, rooms: 5, bedrooms: 3, bathrooms: 2, garages: 2, age_years: 9, features: ["Cochera", "Jardín", "Piscina", "Parrilla"], authorization_type: "exclusiva", authorization_expires_at: dateFromToday(95), is_featured: true, published_to_marketplace: false, publishedDaysAgo: 4 },
];

/**
 * Ficha completa de la semilla: descripción larga, pin en el mapa y los datos
 * "de CRM" del alta (subtipo, toilettes, orientación, piso…), para que el
 * índice de calidad y el diagnóstico tengan con qué trabajar. p-5 y p-9 quedan
 * a propósito sin coordenadas: así el diagnóstico muestra qué falta.
 */
const propertyDetails: Record<string, Partial<Property>> = {
  "p-1": { lat: -34.8691, lng: -58.0452, subtype: "Chalet", toilettes: 1, surface_semicovered: 20, orientation: "N", layout: "frente", credit_eligible: true, accepts_swap: false, reserve_min_price: 176000, reserve_min_currency: "USD", keys_custody: true,
    description: "Casa a estrenar con jardín y cochera doble, en una de las mejores zonas de City Bell. Living comedor con ventanales al jardín, cocina integrada con isla, tres dormitorios (uno en suite) y galería con parrilla. Apta crédito." },
  "p-2": { lat: -34.9187, lng: -57.9511, subtype: "Departamento", floor: "6", unit: "A", orientation: "NE", layout: "frente", expenses_currency: "ARS", credit_eligible: true, keys_custody: true,
    description: "Departamento de tres ambientes muy luminoso, con balcón al frente sobre calle 7. Edificio con amenities: SUM, gimnasio y terraza con parrilla. Cocina separada con lavadero, dos dormitorios con placard. A metros de todo." },
  "p-3": { lat: -34.8801, lng: -58.0201, subtype: "Casa quinta", toilettes: 1, surface_uncovered: 70, orientation: "N", layout: "frente", accepts_swap: true, reserve_min_price: 220000, reserve_min_currency: "USD", keys_custody: true,
    description: "Gran casa familiar sobre Camino Centenario con pileta, parque arbolado y quincho con parrilla. Cuatro dormitorios, tres baños, escritorio y cochera para dos autos. Reservada: la firma del boleto está en curso." },
  "p-4": { lat: -34.9061, lng: -57.9622, subtype: "PH en 2 plantas", toilettes: 1, orientation: "SE", layout: "contrafrente",
    description: "PH de dos plantas al contrafrente, sin expensas, con terraza propia y parrilla. Planta baja con living comedor y cocina; arriba tres dormitorios y dos baños. Cochera cubierta. La autorización venció: falta renovarla." },
  "p-5": { subtype: "Casa quinta", orientation: "O",
    description: "Casa de campo en Ringuelet sobre un gran terreno arbolado, con quincho, galería y huerta. Dos dormitorios, un baño y cocina comedor amplia. Ideal fin de semana o vivienda permanente a minutos del centro de La Plata." },
  "p-6": { lat: -34.8979, lng: -57.9731, subtype: "Casa", toilettes: 1, orientation: "N", layout: "frente", credit_eligible: true, keys_custody: false,
    description: "Casa de diseño en Tolosa, muy luminosa, con patio y parrilla. Planta abierta con doble altura, tres dormitorios, dos baños y cochera. Terminaciones de primera, aberturas de aluminio con DVH y calefacción por losa radiante." },
  "p-7": { lat: -34.8712, lng: -58.0398, subtype: "Lote", orientation: "N",
    description: "Lote plano de 400 m² en zona residencial de City Bell, listo para construir. Todos los servicios en la cuadra: agua, luz, gas y cloacas. Calle asfaltada, a tres cuadras del centro comercial de Cantilo. Escritura inmediata." },
  "p-8": { lat: -34.9594, lng: -57.9952, subtype: "Chalet", toilettes: 1, surface_semicovered: 25, orientation: "NE", layout: "frente", credit_eligible: true,
    description: "Casa amplia en Los Hornos con parque y pileta, ideal para familia numerosa. Cuatro dormitorios, tres baños, quincho cerrado y cochera para dos autos. Sobre lote de 20 x 35, a dos cuadras de avenida 137." },
  "p-9": { subtype: "PH", orientation: "S", layout: "interno",
    description: "PH reciclado en Berisso con terraza y parrilla. Tres dormitorios, dos baños, patio interno y cochera. Instalaciones nuevas de gas y electricidad, pisos de porcelanato. Sin expensas. Cerca de la calle Nueva York." },
  "p-10": { lat: -34.8641, lng: -57.9103, subtype: "Casa", orientation: "NO", layout: "frente", credit_eligible: false,
    description: "Casa en Ensenada con patio grande y quincho, sobre calle tranquila. Living comedor, cocina con desayunador, tres dormitorios y dos baños. Cochera cubierta para un auto. A cinco minutos de la autopista y del centro de Ensenada." },
  "p-11": { lat: -34.9089, lng: -57.9583, subtype: "Departamento", floor: "3", unit: "C", orientation: "N", layout: "frente", expenses_currency: "ARS", credit_eligible: true,
    description: "Departamento de dos ambientes muy luminoso en La Plata Norte, apto profesional. Balcón al frente, cocina integrada y baño completo. Edificio de cinco años con ascensor y laundry. Ideal primera vivienda o inversión para renta." },
  "p-12": { lat: -34.9221, lng: -57.9476, subtype: "Departamento", floor: "9", unit: "B", orientation: "NE", layout: "frente", expenses_currency: "ARS", credit_eligible: true, keys_custody: true,
    description: "Departamento a estrenar de tres ambientes con amenities completos: pileta, gimnasio, SUM y seguridad 24 hs. Dos dormitorios, dos baños, balcón corrido con parrilla y cochera opcional. Entrega inmediata, apto crédito." },
  "p-13": { lat: -34.9213, lng: -57.9549, subtype: "Departamento", floor: "4", unit: "B", orientation: "N", layout: "frente", expenses_currency: "ARS", keys_custody: true,
    description: "Departamento de dos ambientes frente a Plaza Moreno, ideal estudiantes o profesionales. Balcón a la calle, cocina separada, dormitorio con placard y baño completo. Edificio con ascensor. Contrato por 24 meses con ajuste trimestral." },
  "p-14": { lat: -34.8655, lng: -58.0521, subtype: "Chalet", toilettes: 1, surface_semicovered: 30, orientation: "N", layout: "frente", credit_eligible: true, reserve_min_price: 189000, reserve_min_currency: "USD",
    description: "Casa en City Bell sobre lote de 600 m² con pileta, quincho y jardín parquizado. Tres dormitorios (uno en suite), dos baños más toilette, cocina con isla y living con hogar a leña. Cochera doble. A cuatro cuadras de Cantilo." },
};

export const seedProperties: Property[] = propertySeeds.map((p) => {
  const { publishedDaysAgo, ...rest } = p;
  return {
    ...rest,
    ...propertyDetails[p.id],
    agency_id: AGENCY_ID,
    published_at: iso(publishedDaysAgo),
    created_at: iso(publishedDaysAgo),
    updated_at: iso(Math.max(0, publishedDaysAgo - 1)),
  };
});

/**
 * Foto de ejemplo local: un degradé con el nombre del ambiente, en SVG. No
 * depende de ningún sitio externo y queda claro que no es una foto real.
 */
function samplePhoto(label: string, from: string, to: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>` +
    `<rect width="640" height="400" fill="url(#g)"/>` +
    `<path d="M270 215 L320 172 L370 215 V272 H270 Z" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="8" stroke-linejoin="round"/>` +
    `<text x="320" y="330" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="700" fill="#fff">${label}</text>` +
    `<text x="320" y="362" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="16" fill="#fff" fill-opacity=".85">Foto de ejemplo</text>` +
    `</svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

const ROOM_PHOTOS = [
  samplePhoto("Living", "#9B21FF", "#FF5ECA"),
  samplePhoto("Cocina", "#A855FF", "#FF7ED5"),
  samplePhoto("Dormitorio", "#7C0BD8", "#A855FF"),
  samplePhoto("Exterior", "#A855FF", "#FF5ECA"),
];

/**
 * Fotos. La portada de las propiedades del prototipo sigue siendo la misma
 * URL de Unsplash que ya usaba la semilla; el resto son fotos de ejemplo
 * locales (SVG) para llegar al mínimo de 5 que pide el diagnóstico.
 * Nunca se suben a ningún lado: las propiedades de ejemplo no se sincronizan.
 */
const COVERS: Record<string, string> = {
  "p-1": "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=640&h=400&fit=crop&auto=format",
  "p-2": "https://images.unsplash.com/photo-1564078516393-cf04bd966897?w=640&h=400&fit=crop&auto=format",
  "p-3": "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=640&h=400&fit=crop&auto=format",
  "p-4": "https://images.unsplash.com/photo-1628592102751-ba83b0314276?w=640&h=400&fit=crop&auto=format",
  "p-5": "https://images.unsplash.com/photo-1706408126103-51d1241ecf0d?w=640&h=400&fit=crop&auto=format",
  "p-6": "https://images.unsplash.com/photo-1633354747567-e0682586f082?w=640&h=400&fit=crop&auto=format",
  "p-7": "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=640&h=400&fit=crop&auto=format",
  "p-8": "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=640&h=400&fit=crop&auto=format",
  "p-9": "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=640&h=400&fit=crop&auto=format",
  "p-10": "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=640&h=400&fit=crop&auto=format",
  "p-11": "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=640&h=400&fit=crop&auto=format",
  "p-12": "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=640&h=400&fit=crop&auto=format",
  "p-13": samplePhoto("Departamento", "#9B21FF", "#A855FF"),
  "p-14": samplePhoto("Casa con pileta", "#7C0BD8", "#FF5ECA"),
};

/** El lote (p-7) solo tiene la portada y p-9 se queda corto a propósito: el diagnóstico lo marca. */
export const seedPhotos: Record<string, string[]> = Object.fromEntries(
  Object.entries(COVERS).map(([id, cover]) => [
    id,
    id === "p-7" ? [cover] : id === "p-9" ? [cover, ROOM_PHOTOS[0]] : [cover, ...ROOM_PHOTOS],
  ]),
);

type OppSeed = Omit<Opportunity, "agency_id" | "created_at" | "updated_at" | "stage_since"> & {
  stageDaysAgo: number;
};

const opportunitySeeds: OppSeed[] = [
  { id: "o-1", contact_id: "c-8", property_id: "p-12", match_id: null, owner_id: "u-1", stage: "nuevos", value: 112000, currency: "USD", is_priority: false, priority_note: null, closed_at: null, stageDaysAgo: 0 },
  { id: "o-2", contact_id: "c-9", property_id: "p-3", match_id: null, owner_id: "u-3", stage: "nuevos", value: 180000, currency: "USD", is_priority: false, priority_note: null, closed_at: null, stageDaysAgo: 0 },
  { id: "o-3", contact_id: "c-10", property_id: "p-7", match_id: null, owner_id: "u-2", stage: "nuevos", value: 65000, currency: "USD", is_priority: false, priority_note: null, closed_at: null, stageDaysAgo: 0 },
  { id: "o-4", contact_id: "c-7", property_id: "p-11", match_id: null, owner_id: "u-4", stage: "contactados", value: 88000, currency: "USD", is_priority: false, priority_note: null, closed_at: null, stageDaysAgo: 1 },
  { id: "o-5", contact_id: "c-11", property_id: "p-9", match_id: null, owner_id: "u-4", stage: "contactados", value: 128000, currency: "USD", is_priority: false, priority_note: null, closed_at: null, stageDaysAgo: 2 },
  { id: "o-6", contact_id: "c-12", property_id: "p-6", match_id: null, owner_id: "u-5", stage: "contactados", value: 175000, currency: "USD", is_priority: false, priority_note: null, closed_at: null, stageDaysAgo: 2 },
  { id: "o-7", contact_id: "c-1", property_id: "p-1", match_id: null, owner_id: "u-1", stage: "visita", value: 185000, currency: "USD", is_priority: true, priority_note: "Visita pendiente de confirmación", closed_at: null, stageDaysAgo: 1 },
  { id: "o-8", contact_id: "c-6", property_id: "p-10", match_id: null, owner_id: "u-2", stage: "visita", value: 175000, currency: "USD", is_priority: false, priority_note: null, closed_at: null, stageDaysAgo: 1 },
  { id: "o-9", contact_id: "c-13", property_id: "p-4", match_id: null, owner_id: "u-1", stage: "visita", value: 130000, currency: "USD", is_priority: false, priority_note: null, closed_at: null, stageDaysAgo: 3 },
  { id: "o-10", contact_id: "c-2", property_id: "p-2", match_id: null, owner_id: "u-1", stage: "negociacion", value: 95000, currency: "USD", is_priority: true, priority_note: "Esperando respuesta del cliente", closed_at: null, stageDaysAgo: 2 },
  { id: "o-11", contact_id: "c-5", property_id: "p-9", match_id: null, owner_id: "u-3", stage: "negociacion", value: 128000, currency: "USD", is_priority: false, priority_note: null, closed_at: null, stageDaysAgo: 4 },
  { id: "o-12", contact_id: "c-4", property_id: "p-8", match_id: null, owner_id: "u-1", stage: "negociacion", value: 220000, currency: "USD", is_priority: false, priority_note: null, closed_at: null, stageDaysAgo: 5 },
  { id: "o-13", contact_id: "c-3", property_id: "p-7", match_id: null, owner_id: "u-2", stage: "cierre", value: 65000, currency: "USD", is_priority: false, priority_note: null, closed_at: iso(1), stageDaysAgo: 1 },
  { id: "o-14", contact_id: "c-14", property_id: "p-12", match_id: null, owner_id: "u-3", stage: "cierre", value: 112000, currency: "USD", is_priority: false, priority_note: null, closed_at: iso(2), stageDaysAgo: 2 },
  { id: "o-15", contact_id: "c-4", property_id: "p-3", match_id: null, owner_id: "u-1", stage: "cierre", value: 225000, currency: "USD", is_priority: true, priority_note: "Firma de boleto la semana que viene", closed_at: iso(9), stageDaysAgo: 9 },
  { id: "o-16", contact_id: "c-11", property_id: null, match_id: null, owner_id: "u-4", stage: "cierre", value: 98000, currency: "USD", is_priority: false, priority_note: null, closed_at: iso(24), stageDaysAgo: 24 },
  { id: "o-17", contact_id: "c-6", property_id: "p-8", match_id: null, owner_id: "u-2", stage: "perdida", value: 220000, currency: "USD", is_priority: false, priority_note: "Se le fue de presupuesto: busca hasta USD 180.000", closed_at: iso(12), stageDaysAgo: 12 },
  { id: "o-18", contact_id: "c-20", property_id: "p-13", match_id: null, owner_id: "u-4", stage: "negociacion", value: 620000, currency: "ARS", is_priority: false, priority_note: null, closed_at: null, stageDaysAgo: 2 },
  { id: "o-19", contact_id: "c-1", property_id: "p-14", match_id: null, owner_id: "u-1", stage: "contactados", value: 198000, currency: "USD", is_priority: false, priority_note: null, closed_at: null, stageDaysAgo: 1 },
];

export const seedOpportunities: Opportunity[] = opportunitySeeds.map((o) => {
  const { stageDaysAgo, ...rest } = o;
  return {
    ...rest,
    agency_id: AGENCY_ID,
    stage_since: iso(stageDaysAgo),
    created_at: iso(stageDaysAgo + 5),
    updated_at: iso(stageDaysAgo),
  };
});

export const seedActivities: Activity[] = [
  { id: "a-1", agency_id: AGENCY_ID, actor_id: "u-1", type: "contacto_creado", title: "Nuevo contacto agregado", detail: "Federico Álvarez", contact_id: "c-8", property_id: null, opportunity_id: null, created_at: iso(0, new Date().getHours(), Math.max(0, new Date().getMinutes() - 20)) },
  { id: "a-2", agency_id: AGENCY_ID, actor_id: "u-2", type: "propiedad_publicada", title: "Propiedad publicada", detail: "Casa en Los Hornos", contact_id: null, property_id: "p-8", opportunity_id: null, created_at: iso(0, Math.max(0, new Date().getHours() - 1)) },
  { id: "a-3", agency_id: AGENCY_ID, actor_id: "u-1", type: "visita_programada", title: "Visita programada", detail: "Martín Rodríguez — City Bell", contact_id: "c-1", property_id: "p-1", opportunity_id: "o-7", created_at: iso(0, Math.max(0, new Date().getHours() - 3)) },
  { id: "a-4", agency_id: AGENCY_ID, actor_id: null, type: "match_creado", title: "Nuevo match encontrado", detail: "Lucía Fernández + Depto. en el centro", contact_id: "c-2", property_id: "p-2", opportunity_id: null, created_at: iso(0, Math.max(0, new Date().getHours() - 5)) },
  { id: "a-5", agency_id: AGENCY_ID, actor_id: "u-1", type: "contacto_actualizado", title: "Contacto actualizado", detail: "Carolina Méndez", contact_id: "c-13", property_id: null, opportunity_id: null, created_at: iso(1, 16, 42) },
  { id: "a-6", agency_id: AGENCY_ID, actor_id: "u-2", type: "etapa_avanzada", title: "Juan pasó a cierre", detail: "Lote en City Bell", contact_id: "c-3", property_id: "p-7", opportunity_id: "o-13", created_at: iso(1, 11, 15) },
  { id: "a-7", agency_id: AGENCY_ID, actor_id: "u-3", type: "llamada", title: "Roberto respondió el mensaje", detail: "PH en Berisso", contact_id: "c-5", property_id: "p-9", opportunity_id: "o-11", created_at: iso(2, 9, 30) },
  { id: "a-8", agency_id: AGENCY_ID, actor_id: null, type: "nota", title: "Oferta recibida", detail: "Departamento en el centro — USD 90.000", contact_id: "c-2", property_id: "p-2", opportunity_id: "o-10", created_at: iso(1, 19, 5), app_offer_id: "sample-of-1", offer_status: "pending" },
  { id: "a-9", agency_id: AGENCY_ID, actor_id: null, type: "nota", title: "Oferta recibida", detail: "Casa con parque en Gonnet — USD 225.000", contact_id: "c-4", property_id: "p-3", opportunity_id: "o-15", created_at: iso(14, 18, 20), app_offer_id: "sample-of-2", offer_status: "accepted" },
  { id: "a-10", agency_id: AGENCY_ID, actor_id: null, type: "nota", title: "Oferta recibida", detail: "PH en Berisso — USD 112.000", contact_id: "c-5", property_id: "p-9", opportunity_id: "o-11", created_at: iso(6, 12, 40), app_offer_id: "sample-of-3", offer_status: "rejected" },
  { id: "a-11", agency_id: AGENCY_ID, actor_id: "u-1", type: "etapa_avanzada", title: "Camila pasó a cierre", detail: "Casa con parque en Gonnet — reserva firmada", contact_id: "c-4", property_id: "p-3", opportunity_id: "o-15", created_at: iso(9, 17, 0) },
  { id: "a-12", agency_id: AGENCY_ID, actor_id: "u-4", type: "visita_programada", title: "Visita programada", detail: "Micaela Ponce — Depto. Plaza Moreno", contact_id: "c-20", property_id: "p-13", opportunity_id: "o-18", created_at: iso(2, 10, 10) },
  { id: "a-13", agency_id: AGENCY_ID, actor_id: "u-2", type: "mensaje", title: "WhatsApp enviado", detail: "Valentina López — alternativas en Tolosa", contact_id: "c-6", property_id: null, opportunity_id: null, created_at: iso(3, 12, 15) },
  { id: "a-14", agency_id: AGENCY_ID, actor_id: "u-1", type: "propiedad_publicada", title: "Propiedad publicada", detail: "Casa en City Bell con pileta, quincho y jardín", contact_id: null, property_id: "p-14", opportunity_id: null, created_at: iso(4, 9, 0) },
];

/** Visitas: el estado depende de si ya pasaron, así nunca hay una "por confirmar" en el pasado. */
const visitState = (startsAt: string, past: Partial<CalendarEvent>, future: Partial<CalendarEvent>): Partial<CalendarEvent> =>
  new Date(startsAt) < now ? past : future;

const done = (interest: "alto" | "medio" | "descarto", next: VisitFeedback["next_action"], notes: string, daysAgo = 0): Partial<CalendarEvent> => ({
  status: "realizada",
  feedback: { happened: "si", interest, next_action: next, notes, saved_at: iso(daysAgo, 20) },
  checklist: { reminder_sent_at: iso(daysAgo + 1, 18), location_sent_at: iso(daysAgo, 8, 30) },
});
const noShow = (daysAgo = 0): Partial<CalendarEvent> => ({
  status: "no_show",
  feedback: { happened: "no_show", interest: null, next_action: "otra", notes: "No vino ni avisó. Reprogramar por WhatsApp.", saved_at: iso(daysAgo, 20) },
  checklist: { reminder_sent_at: iso(daysAgo + 1, 18) },
});
const confirmed: Partial<CalendarEvent> = { status: "confirmada", checklist: { reminder_sent_at: iso(0, 9), location_sent_at: iso(0, 9, 5) } };
const toConfirm: Partial<CalendarEvent> = { status: "por_confirmar" };

type EventSeed = Omit<CalendarEvent, "agency_id" | "created_at"> & { extra?: Partial<CalendarEvent> };

const eventSeeds: EventSeed[] = [
  // Esta semana
  { id: "e-1", owner_id: "u-1", type: "visita", title: "Casa en City Bell", contact_id: "c-1", property_id: "p-1", opportunity_id: "o-7", starts_at: weekday(0, 10), ends_at: weekday(0, 11, 30), notes: null,
    extra: visitState(weekday(0, 10), done("alto", "segunda_visita", "Le encantó el jardín. Quiere volver con la familia el fin de semana."), confirmed) },
  { id: "e-2", owner_id: "u-1", type: "llamada", title: "Seguimiento", contact_id: "c-2", property_id: null, opportunity_id: "o-10", starts_at: weekday(0, 14, 30), ends_at: weekday(0, 15), notes: null },
  { id: "e-3", owner_id: "u-1", type: "visita", title: "Depto. en La Plata", contact_id: "c-2", property_id: "p-2", opportunity_id: "o-10", starts_at: weekday(0, 17), ends_at: weekday(0, 18), notes: null,
    extra: visitState(weekday(0, 17), done("medio", "carta_oferta", "Le gustó pero las expensas le parecen altas. Va a ofertar."), toConfirm) },
  { id: "e-4", owner_id: "u-1", type: "reunion", title: "Reunión de equipo", contact_id: null, property_id: null, opportunity_id: null, starts_at: weekday(1, 9), ends_at: weekday(1, 10), notes: null },
  { id: "e-5", owner_id: "u-1", type: "llamada", title: "Consulta de presupuesto", contact_id: "c-4", property_id: null, opportunity_id: null, starts_at: weekday(1, 11, 30), ends_at: weekday(1, 12), notes: null },
  { id: "e-6", owner_id: "u-1", type: "visita", title: "Casa en Gonnet", contact_id: "c-9", property_id: "p-3", opportunity_id: "o-2", starts_at: weekday(1, 15), ends_at: weekday(1, 16, 30), notes: null,
    extra: visitState(weekday(1, 15), noShow(), confirmed) },
  { id: "e-7", owner_id: "u-1", type: "seguimiento", title: "Contacto inicial", contact_id: "c-8", property_id: null, opportunity_id: "o-1", starts_at: weekday(2, 10), ends_at: weekday(2, 10, 30), notes: null },
  { id: "e-8", owner_id: "u-1", type: "visita", title: "PH en La Plata Norte", contact_id: "c-13", property_id: "p-4", opportunity_id: "o-9", starts_at: weekday(2, 16), ends_at: weekday(2, 17), notes: null,
    extra: visitState(weekday(2, 16), done("alto", "carta_oferta", "Pidió los planos y el valor de las expensas. Prepara oferta."), toConfirm) },
  { id: "e-9", owner_id: "u-1", type: "llamada", title: "Confirmación de oferta", contact_id: "c-5", property_id: null, opportunity_id: "o-11", starts_at: weekday(3, 9, 30), ends_at: weekday(3, 10), notes: null },
  { id: "e-10", owner_id: "u-1", type: "reunion", title: "Reunión con propietario", contact_id: "c-15", property_id: "p-1", opportunity_id: null, starts_at: weekday(3, 13), ends_at: weekday(3, 14), notes: null },
  { id: "e-11", owner_id: "u-1", type: "visita", title: "Casa en Tolosa", contact_id: "c-12", property_id: "p-6", opportunity_id: "o-6", starts_at: weekday(3, 18), ends_at: weekday(3, 19, 30), notes: null,
    extra: visitState(weekday(3, 18), done("descarto", "enviar_alternativas", "Le queda lejos del colegio de los chicos. Mandarle opciones en City Bell."), confirmed) },
  { id: "e-12", owner_id: "u-1", type: "seguimiento", title: "Revisión del pipeline", contact_id: null, property_id: null, opportunity_id: null, starts_at: weekday(4, 10), ends_at: weekday(4, 10, 30), notes: null },
  { id: "e-13", owner_id: "u-1", type: "llamada", title: "Propuesta de compra", contact_id: "c-9", property_id: null, opportunity_id: "o-2", starts_at: weekday(4, 14), ends_at: weekday(4, 14, 30), notes: null },
  // Días pasados (siempre en el pasado, sea el día que sea)
  { id: "e-14", owner_id: "u-2", type: "visita", title: "Casa en Ensenada", contact_id: "c-6", property_id: "p-10", opportunity_id: "o-8", starts_at: iso(5, 11), ends_at: iso(5, 12), notes: null,
    extra: done("alto", "segunda_visita", "Vino con el marido. Quieren ver el estado del techo con un arquitecto.", 5) },
  { id: "e-15", owner_id: "u-4", type: "visita", title: "PH en Berisso", contact_id: "c-11", property_id: "p-9", opportunity_id: "o-5", starts_at: iso(3, 17), ends_at: iso(3, 18), notes: null, extra: noShow(3) },
  // Semana que viene
  { id: "e-16", owner_id: "u-1", type: "visita", title: "Departamento a estrenar en el centro", contact_id: "c-8", property_id: "p-12", opportunity_id: "o-1", starts_at: weekday(7, 11), ends_at: weekday(7, 12), notes: "Primera visita. Llevar folleto de amenities.", extra: toConfirm },
  { id: "e-17", owner_id: "u-4", type: "visita", title: "Departamento en La Plata Norte", contact_id: "c-7", property_id: "p-11", opportunity_id: "o-4", starts_at: weekday(8, 16), ends_at: weekday(8, 16, 45), notes: null, extra: confirmed },
  { id: "e-18", owner_id: "u-1", type: "reunion", title: "Firma de boleto — Casa con parque en Gonnet", contact_id: "c-4", property_id: "p-3", opportunity_id: "o-15", starts_at: weekday(9, 12), ends_at: weekday(9, 13, 30), notes: "Escribanía Ferreyra. Llevar recibos de reserva y refuerzo." },
  { id: "e-19", owner_id: "u-3", type: "llamada", title: "Renovar autorización del PH", contact_id: "c-17", property_id: "p-4", opportunity_id: null, starts_at: weekday(10, 10), ends_at: weekday(10, 10, 30), notes: null },
  { id: "e-20", owner_id: "u-1", type: "visita", title: "Segunda visita — Casa en City Bell", contact_id: "c-1", property_id: "p-14", opportunity_id: "o-19", starts_at: weekday(11, 15), ends_at: weekday(11, 16), notes: null, extra: toConfirm },
  { id: "e-21", owner_id: "u-4", type: "visita", title: "Depto. frente a Plaza Moreno", contact_id: "c-20", property_id: "p-13", opportunity_id: "o-18", starts_at: weekday(8, 18, 30), ends_at: weekday(8, 19), notes: "Viene con la madre (garante).", extra: confirmed },
];

export const seedEvents: CalendarEvent[] = eventSeeds.map(({ extra, ...e }) => ({
  ...e,
  agency_id: AGENCY_ID,
  created_at: iso(6),
  ...(e.type === "visita" ? { status: "por_confirmar" as const } : {}),
  ...extra,
}));

export const seedTasks: Task[] = [
  { id: "t-1", agency_id: AGENCY_ID, owner_id: "u-1", text: "Confirmar visita con Martín Rodríguez", is_priority: true, is_done: false, due_date: null, contact_id: "c-1", created_at: iso(1) },
  { id: "t-2", agency_id: AGENCY_ID, owner_id: "u-1", text: "Enviar propiedades a Lucía Fernández", is_priority: false, is_done: false, due_date: null, contact_id: "c-2", created_at: iso(1) },
  { id: "t-3", agency_id: AGENCY_ID, owner_id: "u-1", text: "Contactar nuevo lead — Federico Álvarez", is_priority: false, is_done: false, due_date: null, contact_id: "c-8", created_at: iso(0) },
  { id: "t-4", agency_id: AGENCY_ID, owner_id: "u-1", text: "Actualizar fichas de propiedades", is_priority: false, is_done: false, due_date: null, contact_id: null, created_at: iso(2) },
  { id: "t-5", agency_id: AGENCY_ID, owner_id: "u-1", text: "Pedir asentimiento conyugal a Alberto Ríos (boleto de Gonnet)", is_priority: true, is_done: false, due_date: dateFromToday(2), contact_id: "c-19", created_at: iso(3) },
  { id: "t-6", agency_id: AGENCY_ID, owner_id: "u-1", text: "Responder la oferta de Lucía por el depto. del centro", is_priority: true, is_done: false, due_date: dateFromToday(0), contact_id: "c-2", created_at: iso(1) },
  { id: "t-7", agency_id: AGENCY_ID, owner_id: "u-3", text: "Llamar a Mirta Aguirre para renovar la autorización", is_priority: false, is_done: false, due_date: dateFromToday(3), contact_id: "c-17", created_at: iso(4) },
  { id: "t-8", agency_id: AGENCY_ID, owner_id: "u-4", text: "Pedir recibos de sueldo a Micaela Ponce", is_priority: false, is_done: true, due_date: dateFromToday(-1), contact_id: "c-20", created_at: iso(5) },
];

/**
 * Ofertas de ejemplo. Viven en `appOffers` porque es donde las lee toda la
 * app (Dashboard, Ofertas, ficha, diagnóstico), pero su `app_offer_id` es
 * inventado (`sample-of-N`): `respondOffer` las resuelve SOLO en el navegador.
 * La aceptada es la que originó la operación de la casa de Gonnet (d-1).
 */
export const seedOffers: AppOffer[] = [
  { id: "of-1", app_offer_id: "sample-of-1", contact_id: "c-2", property_id: "p-2", amount_usd: 90000, status: "pending", created_at: iso(1, 19, 5) },
  { id: "of-2", app_offer_id: "sample-of-2", contact_id: "c-4", property_id: "p-3", amount_usd: 225000, status: "accepted", created_at: iso(14, 18, 20) },
  { id: "of-3", app_offer_id: "sample-of-3", contact_id: "c-5", property_id: "p-9", amount_usd: 112000, status: "rejected", created_at: iso(6, 12, 40) },
];

/* ── Operaciones (deal room) ─────────────────────────────────────────────── */

const check = (daysAgo: number, by: string, note: string | null = null): DealCheck => ({ done: true, at: iso(daysAgo, 12), by, note });
const doc = (status: DealDocState["status"], daysAgo: number | null, by: string | null, expires_at: string | null = null): DealDocState => ({
  done: status === "recibido" || status === "validado",
  at: daysAgo === null ? null : iso(daysAgo, 11),
  by,
  note: null,
  status,
  expires_at,
  validated_by: status === "validado" ? by : null,
});
const dealEvent = (n: number, type: DealEvent["type"], title: string, detail: string | null, actor: string | null, daysAgo: number, hour = 12): DealEvent => ({
  id: `de-sample-${n}`, type, title, detail, actor_id: actor, created_at: iso(daysAgo, hour),
});
const party = (p: Partial<DealParty>): DealParty => ({ name: "", dni: "", cuit: "", civil_status: "", nationality: "", address: "", phone: "", email: "", ...p });
/** Fecha `YYYY-MM-DD` de un día de la semana relativo a esta (7 = lunes que viene). */
const weekdayDate = (dayIndex: number) => weekday(dayIndex, 12).slice(0, 10);

export const seedDeals: Deal[] = [
  {
    id: "d-1",
    agency_id: AGENCY_ID,
    kind: "venta",
    status: "en_curso",
    opportunity_id: "o-15",
    property_id: "p-3",
    client_contact_id: "c-4",
    owner_contact_id: "c-19",
    client: party({ name: "Camila Torres", dni: "30.555.104", cuit: "27-30555104-1", civil_status: "Casada", nationality: "Argentina", address: "Calle 50 N° 1234, La Plata", phone: "+54 221 555-0104", email: "camila.torres@example.com" }),
    owner: party({ name: "Alberto Ríos", dni: "14.555.119", cuit: "20-14555119-3", civil_status: "Casado", nationality: "Argentina", address: "Camino Centenario 3400, Gonnet", phone: "+54 221 555-0119", email: "alberto.rios@example.com" }),
    guarantor: party({}),
    price: 225000,
    currency: "USD",
    commission_pct: 3,
    reserva_amount: 5000,
    reserva_valid_until: weekdayDate(9),
    boleto_advance_pct: 30,
    escritura_date: dateFromToday(45),
    escribano: "Esc. Paula Ferreyra (Registro 312)",
    contract_months: null,
    start_date: null,
    deposit_months: null,
    update_rule: "",
    destination: "Vivienda familiar",
    steps: {
      autorizacion: check(60, "u-1", "Exclusiva por 120 días"),
      docs_inmueble: check(40, "u-3"),
      publicacion: check(30, "u-1"),
      oferta: check(14, "u-1", "USD 225.000, 30% al boleto y saldo en la escritura"),
      reserva: check(12, "u-1", "Señal de USD 5.000"),
      aceptacion: check(11, "u-1", "Aceptó tras contraoferta de USD 228.000"),
      titulos: check(4, "u-3", "Sin observaciones"),
    },
    docs: {
      v_dni: doc("validado", 20, "u-3"),
      v_cuil: doc("validado", 20, "u-3"),
      v_estado: doc("recibido", 10, "u-1"),
      v_asentimiento: doc("pendiente", null, null),
      v_cbu: doc("recibido", 6, "u-1"),
      i_escritura: doc("validado", 38, "u-3"),
      i_plano: doc("recibido", 30, "u-3"),
      i_partida: doc("validado", 30, "u-3"),
      i_abl: doc("recibido", 30, "u-3", dateFromToday(-3)),
      i_agua: doc("validado", 15, "u-3"),
      c_dni: doc("validado", 12, "u-1"),
      c_cuil: doc("recibido", 12, "u-1"),
      c_fondos: doc("pendiente", null, null),
      o_autorizacion: doc("validado", 60, "u-1"),
      o_reserva: doc("validado", 12, "u-1"),
      o_recibo_reserva: doc("validado", 12, "u-1"),
      o_boleto: doc("pendiente", null, null),
    },
    notes: "El comprador paga el 30% al boleto con la venta de su departamento. Escritura con la escribanía que eligió el comprador.",
    created_at: iso(14, 18, 30),
    updated_at: iso(2),
    number: 1,
    stage: "contrato",
    stage_since: iso(4, 12),
    created_by: "u-1",
    responsible_id: "u-1",
    co_agent_id: "u-3",
    expected_close_date: dateFromToday(45),
    signing_date: weekdayDate(9),
    escribano_phone: "+54 221 555-0190",
    escribano_email: "escribania.ferreyra@example.com",
    signatures: {},
    payments: [
      { id: "pay-sample-1", concept: "reserva", amount: 5000, currency: "USD", paid_at: dateFromToday(-12), receipt_text: "Recibo 0001-00000412", notes: "Efectivo en la oficina", created_by: "u-1", created_at: iso(12, 13) },
      { id: "pay-sample-2", concept: "refuerzo", amount: 10000, currency: "USD", paid_at: dateFromToday(-5), receipt_text: "Recibo 0001-00000419", notes: "Transferencia", created_by: "u-1", created_at: iso(5, 15) },
    ],
    commission: {
      buyer_mode: "percent",
      buyer_value: 3,
      seller_mode: "percent",
      seller_value: 3,
      expenses: 450,
      splits: [
        { user_id: "u-1", share_pct: 70 },
        { user_id: "u-3", share_pct: 30 },
      ],
    },
    event_ids: ["e-18"],
    events: [
      dealEvent(1, "created", "Operación iniciada", "Desde la oferta aceptada de USD 225.000", "u-1", 14, 18),
      dealEvent(2, "step", "Oferta del comprador recibida", "USD 225.000", "u-1", 14, 18),
      dealEvent(3, "payment", "Pago registrado: Reserva", "USD 5.000 — Recibo 0001-00000412", "u-1", 12, 13),
      dealEvent(4, "step", "Reserva firmada y señal recibida", null, "u-1", 12, 13),
      dealEvent(5, "stage_changed", "Etapa: Negociación → Reserva", null, "u-1", 12, 13),
      dealEvent(6, "step", "Propietario aceptó la oferta", "Tras contraoferta de USD 228.000", "u-1", 11, 10),
      dealEvent(7, "stage_changed", "Etapa: Reserva → Documentación", null, "u-1", 11, 10),
      dealEvent(8, "document", "Documento validado: Escritura / título de propiedad", null, "u-3", 10, 16),
      dealEvent(9, "payment", "Pago registrado: Refuerzo", "USD 10.000 — Recibo 0001-00000419", "u-1", 5, 15),
      dealEvent(10, "step", "Estudio de títulos por el escribano", "Sin observaciones", "u-3", 4, 12),
      dealEvent(11, "stage_changed", "Etapa: Documentación → Boleto", null, "u-3", 4, 12),
      dealEvent(12, "calendar", "Firma de boleto agendada", null, "u-1", 3, 11),
      dealEvent(13, "note", "Falta el asentimiento conyugal del vendedor", null, "u-1", 2, 17),
    ],
  },
  {
    id: "d-2",
    agency_id: AGENCY_ID,
    kind: "alquiler",
    status: "en_curso",
    opportunity_id: "o-18",
    property_id: "p-13",
    client_contact_id: "c-20",
    owner_contact_id: "c-21",
    client: party({ name: "Micaela Ponce", dni: "42.555.120", nationality: "Argentina", civil_status: "Soltera", phone: "+54 221 555-0120", email: "micaela.ponce@example.com" }),
    owner: party({ name: "Tomás Benedetti", dni: "25.555.121", phone: "+54 221 555-0121", email: "tomas.benedetti@example.com" }),
    guarantor: party({ name: "Seguro de caución (a definir)" }),
    price: 620000,
    currency: "ARS",
    commission_pct: 4.15,
    reserva_amount: 300000,
    reserva_valid_until: dateFromToday(7),
    boleto_advance_pct: null,
    escritura_date: null,
    escribano: "",
    contract_months: 24,
    start_date: dateFromToday(20),
    deposit_months: 1,
    update_rule: "Trimestral por ICL",
    destination: "Vivienda",
    steps: {
      autorizacion: check(8, "u-4"),
      publicacion: check(8, "u-4"),
      visita: check(4, "u-4"),
      oferta: check(3, "u-4", "Acepta el precio publicado"),
      reserva: check(2, "u-4", "Reserva de $300.000"),
    },
    docs: {
      p_dni: doc("validado", 8, "u-4"),
      p_titulo: doc("recibido", 8, "u-4"),
      t_dni: doc("validado", 2, "u-4"),
      t_recibos: doc("recibido", 1, "u-4"),
      t_informe: doc("pendiente", null, null),
    },
    notes: "",
    created_at: iso(3, 15),
    updated_at: iso(1),
    number: 2,
    stage: "documentacion",
    stage_since: iso(2, 12),
    created_by: "u-4",
    responsible_id: "u-4",
    co_agent_id: null,
    expected_close_date: dateFromToday(15),
    signing_date: dateFromToday(14),
    escribano_phone: "",
    escribano_email: "",
    signatures: {},
    payments: [
      { id: "pay-sample-3", concept: "reserva", amount: 300000, currency: "ARS", paid_at: dateFromToday(-2), receipt_text: "Recibo 0001-00000421", notes: "", created_by: "u-4", created_at: iso(2, 12) },
    ],
    commission: { buyer_mode: "percent", buyer_value: 4.15, seller_mode: "percent", seller_value: 0, expenses: 0, splits: [{ user_id: "u-4", share_pct: 100 }] },
    event_ids: [],
    events: [
      dealEvent(21, "created", "Operación iniciada", null, "u-4", 3, 15),
      dealEvent(22, "step", "Oferta del interesado aceptada por el propietario", null, "u-4", 3, 15),
      dealEvent(23, "payment", "Pago registrado: Reserva", "$300.000 — Recibo 0001-00000421", "u-4", 2, 12),
      dealEvent(24, "stage_changed", "Etapa: Reserva → Documentación", null, "u-4", 2, 12),
    ],
  },
];

/**
 * Amenities. El matching compara estos textos tal cual (matching.ts,
 * scoreFeatures): renombrar uno rompe los requerimientos ya guardados. Solo
 * se agregan al final.
 */
export const FEATURE_CHIPS = [
  "Jardín", "Balcón", "Cochera", "Piscina", "Terraza",
  "Seguridad", "Mascotas", "Parrilla", "Luminoso",
  "Gimnasio", "Solarium", "SUM", "Lavadero", "Aire acondicionado",
  "Seguridad 24 hs", "Ascensor", "Placards", "Apto profesional",
];

export const ZONES = [
  "City Bell", "Gonnet", "La Plata Centro", "La Plata Norte",
  "Tolosa", "Los Hornos", "Ringuelet", "Berisso", "Ensenada",
];
