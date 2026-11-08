import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { utilisateurCourant } from "@/lib/auth";
import { calculerTrajet } from "@/lib/tournees";

const demande = z.object({
  points: z
    .array(z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }))
    .min(2)
    .max(102),
});

/**
 * Itinéraire en voiture d'une tournée, pour la carte et les temps entre arrêts.
 * POST /api/trajet { points: [{ lat, lng }, …] } (départ, arrêts dans l'ordre, retour)
 * Passer par le serveur garde la clé OpenRouteService secrète.
 */
export async function POST(requete: NextRequest) {
  const utilisateur = await utilisateurCourant();
  if (utilisateur?.role !== "admin" && utilisateur?.role !== "livreur") {
    return NextResponse.json({ erreur: "Accès refusé" }, { status: 403 });
  }
  const donnees = demande.safeParse(await requete.json().catch(() => null));
  if (!donnees.success) return NextResponse.json({ erreur: "Demande invalide" }, { status: 400 });
  return NextResponse.json(await calculerTrajet(donnees.data.points));
}
