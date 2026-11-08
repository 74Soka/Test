import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { cheminInterne } from "@/lib/site";
import { clientSupabase } from "@/lib/supabase/serveur";

const TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/**
 * Arrivée depuis un lien d'e-mail (confirmation d'adresse, mot de passe oublié).
 * - ?token_hash=…&type=… : modèles d'e-mail conseillés (marche sur tout appareil) ;
 * - ?code=… : modèles par défaut de Supabase (même navigateur que la demande).
 * Puis direction `suite` (chemin interne).
 */
export async function GET(requete: NextRequest) {
  const params = requete.nextUrl.searchParams;
  const suite = cheminInterne(params.get("suite") ?? params.get("next"), "/");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const code = params.get("code");

  const supabase = await clientSupabase();
  let ok = false;
  if (tokenHash && type && TYPES.includes(type)) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }

  redirect(ok ? suite : "/connexion?message=lien");
}
