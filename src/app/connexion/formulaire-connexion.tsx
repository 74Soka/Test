"use client";

import { useActionState } from "react";
import { seConnecter, type EtatConnexion } from "./actions";
import { Bouton, Champ, MessageErreur } from "@/components/ui";

export function FormulaireConnexion({ suite }: { suite?: string }) {
  const [etat, action, enCours] = useActionState<EtatConnexion, FormData>(seConnecter, {});

  return (
    <form action={action} className="space-y-4">
      {suite && <input type="hidden" name="suite" value={suite} />}
      {etat.erreur && <MessageErreur>{etat.erreur}</MessageErreur>}
      <Champ
        label="Adresse e-mail"
        name="email"
        type="email"
        autoComplete="username"
        inputMode="email"
        required
        defaultValue={etat.email}
        key={etat.email ?? ""}
      />
      <Champ label="Mot de passe" name="motDePasse" type="password" autoComplete="current-password" required />
      <Bouton type="submit" taille="grand" className="w-full" disabled={enCours}>
        {enCours ? "Connexion…" : "Se connecter"}
      </Bouton>
    </form>
  );
}
