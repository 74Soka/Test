"use client";

import { useState, useTransition } from "react";
import { placerClientsSansRepere } from "./actions";
import { Bouton, MessageErreur } from "@/components/ui";

/** Fiches sans repère sur la carte : les placer d'après leur adresse, en un geste. */
export function PlacerReperes({ nombre }: { nombre: number }) {
  const [enCours, demarrer] = useTransition();
  const [bilan, setBilan] = useState<{ places: number; restants: number; introuvables: string[] } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const restants = bilan ? bilan.restants : nombre;
  if (restants === 0 && bilan === null) return null;

  return (
    <div
      role="region"
      aria-label="Fiches sans repère"
      className="mb-3 space-y-2 rounded-2xl bg-sky-50 px-4 py-3 ring-1 ring-sky-200"
    >
      <p className="font-semibold text-sky-900">
        📍 {restants === 0 ? "Toutes les fiches ont leur repère sur la carte." : `${restants} fiche${restants > 1 ? "s" : ""} sans repère sur la carte`}
      </p>
      {bilan && bilan.places > 0 && (
        <p role="status" className="text-sm text-sky-900">
          ✓ {bilan.places} placée{bilan.places > 1 ? "s" : ""} d&apos;après leur adresse.
        </p>
      )}
      {bilan && bilan.introuvables.length > 0 && (
        <p className="text-sm text-sky-900">
          Adresse introuvable, à placer à la main depuis la fiche : {bilan.introuvables.join(", ")}.
        </p>
      )}
      {erreur && <MessageErreur>{erreur}</MessageErreur>}
      {restants > 0 && (bilan === null || bilan.places > 0) && (
        <Bouton
          variante="secondaire"
          className="w-full"
          disabled={enCours}
          onClick={() =>
            demarrer(async () => {
              setErreur(null);
              const r = await placerClientsSansRepere();
              if (!r.ok) return setErreur(r.erreur);
              setBilan({ places: r.places ?? 0, restants: r.restants ?? 0, introuvables: r.introuvables ?? [] });
            })
          }
        >
          {enCours ? "Recherche des adresses…" : "Les placer automatiquement d'après l'adresse"}
        </Bouton>
      )}
    </div>
  );
}
