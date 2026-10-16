import { useEffect, useRef, useState } from "react";
import { useStore } from "@/data/store";
import { supabase } from "@/lib/supabase";
import { readEmailChangeHash } from "@/lib/accountAuth";

/**
 * Vuelta del link de "cambiar email" (Configuración → Mi cuenta).
 *
 * Mismo patrón que `PasswordRecovery`: la URL se lee al cargar el módulo,
 * antes de que supabase-js la limpie (`#access_token=...&type=email_change`).
 * Además escucha `onAuthStateChange`: si la sesión trae otro email que el del
 * perfil (USER_UPDATED, o el refresh de token tras confirmar en otra pestaña),
 * actualiza el perfil local y avisa.
 */
const linkResult = typeof window !== "undefined" ? readEmailChangeHash(window.location.hash) : null;

type Notice =
  | { kind: "changed"; email: string }
  | { kind: "partial" }
  | { kind: "error"; expired: boolean };

export function EmailChangeNotice() {
  const { currentUserId, sessionLoading, isDemo, profile, syncAccountEmail } = useStore();
  const [notice, setNotice] = useState<Notice | null>(null);
  const handledLink = useRef(false);
  const userIdRef = useRef(currentUserId);
  userIdRef.current = isDemo ? null : currentUserId;
  const profileEmailRef = useRef(profile.email);
  profileEmailRef.current = profile.email;

  // El link del mail: se resuelve una vez que se sabe si hay sesión.
  useEffect(() => {
    if (!linkResult || handledLink.current || sessionLoading) return;
    handledLink.current = true;

    if (linkResult.kind === "changed") {
      if (!currentUserId || isDemo) return;
      supabase.auth.getUser().then(({ data }) => {
        const email = data.user?.email;
        if (!email) return;
        syncAccountEmail(email);
        setNotice({ kind: "changed", email });
      });
      return;
    }

    // supabase-js no toca estos hashes: se limpian para que no queden en la URL.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (linkResult.kind === "partial") setNotice({ kind: "partial" });
    // Sin sesión, el error del link lo muestra el login.
    else if (currentUserId && !isDemo) setNotice(linkResult);
  }, [sessionLoading, currentUserId, isDemo, syncAccountEmail]);

  // Cambios de la sesión mientras el CRM está abierto.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "USER_UPDATED" && event !== "TOKEN_REFRESHED" && event !== "SIGNED_IN") return;
      const user = session?.user;
      if (!user?.email || user.id !== userIdRef.current) return;
      const prev = profileEmailRef.current;
      if (!prev || prev.toLowerCase() === user.email.toLowerCase()) return;
      syncAccountEmail(user.email);
      setNotice({ kind: "changed", email: user.email });
    });
    return () => data.subscription.unsubscribe();
  }, [syncAccountEmail]);

  if (!notice) return null;

  const { title, text } =
    notice.kind === "changed"
      ? { title: `Tu email ahora es ${notice.email}`, text: "La próxima vez entrá con este email." }
      : notice.kind === "partial"
        ? {
            title: "Falta un paso para cambiar tu email",
            text: "Confirmaste uno de los links. Abrí también el que te mandamos a la otra dirección: el cambio se aplica cuando confirmes los dos.",
          }
        : {
            title: notice.expired ? "El link para cambiar el email venció" : "No se pudo confirmar el cambio de email",
            text: "Pedí el cambio de nuevo desde Configuración → Mi cuenta.",
          };

  return (
    <div className="fixed top-4 inset-x-4 z-[90] flex justify-center pointer-events-none">
      <div
        role="status"
        className="pointer-events-auto w-full max-w-md rounded-2xl px-5 py-4 text-white flex items-start gap-3"
        style={{ background: notice.kind === "error" ? "#9F1239" : "#1A1A1A", boxShadow: "var(--shadow-pop)" }}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm break-words" style={{ fontWeight: 700 }}>
            {notice.kind === "changed" ? "✓ " : ""}
            {title}
          </p>
          <p className="text-xs mt-1" style={{ opacity: 0.85 }}>
            {text}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setNotice(null)}
          aria-label="Cerrar aviso"
          className="text-sm px-2 rounded-lg hover:bg-white/10"
          style={{ fontWeight: 700 }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
