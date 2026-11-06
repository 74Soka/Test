"use client";

import { cx } from "./ui";

/** Sélecteur de quantité à gros boutons − / +. */
export function Compteur({
  valeur,
  onChange,
  max = 99,
  libelle,
}: {
  valeur: number;
  onChange: (valeur: number) => void;
  max?: number;
  libelle: string;
}) {
  const bouton =
    "flex size-12 items-center justify-center rounded-xl text-2xl font-bold ring-1 disabled:opacity-30 active:scale-95 transition";
  return (
    <div className="flex items-center gap-1" role="group" aria-label={libelle}>
      <button
        type="button"
        className={cx(bouton, "bg-white text-stone-800 ring-stone-300")}
        onClick={() => onChange(Math.max(0, valeur - 1))}
        disabled={valeur <= 0}
        aria-label={`Retirer un ${libelle}`}
      >
        −
      </button>
      <output
        aria-live="polite"
        aria-label={`Quantité ${libelle}`}
        className={cx("w-10 text-center text-xl font-bold tabular-nums", valeur === 0 && "text-stone-400")}
      >
        {valeur}
      </output>
      <button
        type="button"
        className={cx(bouton, "bg-marque-700 text-white ring-marque-700")}
        onClick={() => onChange(Math.min(max, valeur + 1))}
        disabled={valeur >= max}
        aria-label={`Ajouter un ${libelle}`}
      >
        +
      </button>
    </div>
  );
}
