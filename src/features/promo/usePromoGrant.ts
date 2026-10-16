import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { readPromoGrant, type PromoGrant } from "../../../shared/promo";

/**
 * El beneficio de la promo de lanzamiento de la cuenta logueada, si lo tiene
 * (api/saas.ts lo guarda en la metadata del usuario al registrarse). Lee la
 * sesión local, sin ir a la red. En la demo no hay sesión → null.
 */
export function usePromoGrant(): PromoGrant | null {
  const [grant, setGrant] = useState<PromoGrant | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!cancelled) setGrant(readPromoGrant(data.session?.user.user_metadata));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return grant;
}
