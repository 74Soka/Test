import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { exigerClientRelie } from "@/lib/auth";
import { formaterDate, majuscule } from "@/lib/domaine/dates";
import { lireCommandeClient, lireMesAvis } from "@/lib/espace-client";
import { Carte, EnTetePage, EtatVide } from "@/components/ui";
import { RecapCommande } from "../../composants";
import { FormulaireAvis } from "./formulaire-avis";

export const metadata: Metadata = { title: "Mon avis" };

export default async function PageAvis({ params }: PageProps<"/espace/avis/[id]">) {
  await exigerClientRelie();
  const { id } = await params;
  const commande = await lireCommandeClient(id);
  if (!commande) notFound();
  const avis = (await lireMesAvis([id])).get(id) ?? null;

  return (
    <>
      <EnTetePage
        titre="Votre avis"
        sousTitre={`Livraison du ${formaterDate(commande.date_livraison)}`}
        retour="/espace/commandes"
      />
      {commande.statut !== "livree" ? (
        <EtatVide>Vous pourrez donner votre avis une fois la commande livrée.</EtatVide>
      ) : (
        <div className="space-y-4">
          <Carte aria-label="Votre commande">
            <p className="mb-2 font-semibold">{majuscule(formaterDate(commande.date_livraison, { annee: true }))}</p>
            <RecapCommande commande={commande} />
          </Carte>
          <FormulaireAvis commandeId={id} initial={avis} />
        </div>
      )}
    </>
  );
}
