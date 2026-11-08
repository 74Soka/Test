import { formaterPrix } from "@/lib/domaine/argent";
import { totalCommande } from "@/lib/domaine/commandes";
import type { ArticleCatalogue, CommandeClient } from "@/lib/espace-client";
import { Carte, TitreSection } from "@/components/ui";

/** Contenu des paniers de la semaine. */
export function CompositionPaniers({
  paniers,
  contenus,
  titre = "Dans les paniers",
  sousTitre,
}: {
  paniers: Pick<ArticleCatalogue, "id" | "nom" | "prix_centimes">[];
  contenus: Record<string, string>;
  titre?: string;
  sousTitre?: string;
}) {
  return (
    <Carte aria-label={titre}>
      <TitreSection>{titre}</TitreSection>
      {sousTitre && <p className="-mt-2 mb-3 text-sm text-stone-600">{sousTitre}</p>}
      <div className="space-y-4">
        {paniers.map((p) => (
          <div key={p.id}>
            <p className="flex items-baseline justify-between gap-2 font-bold">
              <span>{p.nom}</span>
              <span className="text-marque-800">{formaterPrix(p.prix_centimes)}</span>
            </p>
            {contenus[p.id] ? (
              <ul className="mt-1 list-inside list-disc text-stone-700">
                {contenus[p.id]
                  .split("\n")
                  .map((l) => l.trim())
                  .filter(Boolean)
                  .map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-stone-500">La composition sera bientôt publiée.</p>
            )}
          </div>
        ))}
      </div>
    </Carte>
  );
}

/** Récapitulatif d'une commande : articles, cadeaux, message, total. */
export function RecapCommande({ commande }: { commande: Pick<CommandeClient, "lignes" | "recompenses" | "notes"> }) {
  const lignes = [...commande.lignes].sort((a, b) =>
    a.categorie === b.categorie ? 0 : a.categorie === "panier" ? -1 : 1,
  );
  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {lignes.map((l) => (
          <li key={l.article_id} className="flex justify-between gap-2">
            <span>
              {l.quantite} × {l.libelle}
            </span>
            <span className="tabular-nums text-stone-700">{formaterPrix(l.quantite * l.prix_unitaire_centimes)}</span>
          </li>
        ))}
        {commande.recompenses.flatMap((r) =>
          r.cadeaux.map((c) => (
            <li key={`${r.id}-${c.article_id}`} className="flex justify-between gap-2 text-peche-700">
              <span>
                🎁 {c.quantite} × {c.libelle}
              </span>
              <span>offert</span>
            </li>
          )),
        )}
      </ul>
      {commande.notes && <p className="text-sm text-stone-600">Votre message : « {commande.notes} »</p>}
      <p className="flex justify-between border-t border-stone-200 pt-2 font-bold">
        <span>À régler à la livraison</span>
        <span className="tabular-nums">{formaterPrix(totalCommande(commande.lignes))}</span>
      </p>
    </div>
  );
}
