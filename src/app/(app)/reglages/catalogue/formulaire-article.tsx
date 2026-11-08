"use client";

import { useState, useTransition } from "react";
import { enregistrerArticle, supprimerArticle, type DonneesArticle } from "./actions";
import { Bouton, Champ, MessageErreur, cx } from "@/components/ui";
import type { Resultat } from "@/lib/erreurs";

export function FormulaireArticle({ id, initial }: { id?: string; initial?: DonneesArticle }) {
  const vide: DonneesArticle = { nom: "", categorie: "supplement", prix: "", tampons: "0" };
  const [donnees, setDonnees] = useState<DonneesArticle>(initial ?? vide);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const champs = resultat && !resultat.ok ? (resultat.champs ?? {}) : {};

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        demarrer(async () => {
          const r = await enregistrerArticle(donnees, id);
          setResultat(r);
          if (r.ok) setDonnees(vide);
        });
      }}
    >
      {resultat && !resultat.ok && <MessageErreur>{resultat.erreur}</MessageErreur>}
      {resultat?.ok && <p className="font-medium text-feuille-700">Article ajouté.</p>}
      <fieldset>
        <legend className="mb-1.5 font-medium text-stone-800">Type</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["panier", "supplement"] as const).map((c) => (
            <label
              key={c}
              className={cx(
                "flex min-h-12 cursor-pointer items-center justify-center rounded-xl font-semibold ring-1",
                donnees.categorie === c ? "bg-marque-700 text-white ring-marque-700" : "bg-white ring-stone-300",
              )}
            >
              <input
                type="radio"
                name="categorie"
                className="sr-only"
                checked={donnees.categorie === c}
                onChange={() => setDonnees({ ...donnees, categorie: c })}
              />
              {c === "panier" ? "Panier" : "Supplément"}
            </label>
          ))}
        </div>
      </fieldset>
      <Champ
        label="Nom"
        name="nom"
        value={donnees.nom}
        onChange={(e) => setDonnees({ ...donnees, nom: e.target.value })}
        erreur={champs.nom}
        placeholder={donnees.categorie === "panier" ? "Ex. Panier 30 €" : "Ex. Œufs (boîte de 6)"}
        required
      />
      <Champ
        label="Prix (€)"
        name="prix"
        inputMode="decimal"
        value={donnees.prix}
        onChange={(e) => setDonnees({ ...donnees, prix: e.target.value })}
        erreur={champs.prix}
        placeholder="5"
        required
        aide={id ? "Le nouveau prix s'applique aux prochaines commandes ; les commandes déjà saisies gardent leur prix." : undefined}
      />
      <Champ
        label="Tampons de fidélité gagnés (par unité livrée)"
        name="tampons"
        type="number"
        inputMode="numeric"
        min={0}
        max={100}
        value={donnees.tampons ?? "0"}
        onChange={(e) => setDonnees({ ...donnees, tampons: e.target.value })}
        erreur={champs.tampons}
        aide="Ex. 1 pour le Panier 30 €, 2 pour le Panier 50 €, 0 pour un supplément."
      />
      <Bouton type="submit" className="w-full" disabled={enCours}>
        {enCours ? "Enregistrement…" : id ? "Enregistrer" : "Ajouter au catalogue"}
      </Bouton>
      {id && (
        <Bouton
          variante="discret"
          className="w-full text-red-700"
          disabled={enCours}
          onClick={() => {
            if (confirm("Supprimer définitivement cet article du catalogue ?")) {
              demarrer(async () => setResultat(await supprimerArticle(id)));
            }
          }}
        >
          Supprimer l&apos;article
        </Bouton>
      )}
    </form>
  );
}
