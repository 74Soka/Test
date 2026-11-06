import type { Metadata } from "next";
import { exigerAdmin } from "@/lib/auth";
import { compterCommandesClient, lireClient } from "@/lib/donnees";
import { nomComplet } from "@/lib/domaine/texte";
import { Carte, EnTetePage, LienBouton } from "@/components/ui";
import { BoutonSupprimer } from "./bouton-supprimer";

export const metadata: Metadata = { title: "Supprimer le client" };

export default async function PageSupprimerClient({ params }: PageProps<"/clients/[id]/supprimer">) {
  await exigerAdmin();
  const { id } = await params;
  const [{ client, filleuls }, nombreCommandes] = await Promise.all([lireClient(id), compterCommandesClient(id)]);

  return (
    <>
      <EnTetePage titre="Supprimer le client" retour={`/clients/${id}`} />
      <div className="space-y-4">
        <Carte className="space-y-3">
          <p className="text-lg">
            Vous allez supprimer définitivement <strong>{nomComplet(client)}</strong> (droit à l&apos;effacement,
            RGPD).
          </p>
          <ul className="list-disc space-y-1 pl-5 text-stone-800">
            <li>sa fiche : coordonnées, adresse, position, notes ;</li>
            <li>
              {nombreCommandes === 0
                ? "aucune commande n'est enregistrée ;"
                : `ses ${nombreCommandes} commande(s) et leur contenu ;`}
            </li>
            {filleuls.length > 0 && (
              <li>
                ses {filleuls.length} filleul(s) restent clients mais n&apos;auront plus de parrain.
              </li>
            )}
          </ul>
          <p className="text-stone-700">
            Si le client arrête simplement de commander, préférez « Marquer comme inactif » : l&apos;historique est
            conservé.
          </p>
        </Carte>
        <Carte>
          <BoutonSupprimer id={id} />
        </Carte>
        <LienBouton href={`/clients/${id}`} variante="secondaire" className="w-full">
          Annuler
        </LienBouton>
      </div>
    </>
  );
}
