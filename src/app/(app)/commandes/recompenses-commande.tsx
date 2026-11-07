"use client";

import { useState } from "react";
import { Compteur } from "@/components/compteur";
import { Bouton, Carte, Pastille } from "@/components/ui";
import {
  LIBELLES_NIVEAU,
  niveauSuffisant,
  pluriel,
  recompensesEnTampons,
  soldeDisponible,
  type Niveau,
  type RecompenseProposee,
} from "@/lib/domaine/fidelite";

export type RecompenseEnCours = {
  /** Récompense déjà enregistrée sur la commande */
  id?: string | null;
  recompense_id: string;
  nom: string;
  cout_tampons: number;
  /** Quantités offertes, par article */
  articles: Record<string, number>;
};

type ArticleOffrable = { id: string; nom: string; categorie: "panier" | "supplement"; actif: boolean };

/** Récompenses de fidélité utilisées sur une commande. */
export function RecompensesCommande({
  niveau,
  soldeActuel,
  enregistrees,
  recompenses,
  articles,
  valeur,
  onChange,
  confituresDues = 0,
}: {
  niveau: Niveau;
  /** Solde actuel en base (compte déjà les récompenses enregistrées sur cette commande) */
  soldeActuel: number;
  enregistrees: { id: string; cout_tampons: number }[];
  recompenses: RecompenseProposee[];
  /** Articles du formulaire (seuls les actifs peuvent être offerts) */
  articles: ArticleOffrable[];
  valeur: RecompenseEnCours[];
  onChange: (valeur: RecompenseEnCours[]) => void;
  /** Confitures de parrainage dues à ce client */
  confituresDues?: number;
}) {
  const [choix, setChoix] = useState<RecompenseEnCours | null>(null);
  const solde = soldeDisponible(soldeActuel, enregistrees, valeur);
  const cadeauParrain = recompenses.find((r) => r.type === "cadeau_parrain" && r.actif);
  const confituresRestantes =
    confituresDues - valeur.filter((v) => !v.id && v.recompense_id === cadeauParrain?.id).length;
  const nomArticle = (id: string) => articles.find((a) => a.id === id)?.nom ?? "Article";

  function commencer(r: RecompenseProposee) {
    setChoix({
      recompense_id: r.id,
      nom: r.nom,
      cout_tampons: r.cout_tampons,
      articles: r.article_id ? { [r.article_id]: 1 } : {},
    });
  }

  function valider() {
    if (!choix) return;
    const sansZero = Object.fromEntries(Object.entries(choix.articles).filter(([, q]) => q > 0));
    const existe = valeur.some((v) => v === choix);
    onChange(existe ? valeur.map((v) => (v === choix ? { ...choix, articles: sansZero } : v)) : [...valeur, { ...choix, articles: sansZero }]);
    setChoix(null);
  }

  const quantiteChoisie = choix ? Object.values(choix.articles).reduce((t, q) => t + q, 0) : 0;

  /**
   * Articles offrables, dans un ordre utile : la catégorie attendue d'abord
   * (suppléments, sauf « panier offert »), et les confitures en tête quand la
   * récompense en parle.
   */
  function articlesProposes(c: RecompenseEnCours) {
    const rec = recompenses.find((r) => r.id === c.recompense_id);
    const categorie = articles.find((a) => a.id === rec?.article_id)?.categorie ?? "supplement";
    const confitureDabord = /confiture/i.test(`${rec?.nom} ${rec?.description ?? ""}`);
    const rang = (a: ArticleOffrable) =>
      (a.categorie === categorie ? 0 : 2) + (confitureDabord && /confiture/i.test(a.nom) ? 0 : 1);
    return articles.filter((a) => a.actif).sort((a, b) => rang(a) - rang(b));
  }

  return (
    <Carte className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Fidélité</h2>
        {niveau !== "standard" && <Pastille couleur={niveau === "ultra" ? "orange" : "bleu"}>{LIBELLES_NIVEAU[niveau]}</Pastille>}
      </div>
      <p className="text-stone-700">
        Solde : <strong className="tabular-nums">{pluriel(solde, "tampon")}</strong>
        {valeur.length > 0 && " après les récompenses ci-dessous"}
      </p>

      {valeur.length > 0 && (
        <ul className="space-y-2">
          {valeur.map((v, i) => (
            <li key={v.id ?? `nouvelle-${i}`} className="rounded-xl bg-marque-50 px-3 py-2 ring-1 ring-marque-600/30">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">🎁 {v.nom}</p>
                  <p className="text-sm text-stone-700">
                    {Object.entries(v.articles)
                      .map(([id, q]) => `${q} × ${nomArticle(id)}`)
                      .join(", ") || "Rien de choisi"}
                  </p>
                  <p className="text-xs text-stone-500">
                    {v.cout_tampons > 0 ? pluriel(v.cout_tampons, "tampon") : "Cadeau de parrainage"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end">
                  <Bouton variante="discret" taille="petit" onClick={() => setChoix(v)}>
                    Modifier
                  </Bouton>
                  <Bouton
                    variante="discret"
                    taille="petit"
                    className="text-red-700"
                    onClick={() => onChange(valeur.filter((x) => x !== v))}
                  >
                    Retirer
                  </Bouton>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!choix && cadeauParrain && confituresRestantes > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-amber-50 px-3 py-2 ring-1 ring-amber-300">
          <p className="font-medium text-amber-900">
            🎁 {confituresRestantes > 1 ? `${confituresRestantes} confitures` : "1 confiture"} de parrainage à offrir
          </p>
          <Bouton taille="petit" onClick={() => commencer(cadeauParrain)}>
            Offrir
          </Bouton>
        </div>
      )}

      {choix ? (
        <div className="space-y-2 rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
          <p className="font-semibold">Offrir : {choix.nom}</p>
          <p className="text-sm text-stone-600">
            {recompenses.find((r) => r.id === choix.recompense_id)?.description ?? "Choisissez ce qui est offert."}
          </p>
          <ul className="divide-y divide-stone-200">
            {articlesProposes(choix).map((a) => (
              <li key={a.id} className="flex min-h-14 items-center gap-3 py-1.5">
                <span className="min-w-0 flex-1 font-medium">{a.nom}</span>
                <Compteur
                  valeur={choix.articles[a.id] ?? 0}
                  libelle={`${a.nom} offert`}
                  onChange={(q) => setChoix({ ...choix, articles: { ...choix.articles, [a.id]: q } })}
                />
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Bouton onClick={valider} disabled={quantiteChoisie === 0}>
              Valider
            </Bouton>
            <Bouton variante="secondaire" onClick={() => setChoix(null)}>
              Annuler
            </Bouton>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-stone-100">
          {recompensesEnTampons(recompenses)
            .filter((r) => r.actif)
            .map((r) => {
              const accessible = niveauSuffisant(niveau, r.niveau);
              const manque = r.cout_tampons - solde;
              return (
                <li key={r.id} className="flex min-h-14 items-center gap-3 py-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{r.nom}</span>
                    <span className="block text-sm text-stone-600">
                      {pluriel(r.cout_tampons, "tampon")}
                      {!accessible && ` · réservé aux ${LIBELLES_NIVEAU[r.niveau]}`}
                      {accessible && manque > 0 && ` · encore ${pluriel(manque, "tampon")}`}
                    </span>
                  </span>
                  <Bouton
                    variante="secondaire"
                    taille="petit"
                    disabled={!accessible || manque > 0}
                    onClick={() => commencer(r)}
                    aria-label={`Utiliser : ${r.nom}`}
                  >
                    Utiliser
                  </Bouton>
                </li>
              );
            })}
        </ul>
      )}
    </Carte>
  );
}
