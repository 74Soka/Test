"use client";

import { useTransition } from "react";
import { changerActivite } from "../actions";
import { Bouton } from "@/components/ui";

export function BoutonActivite({ id, actif }: { id: string; actif: boolean }) {
  const [enCours, demarrer] = useTransition();
  return (
    <Bouton
      variante="secondaire"
      className="w-full"
      disabled={enCours}
      onClick={() =>
        demarrer(async () => {
          const r = await changerActivite(id, !actif);
          if (!r.ok) alert(r.erreur);
        })
      }
    >
      {actif ? "Marquer comme inactif" : "Réactiver le client"}
    </Bouton>
  );
}
