import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { configSupabase } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Client Supabase côté serveur (Server Components, Server Actions, Route Handlers).
 * Il agit avec la session de l'utilisateur connecté : la RLS s'applique.
 */
export async function clientSupabase() {
  const { url, cle } = configSupabase();
  const magasin = await cookies();

  return createServerClient<Database>(url, cle, {
    cookies: {
      getAll() {
        return magasin.getAll();
      },
      setAll(aEcrire) {
        try {
          aEcrire.forEach(({ name, value, options }) => magasin.set(name, value, options));
        } catch {
          // Appel depuis un Server Component : les cookies sont rafraîchis par le proxy.
        }
      },
    },
  });
}
