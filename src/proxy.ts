import type { NextRequest } from "next/server";
import { majSession } from "@/lib/supabase/proxy";

export async function proxy(requete: NextRequest) {
  return majSession(requete);
}

export const config = {
  matcher: [
    // Tout sauf les fichiers statiques, les icônes et le manifeste
    "/((?!_next/static|_next/image|icon.svg|apple-touch-icon.png|icone-.*\\.png|manifest.webmanifest|robots.txt).*)",
  ],
};
