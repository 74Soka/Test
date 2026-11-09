import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { envoyerRappels, JetonRefuse, momentDuRappel } from "@/lib/notifications/robot";

/**
 * Rappels « n'oubliez pas de commander », appelés chaque heure du jeudi par le
 * planificateur de Supabase avec le jeton secret de la base (en-tête x-jeton).
 * Seuls les appels de 12 h et 18 h (heure de Paris) envoient quelque chose.
 */
export async function POST(requete: NextRequest) {
  const jeton = requete.headers.get("x-jeton") ?? "";
  if (jeton.length < 40) return NextResponse.json({ erreur: "Accès refusé" }, { status: 403 });

  // Moment imposé (essais) ou déduit de l'heure ; le jeton reste exigé
  const corps = await requete.json().catch(() => ({}));
  const impose = z.object({ moment: z.enum(["midi", "soir"]) }).safeParse(corps);
  const moment = impose.success ? impose.data.moment : momentDuRappel();
  if (!moment) return NextResponse.json({ moment: null, rappels: 0 });

  try {
    return NextResponse.json({ moment, ...(await envoyerRappels(jeton, moment)) });
  } catch (e) {
    if (e instanceof JetonRefuse) return NextResponse.json({ erreur: "Accès refusé" }, { status: 403 });
    console.error("Rappels :", e);
    return NextResponse.json({ erreur: "Rappels impossibles" }, { status: 500 });
  }
}
