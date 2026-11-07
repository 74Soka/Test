"use client";

import { useState, useTransition } from "react";
import { enregistrerParametres, type DonneesParametres } from "./actions";
import { Bouton, Champ, MessageErreur } from "@/components/ui";
import type { Resultat } from "@/lib/erreurs";

const CHAMPS: {
  cle: keyof Omit<DonneesParametres, "filleuls_livres_seulement" | "parrainage_cadeaux_debut">;
  label: string;
}[] = [
  { cle: "tampons_bienvenue", label: "Tampons offerts à la création d'un client" },
  { cle: "tampons_parrainage", label: "Tampons pour le parrain quand on lui rattache un filleul" },
  { cle: "tampons_parrain_par_commande", label: "Tampons pour le parrain à chaque commande livrée d'un filleul" },
  { cle: "filleuls_vip", label: "Filleuls nécessaires pour être VIP" },
  { cle: "filleuls_ultra", label: "Filleuls nécessaires pour être Ultra" },
];

export function FormulaireParametres({ initial }: { initial: DonneesParametres }) {
  const [donnees, setDonnees] = useState<DonneesParametres>(initial);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const champs = resultat && !resultat.ok ? (resultat.champs ?? {}) : {};

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        demarrer(async () => setResultat(await enregistrerParametres(donnees)));
      }}
    >
      {resultat && !resultat.ok && <MessageErreur>{resultat.erreur}</MessageErreur>}
      {resultat?.ok && <p className="font-medium text-marque-800">Règles enregistrées.</p>}
      {CHAMPS.map((c) => (
        <Champ
          key={c.cle}
          label={c.label}
          name={c.cle}
          type="number"
          inputMode="numeric"
          min={0}
          value={donnees[c.cle]}
          onChange={(e) => setDonnees({ ...donnees, [c.cle]: e.target.value })}
          erreur={champs[c.cle]}
        />
      ))}
      <label className="flex min-h-12 cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={donnees.filleuls_livres_seulement}
          onChange={(e) => setDonnees({ ...donnees, filleuls_livres_seulement: e.target.checked })}
          className="mt-1 size-6 accent-marque-700"
        />
        <span>
          <span className="block font-medium">Ne compter que les filleuls déjà livrés</span>
          <span className="block text-sm text-stone-600">
            Pour VIP et Ultra, un filleul compte seulement après sa première livraison.
          </span>
        </span>
      </label>
      <Champ
        label="Début de l'offre de parrainage (œufs au filleul, confiture au parrain)"
        name="parrainage_cadeaux_debut"
        type="date"
        value={donnees.parrainage_cadeaux_debut}
        onChange={(e) => setDonnees({ ...donnees, parrainage_cadeaux_debut: e.target.value })}
        erreur={champs.parrainage_cadeaux_debut}
        aide="Seuls les filleuls dont la première commande est livrée à partir de cette date y ont droit."
      />
      <p className="text-sm text-stone-600">
        Les changements valent pour la suite : les tampons déjà gagnés ne sont pas recalculés.
      </p>
      <Bouton type="submit" className="w-full" disabled={enCours}>
        {enCours ? "Enregistrement…" : "Enregistrer les règles"}
      </Bouton>
    </form>
  );
}
