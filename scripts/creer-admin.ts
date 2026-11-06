/**
 * Crée (ou met à jour) un compte et lui donne un rôle.
 *
 *   npm run creer-admin -- prenom@exemple.fr "mot de passe solide"
 *   npm run creer-admin -- livreur@exemple.fr "mot de passe" livreur
 *
 * Utilise la clé secrète Supabase (SUPABASE_SECRET_KEY dans .env.local),
 * qui ne doit jamais être exposée dans l'application.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function principal() {
  const [email, motDePasse, role = "admin"] = process.argv.slice(2);
  if (!email || !motDePasse || !["admin", "livreur"].includes(role)) {
    console.error('Usage : npm run creer-admin -- <email> "<mot de passe>" [admin|livreur]');
    process.exit(1);
  }
  if (motDePasse.length < 10) {
    console.error("Choisissez un mot de passe d'au moins 10 caractères.");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cleSecrete = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cleSecrete) {
    console.error("Renseignez NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SECRET_KEY dans .env.local.");
    process.exit(1);
  }

  const supabase = createClient<Database>(url, cleSecrete, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Compte existant ?
  let userId: string | undefined;
  for (let page = 1; !userId; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    userId = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
    if (data.users.length < 200) break;
  }

  if (userId) {
    const { error } = await supabase.auth.admin.updateUserById(userId, { password: motDePasse });
    if (error) throw error;
    console.log(`Compte existant : mot de passe mis à jour pour ${email}.`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: motDePasse,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;
    console.log(`Compte créé pour ${email}.`);
  }

  const { error } = await supabase
    .from("profils")
    .upsert({ id: userId, role: role as "admin" | "livreur" }, { onConflict: "id" });
  if (error) throw error;
  console.log(`Rôle « ${role} » attribué. Vous pouvez vous connecter.`);
}

principal().catch((e) => {
  console.error("Échec :", e instanceof Error ? e.message : e);
  process.exit(1);
});
