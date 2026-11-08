"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { annulerMaCommande } from "./actions";
import { Bouton, MessageErreur } from "@/components/ui";

export function BoutonAnnuler({ commandeId }: { commandeId: string }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      {erreur && <MessageErreur>{erreur}</MessageErreur>}
      <Bouton
        variante="secondaire"
        className="w-full"
        disabled={enCours}
        onClick={() => {
          if (!window.confirm("Annuler votre commande de cette semaine ?")) return;
          demarrer(async () => {
            const r = await annulerMaCommande(commandeId);
            if (!r.ok) return setErreur(r.erreur);
            router.refresh();
          });
        }}
      >
        {enCours ? "Annulation…" : "Annuler ma commande"}
      </Bouton>
    </div>
  );
}
