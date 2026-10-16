import { useEffect, useId, useMemo, useState } from "react";
import { useStore } from "@/data/store";
import { buildSharedListing, listingUrl } from "@/lib/share";
import { whatsappLink } from "@/lib/whatsapp";
import { useAgencyBrand } from "@/lib/branding";
import { previewUrl, sitePropertyUrl, siteUrl } from "@/features/sitio/siteUrl";
import type { Contact } from "@/types/db";

const INK = "#1A1A1A";
const SOFT = "#6B7280";
const firstName = (full: string | undefined) => (full ?? "").trim().split(/\s+/)[0] ?? "";

/**
 * «Mandar mi web»: arma el mensaje (WhatsApp o mail) con el link de la web de
 * la inmobiliaria o de una propiedad. Si la propiedad no está en la web
 * (sin sincronizar) o la cuenta no tiene web pública (demo), manda la ficha
 * para clientes, que funciona en cualquier lado.
 */
export function SendMyWebButton({ contact, variant = "secondary" }: { contact?: Contact; variant?: "secondary" | "primary" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={variant === "primary" ? "flex-1 min-h-[44px] px-4 rounded-xl text-sm text-white" : "flex items-center gap-2 px-4 py-2 rounded-xl text-sm border transition-all hover:border-violet-300"}
        style={
          variant === "primary"
            ? { background: "var(--gradient-brand)", fontWeight: 700 }
            : { borderColor: "#E9E5DE", background: "white", color: "#9B21FF", fontWeight: 600 }
        }
      >
        Mandar mi web
      </button>
      {open && <SendMyWebModal contact={contact} onClose={() => setOpen(false)} />}
    </>
  );
}

export function SendMyWebModal({ contact, onClose }: { contact?: Contact; onClose: () => void }) {
  const { agency, properties, photos, profileById, profile } = useStore();
  const brand = useAgencyBrand();
  const id = useId();
  const site = siteUrl(agency);
  const available = useMemo(() => properties.filter((p) => p.status === "disponible"), [properties]);
  const [what, setWhat] = useState<string>("web");
  const [link, setLink] = useState<string>(site ?? `${window.location.origin}${previewUrl()}`);
  const [kindOfLink, setKindOfLink] = useState<"web" | "propiedad-web" | "ficha" | "vista-previa">(site ? "web" : "vista-previa");
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);
  const [msg, setMsg] = useState("");

  const property = what === "web" ? null : available.find((p) => p.id === what) ?? null;

  // Link según lo elegido.
  useEffect(() => {
    let alive = true;
    if (!property) {
      setLink(site ?? `${window.location.origin}${previewUrl()}`);
      setKindOfLink(site ? "web" : "vista-previa");
      return;
    }
    const onWeb = sitePropertyUrl(agency, property.app_property_id);
    if (onWeb) {
      setLink(onWeb);
      setKindOfLink("propiedad-web");
      return;
    }
    listingUrl(buildSharedListing(property, photos[property.id] ?? [], agency, profileById(property.owner_agent_id) ?? profile)).then((u) => {
      if (!alive) return;
      setLink(u);
      setKindOfLink("ficha");
    });
    return () => {
      alive = false;
    };
  }, [property, site, agency, photos, profileById, profile]);

  // Mensaje sugerido (hasta que el agente lo edite).
  useEffect(() => {
    if (touched) return;
    const hola = contact ? `Hola ${firstName(contact.full_name)}!` : "Hola!";
    setText(
      property
        ? `${hola} Te comparto esta propiedad de ${brand.name}: ${property.title}.\n${link}`
        : `${hola} Te comparto la web de ${brand.name}, con todas nuestras propiedades disponibles:\n${link}\nCualquier consulta, escribime por acá.`,
    );
  }, [property, link, contact, brand.name, touched]);

  const flash = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(""), 3000);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      flash("Mensaje copiado");
    } catch {
      flash("No pudimos copiar: seleccioná el texto y copialo a mano");
    }
  };
  const subject = property ? `${property.title} · ${brand.name}` : `Propiedades de ${brand.name}`;
  const mailto = `mailto:${contact?.email ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(8, 11, 31,0.4)" }} role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto" style={{ boxShadow: "var(--shadow-pop)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={`${id}-t`} className="text-base" style={{ color: INK, fontWeight: 800 }}>
              Mandar mi web{contact ? ` a ${firstName(contact.full_name)}` : ""}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: SOFT }}>
              Elegí qué mandar y por dónde. El mensaje lo podés cambiar.
            </p>
          </div>
          <button onClick={onClose} className="text-sm px-2" style={{ color: SOFT }} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <label className="block text-xs mt-4" style={{ color: "#6B7280", fontWeight: 600 }}>
          Qué mandar
          <select value={what} onChange={(e) => setWhat(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-xl text-sm border bg-white" style={{ borderColor: "#E9E5DE", color: INK }}>
            <option value="web">Mi web (todas las propiedades)</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs mt-1.5" style={{ color: kindOfLink === "vista-previa" ? "#B45309" : SOFT }}>
          {kindOfLink === "web" && "Link de tu web pública."}
          {kindOfLink === "propiedad-web" && "Link de la propiedad en tu web."}
          {kindOfLink === "ficha" && "Esta propiedad no está en tu web (sin sincronizar o sin web pública): va la ficha para clientes, con tu marca."}
          {kindOfLink === "vista-previa" &&
            "Tu web pública se activa con la cuenta de tu inmobiliaria. Este link es la vista previa y solo se ve en este navegador: para clientes, mandá una propiedad (va su ficha)."}
        </p>

        <label className="block text-xs mt-3" style={{ color: "#6B7280", fontWeight: 600 }}>
          Mensaje
          <textarea
            value={text}
            onChange={(e) => {
              setTouched(true);
              setText(e.target.value);
            }}
            rows={5}
            className="mt-1 w-full px-3 py-2 rounded-xl text-sm border bg-white"
            style={{ borderColor: "#E9E5DE", color: INK }}
          />
        </label>

        <div className="flex flex-wrap gap-2 mt-3">
          <a
            href={whatsappLink(contact?.phone ?? null, text)}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[44px] px-4 rounded-xl text-sm inline-flex items-center"
            style={{ background: "#25D366", color: "#063B2A", fontWeight: 700 }}
          >
            {contact?.phone ? "Mandar por WhatsApp" : "Elegir chat en WhatsApp"}
          </a>
          <a href={mailto} className="min-h-[44px] px-4 rounded-xl text-sm border bg-white inline-flex items-center" style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 700 }}>
            Mandar por mail
          </a>
          <button onClick={copy} className="min-h-[44px] px-4 rounded-xl text-sm border bg-white" style={{ borderColor: "#DDD8CF", color: "#7C0BD8", fontWeight: 700 }}>
            Copiar mensaje
          </button>
        </div>
        <p role="status" aria-live="polite" className="text-xs mt-2" style={{ color: "#15803D", fontWeight: 600 }}>
          {msg}
        </p>
      </div>
    </div>
  );
}
