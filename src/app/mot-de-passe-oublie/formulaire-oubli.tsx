"use client";

import { useActionState } from "react";
import { demanderNouveauMotDePasse, type EtatOubli } from "@/app/connexion/actions";
import { Bouton, Champ, MessageErreur } from "@/components/ui";

export function FormulaireOubli() {
  const [etat, action, enCours] = useActionState<EtatOubli, FormData>(demanderNouveauMotDePasse, {});

  if (etat.envoyeA) {
    return (
      <p className="text-center text-stone-700" role="status">
        Si un compte existe pour <strong>{etat.envoyeA}</strong>, un e-mail vient de partir avec un lien pour choisir un
        nouveau mot de passe.
      </p>
    );
  }
  return (
    <form action={action} className="space-y-4">
      {etat.erreur && <MessageErreur>{etat.erreur}</MessageErreur>}
      <Champ label="Adresse e-mail" name="email" type="email" autoComplete="email" inputMode="email" required />
      <Bouton type="submit" taille="grand" className="w-full" disabled={enCours}>
        {enCours ? "Envoi…" : "Recevoir le lien"}
      </Bouton>
    </form>
  );
}
