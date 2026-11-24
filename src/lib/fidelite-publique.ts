import "server-only";
import { z } from "zod";
import { clientSupabase } from "@/lib/supabase/serveur";

/**
 * Règles publiques du parrainage et des graines (page fraisetfrancais.fr/parrainage),
 * lues dans les réglages : la page suit tout changement fait dans Réglages → Fidélité.
 */
const schema = z.object({
  graines_bienvenue: z.number().int(),
  graines_parrainage: z.number().int(),
  graines_par_commande_filleul: z.number().int(),
  filleuls_vip: z.number().int(),
  filleuls_ultra: z.number().int(),
  filleuls_livres_seulement: z.boolean(),
  cadeaux_debut: z.string().nullable(),
  paniers: z.array(z.object({ nom: z.string(), prix_centimes: z.number().int(), graines: z.number().int() })),
  recompenses: z.array(
    z.object({
      nom: z.string(),
      description: z.string().nullable(),
      graines: z.number().int(),
      niveau: z.enum(["standard", "vip", "ultra"]),
      type: z.enum(["tampons", "bienvenue_filleul", "cadeau_parrain"]),
    }),
  ),
});
export type FidelitePublique = z.infer<typeof schema>;

export async function lireFidelitePublique(): Promise<FidelitePublique> {
  const supabase = await clientSupabase();
  const { data, error } = await supabase.rpc("fidelite_publique");
  if (error) throw new Error(error.message);
  return schema.parse(data);
}
