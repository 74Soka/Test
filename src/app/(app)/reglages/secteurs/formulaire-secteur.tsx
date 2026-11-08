"use client";

import { useState, useTransition } from "react";
import { enregistrerSecteur, supprimerSecteur, type DonneesSecteur } from "./actions";
import { RechercheAdresse } from "@/components/recherche-adresse";
import { Bouton, Carte, Champ, MessageErreur, Selection, cx } from "@/components/ui";
import { NOMS_JOURS } from "@/lib/domaine/dates";
import { LIBELLES_CRENEAU, type Creneau } from "@/lib/domaine/secteurs";
import type { Resultat } from "@/lib/erreurs";
import type { AdresseTrouvee, CommuneTrouvee } from "@/lib/geocodage/types";

const COULEURS = ["#2563eb", "#dc2626", "#9333ea", "#ea580c", "#0d9488", "#ca8a04", "#db2777", "#4b5563"];

/** Centre du Var : sert à orienter les recherches d'adresses */
const CENTRE_VAR = { lat: 43.43, lng: 6.22 };

export function FormulaireSecteur({
  id,
  initial,
  nombreClients = 0,
}: {
  id?: string;
  initial?: DonneesSecteur;
  nombreClients?: number;
}) {
  const [donnees, setDonnees] = useState<DonneesSecteur>(
    initial ?? {
      nom: "",
      jour: 6,
      creneau: "matin",
      couleur: COULEURS[0],
      depart: undefined as unknown as DonneesSecteur["depart"],
      communes: [],
    },
  );
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const champs = resultat && !resultat.ok ? (resultat.champs ?? {}) : {};

  const maj = (partiel: Partial<DonneesSecteur>) => setDonnees((d) => ({ ...d, ...partiel }));

  function ajouterCommune(c: CommuneTrouvee) {
    if (donnees.communes.some((x) => x.code_insee === c.codeInsee)) return;
    maj({ communes: [...donnees.communes, { code_insee: c.codeInsee, nom: c.nom }] });
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        demarrer(async () => setResultat(await enregistrerSecteur(donnees, id)));
      }}
    >
      {resultat && !resultat.ok && <MessageErreur>{resultat.erreur}</MessageErreur>}

      <Carte className="space-y-4">
        <Champ
          label="Nom du secteur"
          name="nom"
          value={donnees.nom}
          onChange={(e) => maj({ nom: e.target.value })}
          erreur={champs.nom}
          required
          placeholder="Ex. Toulon Ouest"
        />
        <Selection
          label="Jour de livraison"
          name="jour"
          value={donnees.jour}
          onChange={(e) => maj({ jour: Number(e.target.value) })}
        >
          {NOMS_JOURS.map((nom, i) => (
            <option key={nom} value={i + 1}>
              {nom.charAt(0).toUpperCase() + nom.slice(1)}
            </option>
          ))}
        </Selection>
        <fieldset>
          <legend className="mb-1.5 font-medium text-stone-800">Créneau</legend>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(LIBELLES_CRENEAU) as Creneau[]).map((c) => (
              <label
                key={c}
                className={cx(
                  "flex min-h-12 cursor-pointer items-center justify-center rounded-xl px-2 text-center font-semibold ring-1",
                  donnees.creneau === c ? "bg-marque-700 text-white ring-marque-700" : "bg-white ring-stone-300",
                )}
              >
                <input
                  type="radio"
                  name="creneau"
                  value={c}
                  checked={donnees.creneau === c}
                  onChange={() => maj({ creneau: c })}
                  className="sr-only"
                />
                {LIBELLES_CRENEAU[c].charAt(0).toUpperCase() + LIBELLES_CRENEAU[c].slice(1)}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1.5 font-medium text-stone-800">Couleur sur la carte</legend>
          <div className="flex flex-wrap gap-2">
            {COULEURS.map((c) => (
              <label key={c} className="cursor-pointer">
                <input
                  type="radio"
                  name="couleur"
                  value={c}
                  checked={donnees.couleur === c}
                  onChange={() => maj({ couleur: c })}
                  className="peer sr-only"
                  aria-label={`Couleur ${c}`}
                />
                <span
                  className="block size-11 rounded-full ring-offset-2 peer-checked:ring-3 peer-checked:ring-marque-800 peer-focus-visible:ring-3 peer-focus-visible:ring-marque-600"
                  style={{ backgroundColor: c }}
                />
              </label>
            ))}
          </div>
        </fieldset>
      </Carte>

      <Carte className="space-y-3">
        <RechercheAdresse<AdresseTrouvee>
          type="adresse"
          label="Point de départ de la tournée"
          placeholder="Adresse de la ferme, du dépôt…"
          proche={CENTRE_VAR}
          valeurInitiale={donnees.depart?.adresse ?? ""}
          erreur={champs.depart ?? champs["depart.adresse"]}
          onChoix={(a) => maj({ depart: { adresse: a.libelle, lat: a.lat, lng: a.lng } })}
        />
        {donnees.depart && <p className="text-sm text-stone-600">Retenu : {donnees.depart.adresse}</p>}
      </Carte>

      <Carte className="space-y-3">
        <RechercheAdresse<CommuneTrouvee>
          type="commune"
          label="Communes couvertes"
          placeholder="Ajouter une commune…"
          proche={CENTRE_VAR}
          viderApresChoix
          onChoix={ajouterCommune}
          aide="Le secteur sera proposé automatiquement pour les clients de ces communes."
        />
        {donnees.communes.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {donnees.communes.map((c) => (
              <li key={c.code_insee}>
                <button
                  type="button"
                  onClick={() => maj({ communes: donnees.communes.filter((x) => x.code_insee !== c.code_insee) })}
                  className="inline-flex min-h-10 items-center gap-2 rounded-full bg-stone-100 px-3 text-sm font-medium ring-1 ring-stone-300 hover:bg-red-50"
                  aria-label={`Retirer ${c.nom}`}
                >
                  {c.nom} <span aria-hidden>✕</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Carte>

      <Bouton type="submit" taille="grand" className="w-full" disabled={enCours}>
        {enCours ? "Enregistrement…" : "Enregistrer le secteur"}
      </Bouton>

      {id && (
        <div className="pt-4">
          <Bouton
            variante="discret"
            className="w-full text-red-700"
            disabled={enCours}
            onClick={() => {
              const message =
                nombreClients > 0
                  ? `Ce secteur contient ${nombreClients} client(s) : il ne pourra pas être supprimé. Continuer quand même ?`
                  : "Supprimer ce secteur ?";
              if (confirm(message)) demarrer(async () => setResultat(await supprimerSecteur(id)));
            }}
          >
            Supprimer le secteur
          </Bouton>
        </div>
      )}
    </form>
  );
}
