/** Variables d'environnement publiques de Supabase, avec un message clair si elles manquent. */
export function configSupabase(): { url: string; cle: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !cle) {
    throw new Error(
      "Configuration Supabase manquante : renseignez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY dans .env.local (voir .env.example).",
    );
  }
  return { url, cle };
}
