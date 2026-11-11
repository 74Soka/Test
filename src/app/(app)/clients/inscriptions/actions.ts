"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigerAdmin } from "@/lib/auth";
import { emailCompteValide, envoyerAuClient } from "@/lib/emails";
import { TELEPHONE_COMMANDES } from "@/lib/paniers-publics";
import { origineDuSite } from "@/lib/site";
import { messageErreur, type Resultat } from "@/lib/erreurs";
import { clientSupabase } from "@/lib/supabase/serveur";

const schema = z.object({
  userId: z.uuid(),
  secteurId: z.uuid().nullable(),
  clientId: z.uuid().nullable(),
  parrainId: z.uuid().nullable(),
});

/** Valide une inscription : nouvelle fiche (secteur choisi) ou fiche existante. */
export async function validerInscription(donnees: z.input<typeof schema>): Promise<Resultat> {
  await exigerAdmin();
  const saisie = schema.safeParse(donnees);
  if (!saisie.success) return { ok: false, erreur: "Choix invalide." };
  const d = saisie.data;
  if (!d.clientId && !d.secteurId) return { ok: false, erreur: "Choisissez le secteur du client." };
  const supabase = await clientSupabase();
  const { data: inscription } = await supabase
    .from("inscriptions")
    .select("email, prenom")
    .eq("user_id", d.userId)
    .maybeSingle();
  const { error } = await supabase.rpc("valider_inscription", {
    p_user_id: d.userId,
    p_secteur_id: d.clientId ? undefined : (d.secteurId ?? undefined),
    p_client_id: d.clientId ?? undefined,
    p_parrain_id: d.clientId ? undefined : (d.parrainId ?? undefined),
  });
  if (error) return { ok: false, erreur: messageErreur(error) };
  // Le client est prévenu par e-mail qu'il peut commander (l'inscription validée
  // est effacée : une seule fois)
  if (inscription) {
    await envoyerAuClient(
      inscription.email,
      emailCompteValide({
        prenom: inscription.prenom,
        lien: `${await origineDuSite()}/espace`,
        telephone: TELEPHONE_COMMANDES.affiche,
      }),
    );
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function changerStatutInscription(userId: string, statut: "en_attente" | "refusee"): Promise<Resultat> {
  await exigerAdmin();
  if (!z.uuid().safeParse(userId).success) return { ok: false, erreur: "Inscription introuvable." };
  const supabase = await clientSupabase();
  const { error } = await supabase.from("inscriptions").update({ statut }).eq("user_id", userId);
  if (error) return { ok: false, erreur: messageErreur(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}
