"use client";

import { useState, useTransition } from "react";
import { enregistrerCommandesEnLigne, type DonneesCommandesEnLigne } from "../actions-boutique";
import { Bouton, Champ, MessageErreur, Selection, ZoneTexte } from "@/components/ui";
import { NOMS_JOURS } from "@/lib/domaine/dates";
import type { Resultat } from "@/lib/erreurs";

export function FormulaireCommandesEnLigne({ initial }: { initial: DonneesCommandesEnLigne }) {
  const [d, setD] = useState(initial);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const champs = resultat && !resultat.ok ? (resultat.champs ?? {}) : {};
  const maj = (p: Partial<DonneesCommandesEnLigne>) => {
    setResultat(null);
    setD((x) => ({ ...x, ...p }));
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        demarrer(async () => setResultat(await enregistrerCommandesEnLigne(d)));
      }}
    >
      {resultat && !resultat.ok && <MessageErreur>{resultat.erreur}</MessageErreur>}
      <label className="flex min-h-12 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={d.commandes_ouvertes}
          onChange={(e) => maj({ commandes_ouvertes: e.target.checked })}
          className="size-6 accent-marque-700"
        />
        <span className="font-medium">Les clients peuvent commander en ligne</span>
      </label>
      <fieldset className="space-y-2">
        <legend className="font-medium">Clôture des commandes avant chaque livraison</legend>
        <div className="grid grid-cols-2 gap-3">
          <Selection
            label="Jour"
            name="cloture_jour"
            value={d.cloture_jour}
            onChange={(e) => maj({ cloture_jour: Number(e.target.value) })}
          >
            {NOMS_JOURS.map((j, i) => (
              <option key={j} value={i + 1}>
                {j}
              </option>
            ))}
          </Selection>
          <Champ
            label="Heure"
            name="cloture_heure"
            type="time"
            value={d.cloture_heure}
            onChange={(e) => maj({ cloture_heure: e.target.value })}
            erreur={champs.cloture_heure}
          />
        </div>
        <p className="text-sm text-stone-600">
          Après cette heure, les clients ne peuvent plus commander ni modifier pour la livraison qui suit : ils commandent
          pour la semaine d&apos;après. Vous pouvez toujours modifier une commande vous-même.
        </p>
      </fieldset>
      <ZoneTexte
        label="Message aux clients (facultatif)"
        name="message_clients"
        value={d.message_clients}
        maxLength={500}
        onChange={(e) => maj({ message_clients: e.target.value })}
        placeholder="Ex. : pas de livraison le 26 décembre, bonnes fêtes !"
        erreur={champs.message_clients}
        aide="Affiché en haut de l'espace client."
      />
      <Bouton type="submit" taille="grand" className="w-full" disabled={enCours}>
        {enCours ? "Enregistrement…" : "Enregistrer"}
      </Bouton>
      {resultat?.ok && (
        <p role="status" className="text-center font-medium text-marque-800">
          ✓ Enregistré
        </p>
      )}
    </form>
  );
}
