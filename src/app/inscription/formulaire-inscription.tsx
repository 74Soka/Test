"use client";

import { useActionState } from "react";
import { creerCompteClient, type EtatInscription } from "@/app/connexion/actions";
import { Bouton, Champ, MessageErreur } from "@/components/ui";

export function FormulaireInscription() {
  const [etat, action, enCours] = useActionState<EtatInscription, FormData>(creerCompteClient, {});

  if (etat.envoyeA) {
    return (
      <div className="space-y-3 text-center" role="status">
        <p className="text-4xl" aria-hidden>
          ✉️
        </p>
        <p className="text-lg font-bold">Vérifiez vos e-mails</p>
        <p className="text-stone-700">
          Un lien de confirmation vient d&apos;être envoyé à <strong>{etat.envoyeA}</strong>. Cliquez dessus pour activer
          votre compte (pensez à regarder dans les indésirables).
        </p>
      </div>
    );
  }

  const v = etat.valeurs ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      {etat.erreur && <MessageErreur>{etat.erreur}</MessageErreur>}
      <div className="grid grid-cols-2 gap-3">
        <Champ label="Prénom" name="prenom" autoComplete="given-name" defaultValue={v.prenom} erreur={etat.champs?.prenom} />
        <Champ label="Nom" name="nom" autoComplete="family-name" required defaultValue={v.nom} erreur={etat.champs?.nom} />
      </div>
      <Champ
        label="Adresse e-mail"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={v.email}
        erreur={etat.champs?.email}
        aide="Si vous êtes déjà client, utilisez l'adresse que vous nous avez donnée : votre compte sera relié tout seul."
      />
      <Champ
        label="Mot de passe"
        name="motDePasse"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        erreur={etat.champs?.motDePasse}
        aide="8 caractères au moins."
      />
      <p className="text-sm text-stone-600">
        Vos informations servent uniquement à vos commandes et à vos livraisons. Vous pouvez supprimer votre compte à
        tout moment.
      </p>
      <Bouton type="submit" taille="grand" className="w-full" disabled={enCours}>
        {enCours ? "Création…" : "Créer mon compte"}
      </Bouton>
    </form>
  );
}
