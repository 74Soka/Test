import type { Metadata } from "next";
import { exigerAdmin } from "@/lib/auth";
import {
  lireCommande,
  listerArticles,
  listerClients,
  lireParametresFidelite,
  listerFidelite,
  listerRecompenses,
  listerSecteurs,
} from "@/lib/donnees";
import { aujourdhui } from "@/lib/domaine/dates";
import { EnTetePage, MessageInfo } from "@/components/ui";
import { FormulaireCommande } from "../formulaire-commande";

export const metadata: Metadata = { title: "Nouvelle commande" };

export default async function PageNouvelleCommande({ searchParams }: PageProps<"/commandes/nouvelle">) {
  await exigerAdmin();
  const { client, depuis } = await searchParams;
  const clientId = typeof client === "string" ? client : null;
  const depuisId = typeof depuis === "string" ? depuis : null;

  const [clients, secteurs, articles, modele, fidelite, recompenses, parametres] = await Promise.all([
    listerClients(),
    listerSecteurs(),
    listerArticles({ actifsSeulement: true }),
    depuisId ? lireCommande(depuisId) : Promise.resolve(null),
    listerFidelite(),
    listerRecompenses({ actifsSeulement: true }),
    lireParametresFidelite(),
  ]);

  // « Recommander comme la dernière fois » : on reprend les quantités des articles encore proposés
  const quantites: Record<string, number> = {};
  const indisponibles: string[] = [];
  for (const ligne of modele?.lignes ?? []) {
    if (articles.some((a) => a.id === ligne.article_id)) quantites[ligne.article_id] = ligne.quantite;
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
        aujourdhui={aujourdhui()}
        initial={{ clientId: clientInitial, date: null, quantites, notes: "" }}
        fidelite={fidelite}
        recompenses={recompenses}
        debutParrainage={parametres.parrainage_cadeaux_debut}
      />
    </>
  );
}
