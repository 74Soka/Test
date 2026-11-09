"use client";

import { useState, useTransition } from "react";
import { envoyerNotificationTest } from "../actions-notifications";
import { Bouton } from "@/components/ui";

export function BoutonNotificationTest({ clientId }: { clientId: string }) {
  const [enCours, demarrer] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="mt-1 space-y-1">
      <Bouton
        variante="secondaire"
        taille="petit"
        disabled={enCours}
        onClick={() =>
          demarrer(async () => {
            const r = await envoyerNotificationTest(clientId);
            setMessage(
              !r.ok
                ? r.erreur
                : r.telephones > 0
                  ? `Notification envoyée (${r.telephones} téléphone${r.telephones > 1 ? "s" : ""}).`
                  : "Aucun téléphone n'a reçu la notification : il faut sans doute les réactiver.",
            );
          })
        }
      >
        Envoyer une notification de test
      </Bouton>
      {message && (
        <p role="status" className="text-sm text-stone-700">
          {message}
        </p>
      )}
    </div>
  );
}
