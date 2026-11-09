"use client";

import { useState, useTransition } from "react";
import { enregistrerRecette, type DonneesRecette } from "../actions-boutique";
import { Bouton, Carte, Champ, MessageErreur, TitreSection, ZoneTexte } from "@/components/ui";
import type { Resultat } from "@/lib/erreurs";

type Recette = Omit<DonneesRecette, "semaine">;
const VIDE: Recette = { titre: "", infos: "", ingredients: "", etapes: "", astuce: "" };

/** Recette de la semaine, affichée sur la page publique /paniers. */
export function FormulaireRecette({ semaine, initial }: { semaine: string; initial: Recette | null }) {
  const [recette, setRecette] = useState<Recette>(initial ?? VIDE);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const champs = resultat && !resultat.ok ? (resultat.champs ?? {}) : {};
  const maj = (cle: keyof Recette) => (e: { target: { value: string } }) => {
    setResultat(null);
    setRecette((r) => ({ ...r, [cle]: e.target.value }));
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        demarrer(async () => setResultat(await enregistrerRecette({ semaine, ...recette })));
      }}
    >
      <Carte className="space-y-3">
        <TitreSection>Recette de la semaine</TitreSection>
        <p className="-mt-2 text-sm text-stone-600">
          Affichée sur la page publique des paniers. Les ingrédients du panier et des suppléments sont repérés tout
          seuls.
        </p>
        {resultat && !resultat.ok && <MessageErreur>{resultat.erreur}</MessageErreur>}
        <Champ
          label="Nom de la recette"
          name="titre"
          value={recette.titre}
          onChange={maj("titre")}
          maxLength={200}
          erreur={champs.titre}
          placeholder="Poêlée paysanne, œufs au plat"
        />
        <Champ
          label="Infos (facultatif)"
          name="infos"
          value={recette.infos}
          onChange={maj("infos")}
          maxLength={200}
          placeholder="4 personnes · 35 min · Facile"
        />
        <ZoneTexte
          label="Ingrédients"
          name="ingredients"
          rows={6}
          value={recette.ingredients}
          onChange={maj("ingredients")}
          maxLength={3000}
          erreur={champs.ingredients}
          aide="Un ingrédient par ligne."
          placeholder={"1 kg de pommes de terre\n3 poireaux\n4 œufs"}
        />
        <ZoneTexte
          label="Préparation"
          name="etapes"
          rows={8}
          value={recette.etapes}
          onChange={maj("etapes")}
          maxLength={6000}
          erreur={champs.etapes}
          aide="Une étape par ligne : elles sont numérotées toutes seules."
        />
        <ZoneTexte
          label="Astuce (facultatif)"
          name="astuce"
          rows={2}
          value={recette.astuce}
          onChange={maj("astuce")}
          maxLength={1000}
        />
      </Carte>
      <Bouton type="submit" taille="grand" className="w-full" disabled={enCours}>
        {enCours ? "Enregistrement…" : "Enregistrer la recette"}
      </Bouton>
      {resultat?.ok && (
        <p role="status" className="text-center font-medium text-feuille-700">
          ✓ Recette enregistrée
        </p>
      )}
    </form>
  );
}
