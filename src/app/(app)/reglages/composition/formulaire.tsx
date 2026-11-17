"use client";

import { useState, useTransition } from "react";
import { enregistrerComposition, type ResultatComposition } from "../actions-boutique";
import { Bouton, Carte, MessageErreur, ZoneTexte } from "@/components/ui";

const DATE_HEURE = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  weekday: "long",
  hour: "2-digit",
  minute: "2-digit",
});
const JOUR_HEURE = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

export function FormulaireComposition({
  semaine,
  paniers,
  initial,
  precedente,
  annonceEnvoyee,
  annonceProgrammee = null,
  annoncable,
}: {
  semaine: string;
  paniers: { id: string; nom: string }[];
  initial: Record<string, string>;
  precedente: Record<string, string>;
  /** Clients déjà prévenus cette semaine-là (date), ou null */
  annonceEnvoyee: string | null;
  /** Annonce programmée (12 h 30 suivant l'enregistrement), ou null */
  annonceProgrammee?: string | null;
  /** Semaine en cours ou à venir */
  annoncable: boolean;
}) {
  const [contenus, setContenus] = useState<Record<string, string>>(() =>
    Object.fromEntries(paniers.map((p) => [p.id, initial[p.id] ?? ""])),
  );
  const [resultat, setResultat] = useState<ResultatComposition | null>(null);
  const [enCours, demarrer] = useTransition();
  const aReprendre = paniers.some((p) => precedente[p.id]);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        demarrer(async () => {
          setResultat(await enregistrerComposition({ semaine, contenus }));
        });
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
      {annoncable &&
        (annonceEnvoyee ? (
          <p className="text-sm text-stone-600">📣 Clients prévenus {DATE_HEURE.format(new Date(annonceEnvoyee))}.</p>
        ) : annonceProgrammee ? (
          <p role="status" className="rounded-xl bg-marque-50 px-3 py-2 text-sm font-semibold text-marque-900">
            📣 Annonce aux clients programmée {JOUR_HEURE.format(new Date(annonceProgrammee))}.
          </p>
        ) : (
          <p className="text-sm text-stone-600">
            📣 Les clients seront prévenus par notification à 12 h 30 après l&apos;enregistrement (le jour même avant
            12 h 30, sinon le lendemain), une fois par semaine.
          </p>
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
