"use client";

import { useState, useTransition } from "react";
import { envoyerMessage, type DonneesMessage, type ResultatMessage } from "./actions";
import { LIENS_MESSAGE } from "./liens";
import { Bouton, Carte, Champ, MessageErreur, Selection, TitreSection, ZoneTexte } from "@/components/ui";

const VIDE: DonneesMessage = { titre: "", corps: "", lien: "/paniers" };

export function FormulaireMessage({ abonnes }: { abonnes: number }) {
  const [message, setMessage] = useState<DonneesMessage>(VIDE);
  const [resultat, setResultat] = useState<ResultatMessage | null>(null);
  const [enCours, demarrer] = useTransition();
  const champs = resultat && !resultat.ok ? (resultat.champs ?? {}) : {};
  const maj = (cle: keyof DonneesMessage) => (e: { target: { value: string } }) => {
    setResultat(null);
    setMessage((m) => ({ ...m, [cle]: e.target.value }));
  };
  const pret = message.titre.trim() && message.corps.trim();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const pluriel = abonnes > 1 ? "s" : "";
        if (!window.confirm(`Envoyer cette notification à ${abonnes} téléphone${pluriel} ?`)) return;
        demarrer(async () => {
          const r = await envoyerMessage(message);
          setResultat(r);
          if (r.ok) setMessage(VIDE);
        });
      }}
    >
      <Carte className="space-y-3">
        {resultat && !resultat.ok && <MessageErreur>{resultat.erreur}</MessageErreur>}
        <Champ
          label="Titre"
          name="titre"
          value={message.titre}
          onChange={maj("titre")}
          maxLength={60}
          erreur={champs.titre}
          placeholder="🍓 Les fraises sont arrivées !"
          aide={`${message.titre.length}/60`}
        />
        <ZoneTexte
          label="Message"
          name="corps"
          rows={3}
          value={message.corps}
          onChange={maj("corps")}
          maxLength={200}
          erreur={champs.corps}
          placeholder="Barquettes de 500 g BIO, à ajouter à votre panier cette semaine."
          aide={`${message.corps.length}/200 — court, c'est mieux : les téléphones coupent les longs messages.`}
        />
        <Selection label="Quand le client touche la notification" name="lien" value={message.lien} onChange={maj("lien")}>
          {Object.entries(LIENS_MESSAGE).map(([lien, libelle]) => (
            <option key={lien} value={lien}>
              {libelle}
            </option>
          ))}
        </Selection>
      </Carte>

      {pret && (
        <section aria-label="Aperçu" className="space-y-2">
          <TitreSection>Aperçu</TitreSection>
          <div className="flex gap-3 rounded-2xl bg-stone-100 p-3 shadow-inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icone-192.png" alt="" width={40} height={40} className="size-10 shrink-0 rounded-lg" />
            <div className="min-w-0">
              <p className="font-bold break-words">{message.titre}</p>
              <p className="text-stone-700 break-words">{message.corps}</p>
            </div>
          </div>
        </section>
      )}

      <Bouton type="submit" taille="grand" className="w-full" disabled={enCours || !pret || abonnes === 0}>
        {enCours
          ? "Envoi…"
          : abonnes === 0
            ? "Aucun téléphone abonné pour l'instant"
            : `Envoyer à ${abonnes} téléphone${abonnes > 1 ? "s" : ""}`}
      </Bouton>
      {resultat?.ok && (
        <p role="status" className="text-center font-medium text-feuille-700">
          ✓ Notification envoyée à {resultat.telephones} téléphone{(resultat.telephones ?? 0) > 1 ? "s" : ""}
        </p>
      )}
    </form>
  );
}
