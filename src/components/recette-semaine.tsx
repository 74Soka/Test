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
    <section aria-label="Recette de la semaine" className="flex flex-col gap-4 rounded-3xl bg-white p-5 ring-1 ring-marque-100">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-extrabold tracking-widest text-peche-600 uppercase">Recette de la semaine</p>
        <h2 className="font-titre text-2xl leading-tight text-balance text-marque-800">{recette.titre}</h2>
        {infos.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {infos.map((x) => (
              <li key={x} className="rounded-full bg-marque-50 px-3 py-1 text-sm font-bold text-marque-900">
                {x}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <h3 className="mb-1 text-sm font-extrabold tracking-wider text-stone-600 uppercase">Ingrédients</h3>
          <ul className="divide-y divide-dashed divide-marque-100">
            {lignesComposition(recette.ingredients).map((l, i) => {
              const provenance = provenanceIngredient(l, produitsPanier, nomsSupplements);
              return (
                <li key={i} className="flex justify-between gap-3 py-1.5">
                  <span>{l}</span>
                  {provenance && (
                    <span className="shrink-0 self-center text-xs font-extrabold tracking-wide text-feuille-700 uppercase">
                      {provenance === "panier" ? "Dans le panier" : "En supplément"}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-extrabold tracking-wider text-stone-600 uppercase">Préparation</h3>
          <ol className="flex flex-col gap-3">
            {lignesComposition(recette.etapes).map((l, i) => (
              <li key={i} className="grid grid-cols-[2rem_1fr] gap-3">
                <span className="grid size-8 place-items-center rounded-full bg-marque-800 text-sm font-extrabold text-white">
                  {i + 1}
                </span>
                <span>{l.replace(/^\d+[.)-]\s*/, "")}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      {recette.astuce && (
        <p className="rounded-2xl bg-marque-50 px-4 py-3">
          <strong className="text-feuille-700">Astuce : </strong>
          {recette.astuce}
        </p>
      )}
    </section>
  );
}

