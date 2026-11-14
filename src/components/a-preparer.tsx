import { formaterPrix } from "@/lib/domaine/argent";
import { recapitulatif, totalCommande, type Categorie, type Statut } from "@/lib/domaine/commandes";
import { NomProduit } from "./produit";
import { Carte, cx } from "./ui";

type Ligne = { article_id: string | null; libelle: string; categorie: Categorie; quantite: number; prix_unitaire_centimes: number };
type Cadeau = { article_id: string | null; libelle: string; categorie: Categorie; quantite: number };

/**
 * « À préparer » : nombre de commandes, montant, et quantités totales par
 * article (offerts compris), paniers d'abord. Page Livraisons et Tournée.
 */
export function APreparer({
  commandes,
  sousTitre,
  astuce,
}: {
  commandes: { statut: Statut; lignes: Ligne[]; recompenses?: { cadeaux: Cadeau[] }[] | null }[];
  /** Ex. « Samedi 14 novembre · tous les secteurs » */
  sousTitre?: string;
  /** Phrases affichées en bas de l'encadré (tournée du livreur) */
  astuce?: string[];
}) {
  const actives = commandes.filter((c) => c.statut !== "annulee");
  if (actives.length === 0) return null;
  const recap = recapitulatif(commandes as Parameters<typeof recapitulatif>[0]);
  return (
    <Carte aria-labelledby="titre-recap">
      <h2 id="titre-recap" className="text-lg font-bold">
        À préparer
      </h2>
      {sousTitre && <p className="text-sm text-stone-600">{sousTitre}</p>}
      <p className="mb-3 text-stone-600">
        {actives.length} commande{actives.length > 1 ? "s" : ""} ·{" "}
        {formaterPrix(actives.reduce((t, c) => t + totalCommande(c.lignes), 0))}
      </p>
      <table className="w-full">
        <tbody className="divide-y divide-stone-100">
          {recap.map((l) => (
            <tr key={l.cle}>
              <td className={cx("py-2", l.categorie === "panier" && "font-semibold")}>
                <NomProduit nom={l.libelle} />
                {l.offerts > 0 && (
                  <span className="block text-sm font-normal text-peche-700">
                    dont {l.offerts} offert{l.offerts > 1 ? "s" : ""} 🎁
                  </span>
                )}
              </td>
              <td className="py-2 text-right text-xl font-bold tabular-nums">{l.quantite}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {astuce && astuce.length > 0 && (
        <div className="mt-3 space-y-1 rounded-xl bg-marque-50 px-3 py-2 text-sm font-semibold text-marque-900">
          {astuce.map((phrase) => (
            <p key={phrase}>{phrase}</p>
          ))}
        </div>
      )}
    </Carte>
  );
}
