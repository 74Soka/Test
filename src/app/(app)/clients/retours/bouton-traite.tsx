"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { traiterRetour } from "./actions";
import { Bouton } from "@/components/ui";

export function BoutonTraite({ commandeId, traite }: { commandeId: string; traite: boolean }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  return (
    <Bouton
      variante={traite ? "secondaire" : "principal"}
      taille="petit"
      disabled={enCours}
      onClick={() =>
        demarrer(async () => {
          await traiterRetour(commandeId, !traite);
          router.refresh();
        })
      }
    >
      {traite ? "Rouvrir" : "✓ Traité"}
    </Bouton>
  );
}
