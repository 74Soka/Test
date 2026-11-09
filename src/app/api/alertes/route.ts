import { NextResponse, type NextRequest } from "next/server";
import { envoyerAlertesEquipe, JetonRefuse } from "@/lib/notifications/robot";

/**
 * Notifications aux administrateurs, appelées par la base (jeton secret dans
 * l'en-tête x-jeton) juste après une inscription ou une commande en ligne.
 */
export async function POST(requete: NextRequest) {
  const jeton = requete.headers.get("x-jeton") ?? "";
  if (jeton.length < 40) return NextResponse.json({ erreur: "Accès refusé" }, { status: 403 });
  try {
    return NextResponse.json(await envoyerAlertesEquipe(jeton));
  } catch (e) {
    if (e instanceof JetonRefuse) return NextResponse.json({ erreur: "Accès refusé" }, { status: 403 });
    console.error("Alertes équipe :", e);
    return NextResponse.json({ erreur: "Alertes impossibles" }, { status: 500 });
  }
}
