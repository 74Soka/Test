import { ligneProduit } from "@/lib/domaine/produits";
import { cx } from "./ui";

/** Pastille « BIO », la même partout sur le site. */
export function PastilleBio({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        "inline-block shrink-0 self-center rounded-full px-2 text-xs leading-5 font-extrabold tracking-wider text-feuille-700 ring-[1.5px] ring-feuille-700 dark:text-feuille-300 dark:ring-feuille-300",
        className,
      )}
    >
      BIO
    </span>
  );
}

/** Nom d'un produit : « Œufs BIO (6) » → « Œufs (6) » + pastille BIO. */
export function NomProduit({
  nom,
  prefixe,
}: {
  nom: string;
  prefixe?: string;
}) {
  const { texte, bio } = ligneProduit(nom);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      <span>
        {prefixe}
        {texte}
      </span>
      {bio && <PastilleBio />}
    </span>
  );
}

/** Liste « un produit par ligne », pastille BIO à droite, comme la page des paniers. */
export function ListeProduits({ lignes }: { lignes: string[] }) {
  return (
    <ul className="divide-y divide-dashed divide-marque-100 dark:divide-white/15">
      {lignes.map((l, i) => {
        const { texte, bio } = ligneProduit(l);
        return (
          <li key={i} className="flex justify-between gap-3 py-2">
            <span>{texte}</span>
            {bio && <PastilleBio />}
          </li>
        );
      })}
    </ul>
  );
}
