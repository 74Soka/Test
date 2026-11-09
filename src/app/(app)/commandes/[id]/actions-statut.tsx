"use client";

import { useState, useTransition } from "react";
import { changerStatut, supprimerCommande } from "../actions";
import { marquerLivraison } from "@/app/(terrain)/tournee/actions";
import { Bouton, MessageErreur } from "@/components/ui";
import type { Statut } from "@/lib/domaine/commandes";

export function ActionsStatut({ id, statut, retour }: { id: string; statut: Statut; retour: string }) {
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const changer = (nouveau: Statut) =>
    demarrer(async () => {
      const r = await changerStatut(id, nouveau);
      setErreur(r.ok ? null : r.erreur);
    });

  // Non payée : le montant s'ajoute au compte du client, à encaisser à la prochaine livraison
  const livrer = (payee: boolean) =>
    demarrer(async () => {
      const r = await marquerLivraison(id, true, undefined, payee);
      setErreur(r.ok ? null : r.erreur);
    });

  return (
    <div className="space-y-2">
      {erreur && <MessageErreur>{erreur}</MessageErreur>}
      {statut === "a_livrer" && (
        <>
          <div className="grid grid-cols-[2fr_1fr] gap-2">
            <Bouton taille="grand" className="w-full" disabled={enCours} onClick={() => livrer(true)}>
              Livrée et payée
            </Bouton>
            <Bouton taille="grand" variante="secondaire" className="w-full" disabled={enCours} onClick={() => livrer(false)}>
              Livrée
            </Bouton>
          </div>
          <Bouton
            variante="secondaire"
            className="w-full"
            disabled={enCours}
            onClick={() => confirm("Annuler cette commande ?") && changer("annulee")}
          >
            Annuler la commande
          </Bouton>
        </>
      )}
      {statut !== "a_livrer" && (
        <Bouton variante="secondaire" className="w-full" disabled={enCours} onClick={() => changer("a_livrer")}>
          {statut === "livree" ? "Annuler la livraison (remettre « à livrer »)" : "Rétablir la commande"}
        </Bouton>
      )}
      <Bouton
        variante="discret"
        className="w-full text-red-700"
        disabled={enCours}
        onClick={() => {
          if (confirm("Supprimer définitivement cette commande ?")) {
            demarrer(async () => {
              const r = await supprimerCommande(id, retour);
              if (!r.ok) setErreur(r.erreur);
            });
          }
        }}
      >
        Supprimer la commande
      </Bouton>
    </div>
  );
}
