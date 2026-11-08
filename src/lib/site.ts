import "server-only";
import { headers } from "next/headers";

/**
 * Adresse publique du site (liens des e-mails de confirmation et de mot de
 * passe oublié). SITE_URL si elle est réglée, sinon l'adresse principale
 * fournie par Netlify (URL), sinon l'adresse de la requête. Supabase n'accepte
 * de toute façon que les adresses de sa liste « Redirect URLs ».
 */
export async function origineDuSite(): Promise<string> {
  const reglee = (process.env.SITE_URL || process.env.URL)?.replace(/\/+$/, "");
  if (reglee) return reglee;
  const h = await headers();
  const hote = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const protocole = h.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)/.test(hote) ? "http" : "https");
  return `${protocole}://${hote}`;
}

/** N'accepte que des chemins internes, pour éviter toute redirection vers un autre site. */
export function cheminInterne(chemin: string | null | undefined, parDefaut = "/"): string {
  if (chemin && chemin.startsWith("/") && !chemin.startsWith("//") && !chemin.startsWith("/\\")) return chemin;
  return parDefaut;
}
