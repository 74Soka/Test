import { pastillesInfos, provenanceIngredient } from "@/lib/domaine/recettes";
import { lignesComposition, type PaniersPublics } from "@/lib/paniers-publics";

/**
 * Recette de la semaine (page publique et espace client) : ingrédients repérés
 * dans le panier ou les suppléments, étapes numérotées, astuce.
 */
export function RecetteSemaine({
  recette,
  paniers,
  supplements,
}: {
  recette: NonNullable<PaniersPublics["recette"]>;
  paniers: PaniersPublics["paniers"];
  supplements: PaniersPublics["supplements"];
}) {
  const produitsPanier = paniers.flatMap((p) => lignesComposition(p.contenu));
  const nomsSupplements = supplements.map((s) => s.nom);
  const infos = pastillesInfos(recette.infos);
  return (
    <section aria-label="Recette de la semaine" className="flex flex-col gap-4 rounded-3xl bg-white p-5 ring-1 ring-marque-100 dark:bg-nuit-carte dark:ring-white/10">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-extrabold tracking-widest text-peche-600 uppercase dark:text-peche-300">Recette de la semaine</p>
        <h2 className="font-titre text-2xl leading-tight text-balance text-marque-800 dark:text-marque-200">{recette.titre}</h2>
        {infos.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {infos.map((x) => (
              <li key={x} className="rounded-full bg-marque-50 px-3 py-1 text-sm font-bold text-marque-900 dark:bg-marque-900 dark:text-marque-100">
                {x}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <h3 className="mb-1 text-sm font-extrabold tracking-wider text-stone-600 uppercase dark:text-stone-400">Ingrédients</h3>
          <ul className="divide-y divide-dashed divide-marque-100 dark:divide-white/15">
            {lignesComposition(recette.ingredients).map((l, i) => {
              const provenance = provenanceIngredient(l, produitsPanier, nomsSupplements);
              return (
                <li key={i} className="flex justify-between gap-3 py-1.5">
                  <span>{l}</span>
                  {provenance && (
                    <span className="shrink-0 self-center text-xs font-extrabold tracking-wide text-feuille-700 uppercase dark:text-feuille-300">
                      {provenance === "panier" ? "Dans le panier" : "En supplément"}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-extrabold tracking-wider text-stone-600 uppercase dark:text-stone-400">Préparation</h3>
          <ol className="flex flex-col gap-3">
            {lignesComposition(recette.etapes).map((l, i) => (
              <li key={i} className="grid grid-cols-[2rem_1fr] gap-3">
                <span className="grid size-8 place-items-center rounded-full bg-marque-800 text-sm font-extrabold text-white dark:bg-marque-600">
                  {i + 1}
                </span>
                <span>{l.replace(/^\d+[.)-]\s*/, "")}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      {recette.astuce && (
        <p className="rounded-2xl bg-marque-50 px-4 py-3 dark:bg-marque-900/60">
          <strong className="text-feuille-700 dark:text-feuille-300">Astuce : </strong>
          {recette.astuce}
        </p>
      )}
    </section>
  );
}

