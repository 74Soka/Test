import { NextResponse, type NextRequest } from "next/server";
import { envoyerEmailsPonctuels, JetonRefuse } from "@/lib/notifications/robot";

/**
 * E-mails ponctuels aux clients (Brevo), appelés par la base dès qu'un e-mail
 * est déposé, avec le jeton secret de la base (en-tête x-jeton).
 */
export async function POST(requete: NextRequest) {
  const jeton = requete.headers.get("x-jeton") ?? "";
  if (jeton.length < 40) return NextResponse.json({ erreur: "Accès refusé" }, { status: 403 });
  try {
    return NextResponse.json(await envoyerEmailsPonctuels(jeton));
  } catch (e) {
    if (e instanceof JetonRefuse) return NextResponse.json({ erreur: "Accès refusé" }, { status: 403 });
    console.error("E-mails ponctuels :", e);
    return NextResponse.json({ erreur: "Envoi impossible" }, { status: 500 });
  }
}
