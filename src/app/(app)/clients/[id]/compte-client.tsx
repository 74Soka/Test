"use client";

import { useState, useTransition } from "react";
import { enregistrerMouvement, supprimerMouvement } from "../actions-compte";
import { Bouton, Carte, Champ, MessageErreur, Selection, TitreSection } from "@/components/ui";
import { formaterPrix } from "@/lib/domaine/argent";
import { formaterDate } from "@/lib/domaine/dates";
import type { Resultat } from "@/lib/erreurs";

type Mouvement = {
  id: string;
  montant_centimes: number;
  motif: string;
  note: string | null;
  created_at: string;
  commande_id: string | null;
  commande: { date_livraison: string } | null;
};

const LIBELLES: Record<string, string> = { livraison: "Livraison", paiement: "Paiement", ajustement: "Correction" };

/** Compte du client : ce qu'il doit (ou son avoir), l'historique, et la saisie d'un paiement. */
export function CompteClient({ clientId, solde, mouvements }: { clientId: string; solde: number; mouvements: Mouvement[] }) {
  const [ouvert, setOuvert] = useState(false);
  const [type, setType] = useState<"paiement" | "du" | "avoir">("paiement");
  const [montant, setMontant] = useState("");
  const [note, setNote] = useState("");
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const champs = resultat && !resultat.ok ? (resultat.champs ?? {}) : {};

  return (
    <Carte aria-label="Compte du client" className="space-y-3">
      <TitreSection>Compte</TitreSection>
      <p
        className={
          solde > 0 ? "text-2xl font-bold text-amber-800" : solde < 0 ? "text-2xl font-bold text-feuille-700" : "text-2xl font-bold"
        }
      >
        {solde > 0 ? `${formaterPrix(solde)} dus` : solde < 0 ? `Avoir de ${formaterPrix(-solde)}` : "À jour"}
      </p>
      {solde > 0 && <p className="-mt-2 text-sm text-stone-600">À encaisser avec la prochaine livraison.</p>}

      {mouvements.length > 0 && (
        <ul className="divide-y divide-stone-100 text-sm">
          {mouvements.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 py-2">
              <span>
                <span className="font-medium">{LIBELLES[m.motif] ?? m.motif}</span>
                {m.commande && ` du ${formaterDate(m.commande.date_livraison)}`}
                {m.note && <span className="block text-stone-600">{m.note}</span>}
              </span>
              <span className="flex items-center gap-2">
                <span className={m.montant_centimes > 0 ? "font-semibold tabular-nums" : "font-semibold text-feuille-700 tabular-nums"}>
                  {m.montant_centimes > 0 ? "+" : "−"} {formaterPrix(Math.abs(m.montant_centimes))}
                </span>
                {!m.commande_id && (
                  <Bouton
                    variante="discret"
                    taille="petit"
                    aria-label="Supprimer ce mouvement"
                    disabled={enCours}
                    onClick={() =>
                      confirm("Supprimer ce mouvement ?") &&
                      demarrer(async () => setResultat(await supprimerMouvement(clientId, m.id)))
                    }
                  >
                    ✕
                  </Bouton>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {resultat && !resultat.ok && !champs.montant && <MessageErreur>{resultat.erreur}</MessageErreur>}
      {ouvert ? (
        <form
          className="space-y-3 rounded-2xl bg-stone-50 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            demarrer(async () => {
              const r = await enregistrerMouvement({ clientId, type, montant, note });
              setResultat(r);
              if (r.ok) {
                setMontant("");
                setNote("");
                setOuvert(false);
              }
            });
          }}
        >
          <Selection label="Type" name="type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="paiement">Paiement reçu (virement, chèque…)</option>
            <option value="du">Somme due par le client</option>
            <option value="avoir">Avoir (on lui doit)</option>
          </Selection>
          <Champ label="Montant (€)" name="montant" inputMode="decimal" value={montant} onChange={(e) => setMontant(e.target.value)} erreur={champs.montant} />
          <Champ label="Note (facultatif)" name="note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Bouton type="submit" disabled={enCours}>
              Enregistrer
            </Bouton>
            <Bouton variante="secondaire" onClick={() => setOuvert(false)}>
              Annuler
            </Bouton>
          </div>
        </form>
      ) : (
        <Bouton variante="secondaire" className="w-full" onClick={() => setOuvert(true)}>
          Noter un paiement ou corriger
        </Bouton>
      )}
    </Carte>
  );
}
