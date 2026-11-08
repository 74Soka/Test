"use client";

import { useState, useTransition } from "react";
import { modifierMesCoordonnees } from "../actions";
import { Bouton, Champ, MessageErreur, ZoneTexte } from "@/components/ui";

export function FormulaireCoordonnees(initial: { telephone: string; notesLivraison: string }) {
  const [telephone, setTelephone] = useState(initial.telephone);
  const [notesLivraison, setNotes] = useState(initial.notesLivraison);
  const [erreur, setErreur] = useState<string | null>(null);
  const [champs, setChamps] = useState<Record<string, string>>({});
  const [enregistre, setEnregistre] = useState(false);
  const [enCours, demarrer] = useTransition();

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setEnregistre(false);
        demarrer(async () => {
          const r = await modifierMesCoordonnees({ telephone, notesLivraison });
          if (!r.ok) {
            setErreur(r.erreur);
            setChamps(r.champs ?? {});
            return;
          }
          setErreur(null);
          setChamps({});
          setEnregistre(true);
        });
      }}
    >
      {erreur && <MessageErreur>{erreur}</MessageErreur>}
      <Champ
        label="Téléphone"
        name="telephone"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        value={telephone}
        onChange={(e) => setTelephone(e.target.value)}
        erreur={champs.telephone}
      />
      <ZoneTexte
        label="Consignes de livraison"
        name="notesLivraison"
        value={notesLivraison}
        maxLength={500}
        onChange={(e) => setNotes(e.target.value)}
        aide="Code du portail, endroit où déposer le panier…"
        erreur={champs.notesLivraison}
      />
      <Bouton type="submit" className="w-full" disabled={enCours}>
        {enCours ? "Enregistrement…" : "Enregistrer"}
      </Bouton>
      {enregistre && (
        <p role="status" className="text-center font-medium text-feuille-700">
          ✓ Enregistré
        </p>
      )}
    </form>
  );
}
