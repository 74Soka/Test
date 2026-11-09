import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { configSupabase } from "@/lib/env";
import type { Database } from "./database.types";

/** Pages accessibles sans être connecté. */
const PAGES_PUBLIQUES = ["/connexion", "/inscription", "/mot-de-passe-oublie", "/auth", "/api/rappels"];

/**
 * Rafraîchit la session Supabase à chaque requête et renvoie vers la page de
 * connexion si personne n'est connecté.
 */
export async function majSession(requete: NextRequest) {
  let reponse = NextResponse.next({ request: requete });
  const { url, cle } = configSupabase();

  const supabase = createServerClient<Database>(url, cle, {
    cookies: {
      getAll() {
        return requete.cookies.getAll();
      },
      setAll(aEcrire, entetes) {
        aEcrire.forEach(({ name, value }) => requete.cookies.set(name, value));
        reponse = NextResponse.next({ request: requete });
        aEcrire.forEach(({ name, value, options }) => reponse.cookies.set(name, value, options));
        Object.entries(entetes).forEach(([nom, valeur]) => reponse.headers.set(nom, valeur));
      },
    },
  });

  // Ne rien intercaler entre la création du client et getClaims() :
  // c'est cet appel qui rafraîchit la session.
  const { data } = await supabase.auth.getClaims();
  const connecte = Boolean(data?.claims?.sub);
  const chemin = requete.nextUrl.pathname;
  const publique = PAGES_PUBLIQUES.some((p) => chemin === p || chemin.startsWith(`${p}/`));

  if (!connecte && !publique) {
    if (chemin.startsWith("/api/")) {
      return NextResponse.json({ erreur: "Non connecté" }, { status: 401 });
    }
    const destination = requete.nextUrl.clone();
    destination.pathname = "/connexion";
    destination.search = chemin === "/" ? "" : `?suite=${encodeURIComponent(chemin + requete.nextUrl.search)}`;
    const redirection = NextResponse.redirect(destination);
    reponse.cookies.getAll().forEach((c) => redirection.cookies.set(c));
    return redirection;
  }

  return reponse;
}
