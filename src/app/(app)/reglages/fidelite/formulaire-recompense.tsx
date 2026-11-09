"use client";

import { useState, useTransition } from "react";
import {
  enregistrerRecompense,
  supprimerRecompense,
  type DonneesRecompense,
} from "./actions";
import { Bouton, Champ, MessageErreur, Selection } from "@/components/ui";
import type { Resultat } from "@/lib/erreurs";

export function FormulaireRecompense({
  id,
  initial,
  articles,
  cadeauParrainage = false,
}: {
  id?: string;
  initial?: DonneesRecompense;
  articles: { id: string; nom: string }[];
  /** Cadeau de parrainage : offert, donc sans coût ni niveau */
  cadeauParrainage?: boolean;
}) {
  const [donnees, setDonnees] = useState<DonneesRecompense>(
    initial ?? {
      nom: "",
      description: "",
      cout_tampons: "5",
      niveau: "standard",
      article_id: "",
      nb_offerts: "1",
      actif: true,
    },
  );
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const champs = resultat && !resultat.ok ? (resultat.champs ?? {}) : {};
  const maj = (p: Partial<DonneesRecompense>) =>
    setDonnees((d) => ({ ...d, ...p }));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        demarrer(async () =>
          setResultat(await enregistrerRecompense(donnees, id)),
        );
      }}
    >
      {resultat && !resultat.ok && (
        <MessageErreur>{resultat.erreur}</MessageErreur>
      )}
      <Champ
        label="Nom"
        name="nom"
        value={donnees.nom}
        onChange={(e) => maj({ nom: e.target.value })}
        erreur={champs.nom}
      />
      <Champ
        label="Ce qui est offert (texte affiché)"
        name="description"
        value={donnees.description ?? ""}
        onChange={(e) => maj({ description: e.target.value })}
        placeholder="Ex. 1 supplément au choix"
      />
      {!cadeauParrainage && (
        <Champ
          label="Coût en graines"
          name="cout_tampons"
          type="number"
          inputMode="numeric"
          min={1}
          value={donnees.cout_tampons}
          onChange={(e) => maj({ cout_tampons: e.target.value })}
          erreur={champs.cout_tampons}
        />
      )}
      {!cadeauParrainage && (
        <Selection
          label="Réservée à"
          name="niveau"
          value={donnees.niveau}
          onChange={(e) =>
            maj({ niveau: e.target.value as DonneesRecompense["niveau"] })
          }
        >
          <option value="standard">Tous les clients</option>
          <option value="vip">Clients VIP (et Ultra)</option>
          <option value="ultra">Clients Ultra</option>
        </Selection>
      )}
      <Selection
        label="Article proposé par défaut (facultatif)"
        name="article_id"
        value={donnees.article_id ?? ""}
        onChange={(e) => maj({ article_id: e.target.value })}
      >
        <option value="">Aucun : au choix</option>
        {articles.map((a) => (
          <option key={a.id} value={a.id}>
            {a.nom}
          </option>
        ))}
      </Selection>
      {cadeauParrainage && !donnees.article_id && (
        <p className="-mt-2 text-sm text-stone-600">
          Choisissez l&apos;article offert pour que ce cadeau s&apos;ajoute tout seul aux commandes passées en ligne.
          Sinon, ajoutez-le vous-même depuis la commande.
        </p>
      )}
      {!cadeauParrainage && !donnees.article_id && (
        <Champ
          label="Suppléments au choix (commande en ligne)"
          name="nb_offerts"
          type="number"
          inputMode="numeric"
          min={1}
          max={10}
          value={donnees.nb_offerts ?? "1"}
          onChange={(e) => maj({ nb_offerts: e.target.value })}
          erreur={champs.nb_offerts}
          aide="Quand le client utilise cette récompense en ligne, il choisit ce nombre de suppléments."
        />
      )}
      <label className="flex min-h-12 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={donnees.actif}
          onChange={(e) => maj({ actif: e.target.checked })}
          className="size-6 accent-marque-700"
        />
        <span className="font-medium">Récompense proposée</span>
      </label>
      <Bouton
        type="submit"
        taille="grand"
        className="w-full"
        disabled={enCours}
      >
        {enCours ? "Enregistrement…" : "Enregistrer"}
      </Bouton>
      {id && !cadeauParrainage && (
        <Bouton
          variante="discret"
          className="w-full text-red-700"
          disabled={enCours}
          onClick={() => {
            if (
              confirm(
                "Supprimer cette récompense ? Celles déjà utilisées restent dans l'historique des clients.",
              )
            ) {
              demarrer(async () => setResultat(await supprimerRecompense(id)));
            }
          }}
        >
          Supprimer la récompense
        </Bouton>
      )}
    </form>
  );
}
