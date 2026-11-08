import type { Metadata } from "next";
import Link from "next/link";
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
import { formaterPrix } from "@/lib/domaine/argent";
import { LIBELLES_STATUT, totalCommande, type Statut } from "@/lib/domaine/commandes";
import { aujourdhui, formaterDate } from "@/lib/domaine/dates";
import { nomComplet } from "@/lib/domaine/texte";
import { Carte, EnTetePage, MessageInfo, Pastille, TitreSection } from "@/components/ui";
import { FormulaireCommande, type ArticleFormulaire } from "../formulaire-commande";
import { ActionsStatut } from "./actions-statut";

export const metadata: Metadata = { title: "Commande" };

const COULEUR_STATUT: Record<Statut, "orange" | "vert" | "gris"> = {
  a_livrer: "orange",
  livree: "vert",
  annulee: "gris",
};

const HEURE = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });

export default async function PageCommande({ params, searchParams }: PageProps<"/commandes/[id]">) {
  await exigerAdmin();
  const { id } = await params;
  const { enregistree } = await searchParams;
  const [commande, clients, secteurs, catalogue, fidelite, recompenses, parametres] = await Promise.all([
    lireCommande(id),
    listerClients(),
    listerSecteurs(),
    listerArticles(),
    listerFidelite(),
    listerRecompenses({ actifsSeulement: true }),
    lireParametresFidelite(),
  ]);
  const retour = `/livraisons?du=${commande.date_livraison}`;

  // Articles du formulaire : ceux proposés au catalogue (prix actuel) et ceux
  // déjà dans la commande (prix figé, même s'ils sont hors saison).
  const articles: ArticleFormulaire[] = catalogue
    .filter((a) => a.actif || commande.lignes.some((l) => l.article_id === a.id))
    .map((a) => {
      const ligne = commande.lignes.find((l) => l.article_id === a.id);
      return {
        id: a.id,
        nom: ligne?.libelle ?? a.nom,
        categorie: ligne?.categorie ?? a.categorie,
        prix_centimes: ligne?.prix_unitaire_centimes ?? a.prix_centimes,
        actif: a.actif,
      };
    });
  const quantites = Object.fromEntries(commande.lignes.map((l) => [l.article_id, l.quantite]));

  return (
    <>
      <EnTetePage
        titre={nomComplet(commande.client)}
        sousTitre={formaterDate(commande.date_livraison, { annee: true })}
        retour={retour}
        action={<Pastille couleur={COULEUR_STATUT[commande.statut]}>{LIBELLES_STATUT[commande.statut]}</Pastille>}
      />
      <div className="space-y-4">
        {commande.source === "client" && (
          <p className="text-sm font-medium text-sky-800">🌐 Commandée en ligne par le client</p>
        )}
        {enregistree && (
          <MessageInfo>
            Commande enregistrée.{" "}
            <Link href="/commandes/nouvelle" className="font-bold underline">
              Saisir une autre commande ›
            </Link>
          </MessageInfo>
        )}

        <p className="text-stone-700">
          <Link href={`/clients/${commande.client.id}`} className="font-semibold text-marque-800 underline">
            Fiche client
          </Link>{" "}
          · {commande.client.adresse}, {commande.client.commune}
        </p>

        {commande.statut === "a_livrer" ? (
          <FormulaireCommande
            id={id}
            clientFixe
            clients={clients.filter((c) => c.id === commande.client_id)}
            secteurs={secteurs}
            articles={articles}
            aujourdhui={aujourdhui()}
            initial={{
              clientId: commande.client_id,
              date: commande.date_livraison,
              quantites,
              notes: commande.notes ?? "",
              recompenses: commande.recompenses.map((r) => ({
                id: r.id,
                recompense_id: r.recompense_id ?? "",
                nom: r.nom,
                cout_tampons: r.cout_tampons,
                articles: Object.fromEntries(r.cadeaux.map((c) => [c.article_id, c.quantite])),
              })),
            }}
            fidelite={fidelite}
            recompenses={recompenses}
            debutParrainage={parametres.parrainage_cadeaux_debut}
          />
        ) : (
          <Carte>
            <TitreSection>Contenu</TitreSection>
            <ul className="divide-y divide-stone-100">
              {commande.lignes.map((l) => (
                <li key={l.article_id} className="flex justify-between gap-3 py-2">
                  <span>
                    {l.quantite} × {l.libelle}
                  </span>
                  <span className="tabular-nums">{formaterPrix(l.quantite * l.prix_unitaire_centimes)}</span>
                </li>
              ))}
            </ul>
            {commande.recompenses.map((r) => (
              <div key={r.id} className="mt-2 rounded-xl bg-peche-50 px-3 py-2 text-sm ring-1 ring-peche-600/30">
                <p className="font-semibold">🎁 {r.nom} ({r.cout_tampons} tampons)</p>
                <p>{r.cadeaux.map((c) => `${c.quantite} × ${c.libelle}`).join(", ")}</p>
              </div>
            ))}
            <p className="mt-2 flex justify-between border-t border-stone-200 pt-2 text-lg font-bold">
              <span>Total</span>
              <span className="tabular-nums">{formaterPrix(totalCommande(commande.lignes))}</span>
            </p>
            {commande.notes && <p className="mt-3 text-stone-700">Remarque : {commande.notes}</p>}
            {commande.livree_le && (
              <p className="mt-3 text-stone-700">
                Livrée le {formaterDate(aujourdhui(new Date(commande.livree_le)))} à {HEURE.format(new Date(commande.livree_le))}
              </p>
            )}
          </Carte>
        )}

        <Carte>
          <TitreSection>Statut</TitreSection>
          <ActionsStatut id={id} statut={commande.statut} retour={retour} />
        </Carte>
      </div>
    </>
  );
}
