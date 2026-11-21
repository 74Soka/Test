"use client";

import { useActionState } from "react";
import { changerMotDePasse, type EtatNouveauMotDePasse } from "@/app/connexion/actions";
import { ChampMotDePasse } from "@/components/champ-mot-de-passe";
import { Bouton, MessageErreur } from "@/components/ui";

export function FormulaireNouveauMotDePasse() {
  const [etat, action, enCours] = useActionState<EtatNouveauMotDePasse, FormData>(changerMotDePasse, {});
  return (
    <form action={action} className="space-y-4">
      {etat.erreur && <MessageErreur>{etat.erreur}</MessageErreur>}
      <ChampMotDePasse
        label="Nouveau mot de passe"
        name="motDePasse"
                autoComplete="new-password"
        required
        minLength={8}
        aide="8 caractères au moins."
      />
      <Bouton type="submit" taille="grand" className="w-full" disabled={enCours}>
        {enCours ? "Enregistrement…" : "Enregistrer"}
      </Bouton>
    </form>
  );
}
