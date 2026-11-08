import type { Metadata } from "next";
import { exigerClientRelie } from "@/lib/auth";
import { formaterDate, formaterEcheance, lundiDeLaSemaine, majuscule } from "@/lib/domaine/dates";
import {
  lireCatalogue,
  lireCommandeClient,
  lireComposition,
  lireMaFidelite,
  lireRecompensesProposees,
} from "@/lib/espace-client";
import { EnTetePage, EtatVide, LienBouton } from "@/components/ui";
import { FormulaireCommandeClient } from "./formulaire-commande-client";

export const metadata: Metadata = { title: "Commander" };

export default async function PageCommander() {
  const { situation } = await exigerClientRelie();
  const date = situation.prochaine_livraison;

  const empeche = !situation.actif
    ? "Votre compte est suspendu pour le moment : contactez-nous pour commander."
    : !situation.commandes_ouvertes
      ? "Les commandes en ligne sont fermées pour le moment."
      : !date
        ? "Aucune livraison n'est prévue prochainement pour votre secteur."
        : null;
  if (empeche || !date) {
    return (
      <>
        <EnTetePage titre="Commander" retour="/espace" />
        <EtatVide
          action={
            <LienBouton href="/espace" variante="secondaire">
              Retour à l&apos;accueil
            </LienBouton>
          }
        >
          {empeche}
        </EtatVide>
      </>
    );
  }

  const [catalogue, composition, commande, fidelite, recompenses] = await Promise.all([
    lireCatalogue(),
    lireComposition(lundiDeLaSemaine(date)),
    situation.commande_id ? lireCommandeClient(situation.commande_id) : Promise.resolve(null),
    lireMaFidelite(),
    lireRecompensesProposees(),
  ]);

  return (
    <>
      <EnTetePage
        titre={commande ? "Modifier ma commande" : "Commander"}
        sousTitre={`Livraison ${formaterDate(date)}`}
        retour="/espace"
      />
      <div className="space-y-4">
        <p className="text-stone-700">
          {majuscule(formaterDate(date))} : commandes et modifications jusqu&apos;au{" "}
          <strong>{situation.cloture ? formaterEcheance(situation.cloture) : ""}</strong>. Paiement à la livraison.
        </p>
        <FormulaireCommandeClient
          articles={catalogue}
          contenus={composition.exacte ? composition.contenus : {}}
          commande={commande}
          solde={fidelite.solde}
          niveau={fidelite.niveau}
          recompenses={recompenses}
        />
      </div>
    </>
  );
}
