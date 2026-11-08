import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { exigerClient } from "@/lib/auth";
import { seDeconnecter } from "@/app/connexion/actions";
import { lireMonInscription } from "@/lib/espace-client";
import { clientSupabase } from "@/lib/supabase/serveur";
import { formaterTelephone } from "@/lib/domaine/telephone";
import { Bouton, EnTetePage } from "@/components/ui";
import { FormulaireBienvenue } from "./formulaire-bienvenue";

export const metadata: Metadata = { title: "Bienvenue" };

export default async function PageBienvenue() {
  const { situation, utilisateur } = await exigerClient();
  if (situation.etat !== "nouveau" && situation.etat !== "en_attente") redirect("/espace");

  const inscription = await lireMonInscription();
  // Prénom et nom saisis à la création du compte
  const supabase = await clientSupabase();
  const { data } = await supabase.auth.getClaims();
  const meta = (data?.claims?.user_metadata ?? {}) as { prenom?: unknown; nom?: unknown };

  return (
    <>
      <EnTetePage titre="Bienvenue !" sousTitre={utilisateur.email ?? undefined} />
      <div className="space-y-4">
        <p className="text-stone-700">
          Pour être livré, indiquez-nous votre adresse et un téléphone. Nous vérifions que vous êtes dans un de nos
          secteurs, puis votre compte est activé.
        </p>
        <FormulaireBienvenue
          initial={{
            prenom: inscription?.prenom ?? (typeof meta.prenom === "string" ? meta.prenom : ""),
            nom: inscription?.nom ?? (typeof meta.nom === "string" ? meta.nom : ""),
            telephone: inscription ? formaterTelephone(inscription.telephone) : "",
            adresse: inscription
              ? {
                  ligne: inscription.adresse,
                  codePostal: inscription.code_postal,
                  commune: inscription.commune,
                  codeInsee: inscription.code_insee,
                  lat: inscription.lat,
                  lng: inscription.lng,
                }
              : null,
            complement: inscription?.complement_adresse ?? "",
            notesLivraison: inscription?.notes_livraison ?? "",
            parrain: inscription?.parrain ?? "",
          }}
        />
        <form action={seDeconnecter}>
          <Bouton type="submit" variante="discret" className="w-full">
            Se déconnecter
          </Bouton>
        </form>
      </div>
    </>
  );
}
