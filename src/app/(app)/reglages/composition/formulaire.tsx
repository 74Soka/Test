"use client";

import { useState, useTransition } from "react";
import { enregistrerComposition } from "../actions-boutique";
import { Bouton, Carte, MessageErreur, ZoneTexte } from "@/components/ui";
import type { Resultat } from "@/lib/erreurs";

export function FormulaireComposition({
  semaine,
  paniers,
  initial,
  precedente,
}: {
  semaine: string;
  paniers: { id: string; nom: string }[];
  initial: Record<string, string>;
  precedente: Record<string, string>;
}) {
  const [contenus, setContenus] = useState<Record<string, string>>(() =>
    Object.fromEntries(paniers.map((p) => [p.id, initial[p.id] ?? ""])),
  );
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const aReprendre = paniers.some((p) => precedente[p.id]);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        demarrer(async () => setResultat(await enregistrerComposition({ semaine, contenus })));
      }}
    >
      {resultat && !resultat.ok && <MessageErreur>{resultat.erreur}</MessageErreur>}
      {aReprendre && (
        <Bouton
          variante="secondaire"
          className="w-full"
          onClick={() => {
            setResultat(null);
            setContenus(Object.fromEntries(paniers.map((p) => [p.id, precedente[p.id] ?? contenus[p.id] ?? ""])));
          }}
        >
          Reprendre la semaine précédente
        </Bouton>
      )}
      {paniers.map((p) => (
        <Carte key={p.id}>
          <ZoneTexte
            label={p.nom}
            name={`contenu-${p.id}`}
            rows={7}
            value={contenus[p.id] ?? ""}
            maxLength={2000}
            onChange={(e) => {
              setResultat(null);
              setContenus((c) => ({ ...c, [p.id]: e.target.value }));
            }}
            placeholder={"1 kg de pommes de terre\n1 salade\n4 pommes…"}
            aide="Un produit par ligne. Les clients le voient dans leur espace."
          />
        </Carte>
      ))}
      <Bouton type="submit" taille="grand" className="w-full" disabled={enCours}>
        {enCours ? "Enregistrement…" : "Enregistrer la composition"}
      </Bouton>
      {resultat?.ok && (
        <p role="status" className="text-center font-medium text-feuille-700">
          ✓ Composition enregistrée
        </p>
      )}
    </form>
  );
}
