"use client";

import { useState, useTransition } from "react";
import { donnerMonAvis } from "../../actions";
import { Bouton, Carte, MessageErreur, ZoneTexte, cx } from "@/components/ui";

const LIBELLES = ["Décevant", "Bof", "Correct", "Bien", "Excellent"];

export function FormulaireAvis({
  commandeId,
  initial,
}: {
  commandeId: string;
  initial: { note: number | null; commentaire: string | null } | null;
}) {
  const [note, setNote] = useState<number | null>(initial?.note ?? null);
  const [commentaire, setCommentaire] = useState(initial?.commentaire ?? "");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoye, setEnvoye] = useState(false);
  const [enCours, demarrer] = useTransition();

  if (envoye) {
    return (
      <Carte className="space-y-2 text-center" role="status">
        <p className="text-4xl" aria-hidden>
          🧡
        </p>
        <p className="font-titre text-xl text-marque-800">Merci !</p>
        <p className="text-stone-700">
          Votre avis est transmis à l&apos;équipe.
          {note !== null && note <= 2 && " Nous revenons vers vous rapidement."}
        </p>
      </Carte>
    );
  }

  return (
    <Carte className="space-y-4">
      {erreur && <MessageErreur>{erreur}</MessageErreur>}
      <fieldset>
        <legend className="mb-2 font-semibold">Comment était votre panier ?</legend>
        <div className="flex justify-between gap-1" role="radiogroup" aria-label="Note">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={note === n}
              aria-label={`${n} étoile${n > 1 ? "s" : ""} : ${LIBELLES[n - 1]}`}
              onClick={() => setNote(note === n ? null : n)}
              className={cx(
                "flex size-14 items-center justify-center rounded-full text-3xl transition active:scale-95",
                note !== null && n <= note ? "bg-peche-50 text-peche-600" : "bg-marque-50 text-marque-200",
              )}
            >
              ★
            </button>
          ))}
        </div>
        {note !== null && <p className="mt-2 text-center font-semibold text-marque-800">{LIBELLES[note - 1]}</p>}
      </fieldset>
      <ZoneTexte
        label="Un commentaire ? (facultatif)"
        name="commentaire"
        value={commentaire}
        maxLength={1000}
        rows={4}
        onChange={(e) => setCommentaire(e.target.value)}
        placeholder="Un produit abîmé, un oubli, une idée, un compliment…"
      />
      <Bouton
        taille="grand"
        className="w-full"
        disabled={enCours || (note === null && !commentaire.trim())}
        onClick={() =>
          demarrer(async () => {
            const r = await donnerMonAvis({ commandeId, note, commentaire });
            if (!r.ok) return setErreur(r.erreur);
            setEnvoye(true);
          })
        }
      >
        {enCours ? "Envoi…" : initial ? "Mettre à jour mon avis" : "Envoyer mon avis"}
      </Bouton>
    </Carte>
  );
}
