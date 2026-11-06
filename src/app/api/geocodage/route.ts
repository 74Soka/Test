import { NextResponse, type NextRequest } from "next/server";
import { utilisateurCourant } from "@/lib/auth";
import { ErreurGeocodage, geocodeur, type Proximite } from "@/lib/geocodage";

/**
 * Recherche d'adresses ou de communes pour les formulaires.
 * GET /api/geocodage?q=12 rue…&type=adresse|commune[&lat=…&lng=…]
 * Passer par le serveur garde le fournisseur interchangeable et réservé aux comptes connectés.
 */
export async function GET(requete: NextRequest) {
  const utilisateur = await utilisateurCourant();
  if (utilisateur?.role !== "admin") {
    return NextResponse.json({ erreur: "Accès refusé" }, { status: 403 });
  }

  const params = requete.nextUrl.searchParams;
  const texte = (params.get("q") ?? "").slice(0, 200);
  const type = params.get("type") === "commune" ? "commune" : "adresse";
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  const proche: Proximite | undefined =
    params.has("lat") && params.has("lng") && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;

  try {
    const resultats =
      type === "commune"
        ? await geocodeur.rechercherCommunes(texte, { proche })
        : await geocodeur.rechercherAdresses(texte, { proche });
    return NextResponse.json({ resultats });
  } catch (e) {
    const message = e instanceof ErreurGeocodage ? e.message : "Recherche d'adresse impossible.";
    console.error("Géocodage :", e);
    return NextResponse.json({ erreur: message }, { status: 502 });
  }
}
