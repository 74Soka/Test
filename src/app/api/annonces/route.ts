import { NextResponse, type NextRequest } from "next/server";
import { envoyerAnnonces, JetonRefuse } from "@/lib/notifications/robot";

/**
 * Annonce des paniers de la semaine, programmée à 12 h 30 : appelée par le
 * planificateur de Supabase avec le jeton secret de la base (en-tête x-jeton).
 */
export async function POST(requete: NextRequest) {
  const jeton = requete.headers.get("x-jeton") ?? "";
  if (jeton.length < 40) return NextResponse.json({ erreur: "Accès refusé" }, { status: 403 });
  try {
    return NextResponse.json(await envoyerAnnonces(jeton));
  } catch (e) {
    if (e instanceof JetonRefuse) return NextResponse.json({ erreur: "Accès refusé" }, { status: 403 });
    console.error("Annonce des paniers :", e);
    return NextResponse.json({ erreur: "Annonce impossible" }, { status: 500 });
  }
}
