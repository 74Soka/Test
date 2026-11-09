"use client";

import { useState, useTransition } from "react";
import { ajusterTampons } from "../actions-fidelite";
import { Bouton, Champ, MessageErreur } from "@/components/ui";
import type { Resultat } from "@/lib/erreurs";

export function AjustementTampons({ clientId }: { clientId: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [quantite, setQuantite] = useState("1");
  const [note, setNote] = useState("");
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const champs = resultat && !resultat.ok ? (resultat.champs ?? {}) : {};

  if (!ouvert) {
    return (
      <Bouton variante="discret" taille="petit" className="-ml-3" onClick={() => setOuvert(true)}>
        Ajouter ou retirer des graines à la main…
      </Bouton>
    );
  }

  return (
    <form
      className="space-y-3 rounded-2xl bg-marque-50 p-3 ring-1 ring-marque-100"
      onSubmit={(e) => {
        e.preventDefault();
        demarrer(async () => {
          const r = await ajusterTampons({ clientId, quantite: Number(quantite), note });
          setResultat(r);
          if (r.ok) {
            setOuvert(false);
            setNote("");
            setQuantite("1");
          }
        });
      }}
    >
      {resultat && !resultat.ok && <MessageErreur>{resultat.erreur}</MessageErreur>}
      <Champ
        label="Graines (négatif pour en retirer)"
        name="quantite"
        type="number"
        inputMode="numeric"
        step={1}
        value={quantite}
        onChange={(e) => setQuantite(e.target.value)}
        erreur={champs.quantite}
      />
      <Champ
        label="Raison"
        name="note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        erreur={champs.note}
        placeholder="Ex. geste commercial, erreur de saisie"
      />
      <div className="flex gap-2">
        <Bouton type="submit" disabled={enCours}>
          {enCours ? "Enregistrement…" : "Enregistrer"}
        </Bouton>
        <Bouton variante="secondaire" onClick={() => setOuvert(false)}>
          Annuler
        </Bouton>
      </div>
    </form>
  );
}
