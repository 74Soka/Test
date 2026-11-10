import type { Metadata } from "next";
import Link from "next/link";
import { exigerAdmin } from "@/lib/auth";
import { formaterPrix } from "@/lib/domaine/argent";
import {
  aujourdhui,
  formaterSemaine,
  lundiDeLaSemaine,
  numeroSemaine,
} from "@/lib/domaine/dates";
import { lignesComposition } from "@/lib/paniers-publics";
import { clientSupabase } from "@/lib/supabase/serveur";
import { RecetteSemaine } from "@/components/recette-semaine";
import { ListeProduits } from "@/components/produit";
import { Carte, EnTetePage, EtatVide, Pastille } from "@/components/ui";

export const metadata: Metadata = { title: "Historique des paniers" };

/**
 * Historique réservé à l'administrateur : composition des paniers et recette
 * de chaque semaine, la plus récente en premier, avec le numéro de semaine.
 */
export default async function PageHistorique() {
  await exigerAdmin();
  const supabase = await clientSupabase();
  const [{ data: compositions, error: e1 }, { data: recettes, error: e2 }] =
    await Promise.all([
      supabase
        .from("compositions")
        .select(
          "semaine, contenu, article:articles(id, nom, prix_centimes, ordre)",
        )
        .order("semaine", { ascending: false }),
      supabase
        .from("recettes")
        .select("semaine, titre, infos, ingredients, etapes, astuce"),
    ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);

  // Semaines ayant une composition ou une recette, de la plus récente à la plus ancienne
  const semaines = [
    ...new Set([
      ...(compositions ?? []).map((c) => c.semaine),
      ...(recettes ?? []).map((r) => r.semaine),
    ]),
  ].sort((a, b) => b.localeCompare(a));
  const recetteDe = new Map((recettes ?? []).map((r) => [r.semaine, r]));
  const enCours = lundiDeLaSemaine(aujourdhui());
  // La semaine en cours (ouverte) puis les précédentes ; les semaines à venir à part, en bas
  const passees = semaines.filter((s) => s <= enCours);
  const aVenir = semaines.filter((s) => s > enCours).reverse();

  return (
    <>
      <EnTetePage
        titre="Historique des paniers"
        sousTitre="Compositions et recettes, semaine par semaine"
        retour="/reglages"
      />
      {semaines.length === 0 ? (
        <EtatVide>Aucune composition enregistrée pour l&apos;instant.</EtatVide>
      ) : (
        <div className="space-y-6">
          {[
            { titre: null, liste: passees },
            { titre: "Semaines à venir", liste: aVenir },
          ].map(({ titre, liste }) =>
            liste.length === 0 ? null : (
              <section
                key={titre ?? "passees"}
                aria-label={titre ?? "Semaines passées"}
                className="space-y-3"
              >
                {titre && (
                  <h2 className="font-titre text-lg text-marque-800">
                    {titre}
                  </h2>
                )}
                <ul className="space-y-3">
                  {liste.map((s, i) => {
                    const { semaine, annee } = numeroSemaine(s);
                    const paniers = (compositions ?? [])
                      .filter((c) => c.semaine === s && c.article)
                      .map((c) => ({
                        id: c.article!.id,
                        nom: c.article!.nom,
                        prix_centimes: c.article!.prix_centimes,
                        ordre: c.article!.ordre,
                        contenu: c.contenu,
                      }))
                      .sort((a, b) => a.ordre - b.ordre);
                    const recette = recetteDe.get(s) ?? null;
                    return (
                      <li key={s}>
                        <Carte className="p-0">
                          <details
                            open={i === 0 && s <= enCours}
                            className="group"
                          >
                            <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                              <span>
                                <span className="block font-titre text-lg text-marque-800">
                                  Semaine {semaine} · {annee}
                                </span>
                                <span className="block text-sm text-stone-600">
                                  {formaterSemaine(s).replace(/^Semaine /, "")}
                                  {recette ? ` · 🍳 ${recette.titre}` : ""}
                                </span>
                              </span>
                              <span className="flex items-center gap-2">
                                {s === enCours && (
                                  <Pastille couleur="vert">En cours</Pastille>
                                )}
                                {s > enCours && (
                                  <Pastille couleur="orange">À venir</Pastille>
                                )}
                                <span
                                  aria-hidden
                                  className="text-2xl text-stone-400 transition-transform group-open:rotate-90"
                                >
                                  ›
                                </span>
                              </span>
                            </summary>
                            <div className="space-y-4 border-t border-stone-100 px-4 py-4">
                              {paniers.length === 0 && (
                                <p className="text-stone-600">
                                  Pas de composition saisie cette semaine-là.
                                </p>
                              )}
                              {paniers.map((p) => (
                                <div key={p.id}>
                                  <p className="flex items-baseline justify-between gap-2 font-bold">
                                    <span>{p.nom}</span>
                                    <span className="text-marque-800">
                                      {formaterPrix(p.prix_centimes)}
                                    </span>
                                  </p>
                                  <div className="text-stone-700">
                              <ListeProduits lignes={lignesComposition(p.contenu)} />
                            </div>
                                </div>
                              ))}
                              {recette ? (
                                <RecetteSemaine
                                  recette={recette}
                                  paniers={paniers}
                                  supplements={[]}
                                />
                              ) : (
                                <p className="text-sm text-stone-600">
                                  Pas de recette cette semaine-là.
                                </p>
                              )}
                              <Link
                                href={`/reglages/composition?semaine=${s}`}
                                className="inline-block font-semibold text-marque-800 underline"
                              >
                                Modifier cette semaine
                              </Link>
                            </div>
                          </details>
                        </Carte>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ),
          )}
        </div>
      )}
    </>
  );
}
