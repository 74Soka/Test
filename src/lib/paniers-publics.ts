import "server-only";
import { z } from "zod";
import { clientSupabase } from "@/lib/supabase/serveur";

/**
 * Contenu de la page publique « Les paniers de la semaine » (sans compte) :
 * uniquement des informations publiques, renvoyées par la base.
 */

/** Numéro pour commander, affiché sur la page publique. */
export const TELEPHONE_COMMANDES = { affiche: "06 25 50 24 87", international: "+33625502487" };
export const INSTAGRAM = { compte: "@fraisetfrancais", url: "https://www.instagram.com/fraisetfrancais/" };

const schema = z.object({
  semaine: z.string().nullable(),
  paniers: z.array(
    z.object({ id: z.string(), nom: z.string(), prix_centimes: z.number(), contenu: z.string().nullable() }),
  ),
  supplements: z.array(z.object({ nom: z.string(), prix_centimes: z.number() })),
  secteurs: z.array(
    z.object({
      nom: z.string(),
      jour: z.number().int().min(1).max(7),
      creneau: z.enum(["matin", "apres_midi", "journee"]),
      communes: z.array(z.string()),
    }),
  ),
  commandes_ouvertes: z.boolean(),
  /** Paniers d'une semaine déjà close aux commandes (affichés jusqu'au dimanche 23 h) */
  semaine_close: z.boolean().optional().default(false),
  cloture_jour: z.number().int().min(1).max(7).nullable(),
  cloture_heure: z.string().nullable(),
  message: z.string().nullable(),
  parrainage_debut: z.string().nullable(),
  recette: z
    .object({
      titre: z.string(),
      infos: z.string().nullable(),
      ingredients: z.string(),
      etapes: z.string(),
      astuce: z.string().nullable(),
    })
    .nullable()
    .optional()
    .transform((r) => r ?? null),
});
export type PaniersPublics = z.infer<typeof schema>;

export async function lirePaniersPublics(): Promise<PaniersPublics> {
  const supabase = await clientSupabase();
  const { data, error } = await supabase.rpc("paniers_publics");
  if (error) throw new Error(error.message);
  return schema.parse(data);
}

export { ligneProduit, lignesComposition } from "@/lib/domaine/produits";
