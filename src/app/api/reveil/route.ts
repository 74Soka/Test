import { NextResponse } from "next/server";

/**
 * Réveil du serveur : appelé toutes les 5 minutes en journée par le
 * planificateur de Supabase, pour que le serveur de Netlify ne s'endorme pas
 * (sinon la première visite attend plusieurs secondes). Ne lit rien.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
