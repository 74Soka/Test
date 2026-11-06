"use client";

import { useState, useTransition } from "react";
import { supprimerClient } from "../../actions";
import { Bouton, MessageErreur } from "@/components/ui";

export function BoutonSupprimer({ id }: { id: string }) {
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirme, setConfirme] = useState(false);

  return (
    <div className="space-y-4">
      {erreur && <MessageErreur>{erreur}</MessageErreur>}
      <label className="flex min-h-12 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={confirme}
          onChange={(e) => setConfirme(e.target.checked)}
          className="size-6 accent-red-700"
        />
        <span>Je comprends que cette suppression est définitive.</span>
      </label>
      <Bouton
        variante="danger"
        taille="grand"
        className="w-full"
        disabled={!confirme || enCours}
        onClick={() =>
          demarrer(async () => {
            const r = await supprimerClient(id);
            if (!r.ok) setErreur(r.erreur);
          })
        }
      >
        {enCours ? "Suppression…" : "Supprimer définitivement"}
      </Bouton>
    </div>
  );
}
