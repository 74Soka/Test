"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { changerStatutInscription, validerInscription } from "./actions";
import { ChoixClient, type ClientChoisissable } from "@/components/choix-client";
import { Bouton, MessageErreur, Selection } from "@/components/ui";
import type { Resultat } from "@/lib/erreurs";

export function ValidationInscription({
  userId,
  statut,
  secteurs,
  secteurPropose,
  clientsLibres,
  parrains,
  parrainPropose = null,
}: {
  userId: string;
  statut: "en_attente" | "refusee";
  secteurs: { id: string; nom: string }[];
  secteurPropose: string | null;
  clientsLibres: ClientChoisissable[];
  parrains: ClientChoisissable[];
  /** Parrain retrouvé grâce au code saisi par le filleul */
  parrainPropose?: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"nouvelle" | "existante">("nouvelle");
  const [secteurId, setSecteurId] = useState(secteurPropose ?? "");
  const [parrainId, setParrainId] = useState<string | null>(parrainPropose);
  const [clientId, setClientId] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const agir = (fn: () => Promise<Resultat>) =>
    demarrer(async () => {
      const r = await fn();
      if (!r.ok) return setErreur(r.erreur);
      setErreur(null);
      router.refresh();
    });

  if (statut === "refusee") {
    return (
      <Bouton variante="secondaire" className="w-full" disabled={enCours} onClick={() => agir(() => changerStatutInscription(userId, "en_attente"))}>
        Remettre en attente
      </Bouton>
    );
  }

  return (
    <div className="space-y-3 border-t border-stone-200 pt-3">
      {erreur && <MessageErreur>{erreur}</MessageErreur>}
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Fiche client">
        {(["nouvelle", "existante"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={
              mode === m
                ? "min-h-11 rounded-full bg-marque-800 px-3 font-semibold text-white"
                : "min-h-11 rounded-xl bg-white px-3 font-semibold ring-1 ring-stone-300"
            }
          >
            {m === "nouvelle" ? "Nouvelle fiche" : "Fiche existante"}
          </button>
        ))}
      </div>
      {mode === "nouvelle" ? (
        <>
          <Selection label="Secteur" name={`secteur-${userId}`} value={secteurId} onChange={(e) => setSecteurId(e.target.value)}>
            <option value="">Choisir…</option>
            {secteurs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom}
              </option>
            ))}
          </Selection>
          <ChoixClient label="Parrain (facultatif)" clients={parrains} valeur={parrainId} onChange={setParrainId} />
        </>
      ) : (
        <ChoixClient
          label="Fiche à relier"
          clients={clientsLibres}
          valeur={clientId}
          onChange={setClientId}
          aide="Pour un client déjà connu. Ce qui manque sur sa fiche (e-mail, prénom, téléphone, repère sur la carte…) est complété avec son inscription ; rien n'est effacé."
        />
      )}
      <div className="grid grid-cols-2 gap-2">
        <Bouton
          variante="secondaire"
          disabled={enCours}
          onClick={() => {
            if (confirm("Refuser cette inscription ? La personne ne pourra pas commander.")) {
              agir(() => changerStatutInscription(userId, "refusee"));
            }
          }}
        >
          Refuser
        </Bouton>
        <Bouton
          disabled={enCours || (mode === "nouvelle" ? !secteurId : !clientId)}
          onClick={() =>
            agir(() =>
              validerInscription({
                userId,
                secteurId: mode === "nouvelle" ? secteurId || null : null,
                clientId: mode === "existante" ? clientId : null,
                parrainId: mode === "nouvelle" ? parrainId : null,
              }),
            )
          }
        >
          {enCours ? "…" : "Valider"}
        </Bouton>
      </div>
    </div>
  );
}
