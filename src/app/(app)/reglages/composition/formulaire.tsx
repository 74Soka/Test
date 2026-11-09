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

export function FormulaireComposition({
  semaine,
  paniers,
  initial,
  precedente,
  annonceEnvoyee,
  annoncable,
}: {
  semaine: string;
  paniers: { id: string; nom: string }[];
  initial: Record<string, string>;
  precedente: Record<string, string>;
  /** Clients déjà prévenus cette semaine-là (date), ou null */
  annonceEnvoyee: string | null;
  /** Semaine en cours ou à venir */
  annoncable: boolean;
}) {
  const [contenus, setContenus] = useState<Record<string, string>>(() =>
    Object.fromEntries(paniers.map((p) => [p.id, initial[p.id] ?? ""])),
  );
  const [resultat, setResultat] = useState<ResultatComposition | null>(null);
  const [prevenir, setPrevenir] = useState(!annonceEnvoyee && annoncable);
  const [annoncee, setAnnoncee] = useState(annonceEnvoyee);
  const [enCours, demarrer] = useTransition();
  const aReprendre = paniers.some((p) => precedente[p.id]);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        demarrer(async () => {
          const r = await enregistrerComposition({
            semaine,
            contenus,
            prevenir: prevenir && !annoncee,
            panierPrincipal: paniers[0]?.id ?? null,
          });
          setResultat(r);
          if (r.ok && r.prevenus !== undefined && r.prevenus !== null) {
            setAnnoncee(new Date().toISOString());
            setPrevenir(false);
          }
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
        (annoncee ? (
          <p className="text-sm text-stone-600">📣 Clients prévenus {DATE_HEURE.format(new Date(annoncee))}.</p>
        ) : (
          <label className="flex min-h-12 cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={prevenir}
              onChange={(e) => setPrevenir(e.target.checked)}
              className="size-6 accent-marque-700"
            />
            <span className="font-medium">📣 Prévenir les clients par notification (une fois par semaine)</span>
          </label>
        ))}
      <Bouton type="submit" taille="grand" className="w-full" disabled={enCours}>
        {enCours ? "Enregistrement…" : "Enregistrer la composition"}
      </Bouton>
      {resultat?.ok && (
        <p role="status" className="text-center font-medium text-feuille-700">
          ✓ Composition enregistrée
          {resultat.prevenus !== undefined &&
            resultat.prevenus !== null &&
            ` · ${resultat.prevenus} téléphone${resultat.prevenus > 1 ? "s" : ""} prévenu${resultat.prevenus > 1 ? "s" : ""}`}
        </p>
      )}
    </form>
  );
}
