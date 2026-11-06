"use client";

import { useTransition } from "react";
import { basculerArticle } from "./actions";
import { cx } from "@/components/ui";

/** Interrupteur « proposé / hors saison » d'un article. */
export function BoutonActif({ id, actif, nom }: { id: string; actif: boolean; nom: string }) {
  const [enCours, demarrer] = useTransition();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={actif}
      aria-label={`${nom} : ${actif ? "proposé" : "hors saison"}`}
      disabled={enCours}
      onClick={() =>
        demarrer(async () => {
          const r = await basculerArticle(id, !actif);
          if (!r.ok) alert(r.erreur);
        })
      }
      className={cx(
        "relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors disabled:opacity-60",
        actif ? "bg-marque-600" : "bg-stone-300",
      )}
    >
      <span
        className={cx(
          "inline-block size-6 rounded-full bg-white shadow transition-transform",
          actif ? "translate-x-7" : "translate-x-1",
        )}
      />
    </button>
  );
}
