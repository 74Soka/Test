import type { Metadata } from "next";
import Link from "next/link";
import { exigerClientRelie } from "@/lib/auth";
import { seDeconnecter } from "@/app/connexion/actions";
import { libelleSecteur } from "@/lib/domaine/secteurs";
import { formaterTelephone } from "@/lib/domaine/telephone";
import { lireMaFiche } from "@/lib/espace-client";
import { Bouton, Carte, EnTetePage, LienBouton, TitreSection } from "@/components/ui";
import { clePubliqueVapid } from "@/lib/notifications";
import { ActivationNotifications } from "../notifications";
import { FormulaireCoordonnees } from "./formulaire-coordonnees";

export const metadata: Metadata = { title: "Mon compte" };

export default async function PageCompte() {
  const { situation, utilisateur } = await exigerClientRelie();
  const [fiche, clePublique] = await Promise.all([lireMaFiche(situation.client_id), clePubliqueVapid()]);

  return (
    <>
      <EnTetePage titre="Mon compte" sousTitre={utilisateur.email ?? undefined} />
      <div className="space-y-4">
        <Carte aria-label="Adresse de livraison">
          <TitreSection>Adresse de livraison</TitreSection>
          <p className="font-semibold">
            {situation.prenom} {situation.nom}
          </p>
          <p className="text-stone-700">
            {fiche?.adresse}
            {fiche?.complement_adresse && `, ${fiche.complement_adresse}`}
          </p>
          <p className="text-stone-700">
            {fiche?.code_postal} {fiche?.commune}
          </p>
          <p className="mt-2 text-sm text-stone-600">
            {libelleSecteur(situation.secteur)}. Pour changer d&apos;adresse, contactez-nous : nous vérifierons le jour de
            livraison.
          </p>
        </Carte>

        <Carte aria-label="Coordonnées">
          <TitreSection>Téléphone et consignes</TitreSection>
          <FormulaireCoordonnees
            telephone={fiche?.telephone ? formaterTelephone(fiche.telephone) : ""}
            notesLivraison={fiche?.notes_livraison ?? ""}
          />
        </Carte>

        <ActivationNotifications clePublique={clePublique} variante="compte" />

        <Carte className="space-y-2">
          <LienBouton href="/nouveau-mot-de-passe" variante="secondaire" className="w-full">
            Changer de mot de passe
          </LienBouton>
          <form action={seDeconnecter}>
            <Bouton type="submit" variante="secondaire" className="w-full">
              Se déconnecter
            </Bouton>
          </form>
        </Carte>

        <p className="text-center text-sm">
          <Link href="/espace/compte/supprimer" className="font-semibold text-red-700 underline">
            Supprimer mon compte et mes données
          </Link>
        </p>
      </div>
    </>
  );
}
