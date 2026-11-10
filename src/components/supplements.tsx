import { formaterPrix } from "@/lib/domaine/argent";
import { ligneProduit } from "@/lib/domaine/produits";
import { PastilleBio } from "./produit";

/** Suppléments proposés et leurs prix (page des paniers et espace client). */
export function ListeSupplements({ supplements }: { supplements: { nom: string; prix_centimes: number }[] }) {
  if (supplements.length === 0) return null;
  return (
    <section aria-label="En supplément" className="flex flex-col gap-2 rounded-3xl bg-white p-5 ring-1 ring-marque-100 dark:bg-nuit-carte dark:ring-white/10">
      <h2 className="font-titre text-xl text-marque-800 dark:text-marque-200">En supplément</h2>
      <ul className="divide-y divide-dashed divide-marque-100 dark:divide-white/15">
        {supplements.map((s) => {
          const { texte, bio } = ligneProduit(s.nom);
          return (
            <li key={s.nom} className="grid grid-cols-[1fr_auto_4em] items-center gap-3 py-2">
              <span>{texte}</span>
              <span>{bio && <PastilleBio />}</span>
              <span className="text-right font-extrabold text-peche-600 tabular-nums dark:text-peche-300">{formaterPrix(s.prix_centimes)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
