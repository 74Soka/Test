import type { Metadata } from "next";
import { exigerAdmin } from "@/lib/auth";
import {
  lireCommande,
  listerArticles,
  listerClients,
  lireParametresFidelite,
  listerFidelite,
  listerSoldes,
  listerRecompenses,
  listerSecteurs,
} from "@/lib/donnees";
import { debutCommandesEquipe } from "@/lib/domaine/dates";
import { EnTetePage, MessageInfo } from "@/components/ui";
import { FormulaireCommande, type LigneLibre } from "../formulaire-commande";

export const metadata: Metadata = { title: "Nouvelle commande" };

export default async function PageNouvelleCommande({ searchParams }: PageProps<"/commandes/nouvelle">) {
  await exigerAdmin();
  const { client, depuis } = await searchParams;
  const clientId = typeof client === "string" ? client : null;
  const depuisId = typeof depuis === "string" ? depuis : null;

  const [clients, secteurs, articles, modele, fidelite, recompenses, parametres, soldes] = await Promise.all([
    listerClients(),
    listerSecteurs(),
    listerArticles({ actifsSeulement: true }),
    depuisId ? lireCommande(depuisId) : Promise.resolve(null),
    listerFidelite(),
    listerRecompenses({ actifsSeulement: true }),
    lireParametresFidelite(),
    listerSoldes(),
  ]);

  // « Recommander comme la dernière fois » : on reprend les quantités des articles encore proposés
  const quantites: Record<string, number> = {};
  const indisponibles: string[] = [];
  const libres: LigneLibre[] = [];
  for (const ligne of modele?.lignes ?? []) {
    if (!ligne.article_id) libres.push({ libelle: ligne.libelle, quantite: ligne.quantite, prix_unitaire_centimes: ligne.prix_unitaire_centimes });
    else if (articles.some((a) => a.id === ligne.article_id)) quantites[ligne.article_id] = ligne.quantite;
    else indisponibles.push(ligne.libelle);
  }

  const actifs = clients.filter((c) => c.actif);
  const clientInitial = actifs.some((c) => c.id === clientId) ? clientId : null;

  return (
    <>
      <EnTetePage
        titre={modele ? "Recommander" : "Nouvelle commande"}
        retour={clientInitial ? `/clients/${clientInitial}` : "/livraisons"}
      />
      {indisponibles.length > 0 && (
        <div className="mb-4">
          <MessageInfo>Plus proposé(s) en ce moment : {indisponibles.join(", ")}.</MessageInfo>
        </div>
      )}
      <FormulaireCommande
        clients={actifs}
        secteurs={secteurs}
        articles={articles}
        aujourdhui={debutCommandesEquipe()}
        initial={{ clientId: clientInitial, date: null, quantites, libres, notes: "" }}
        fidelite={fidelite}
        soldes={soldes}
        recompenses={recompenses}
        debutParrainage={parametres.parrainage_cadeaux_debut}
      />
    </>
  );
}
