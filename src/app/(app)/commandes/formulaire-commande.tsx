"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { enregistrerCommande } from "./actions";
import { ChoixClient, type ClientChoisissable } from "@/components/choix-client";
import { Compteur } from "@/components/compteur";
import { Bouton, Carte, Champ, MessageErreur, PointCouleur, ZoneTexte } from "@/components/ui";
import { formaterPrix } from "@/lib/domaine/argent";
import { contientUnPanier } from "@/lib/domaine/commandes";
import { formaterDate, jourSemaine, NOMS_JOURS } from "@/lib/domaine/dates";
import { libelleTournee, prochaineLivraison, type Creneau } from "@/lib/domaine/secteurs";
import { nomComplet } from "@/lib/domaine/texte";
import type { Resultat } from "@/lib/erreurs";

export type ArticleFormulaire = {
  id: string;
  nom: string;
  categorie: "panier" | "supplement";
  prix_centimes: number;
  actif: boolean;
};

export type ClientFormulaire = ClientChoisissable & { secteur_id: string };

type SecteurFormulaire = { id: string; nom: string; jour: number; creneau: Creneau; couleur: string };

export function FormulaireCommande({
  id,
  clients,
  secteurs,
  articles,
  aujourdhui,
  initial,
  clientFixe,
}: {
  id?: string;
  clients: ClientFormulaire[];
  secteurs: SecteurFormulaire[];
  /** Articles proposés (prix du catalogue, ou prix figés pour une commande existante) */
  articles: ArticleFormulaire[];
  aujourdhui: string;
  initial: { clientId: string | null; date: string | null; quantites: Record<string, number>; notes: string };
  clientFixe?: boolean;
}) {
  const [clientId, setClientId] = useState<string | null>(initial.clientId);
  const [dateChoisie, setDateChoisie] = useState<string | null>(initial.date);
  const [modifierDate, setModifierDate] = useState(false);
  const [quantites, setQuantites] = useState<Record<string, number>>(initial.quantites);
  const [notes, setNotes] = useState(initial.notes);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const champs = resultat && !resultat.ok ? (resultat.champs ?? {}) : {};

  const client = clients.find((c) => c.id === clientId) ?? null;
  const secteur = client ? secteurs.find((s) => s.id === client.secteur_id) : undefined;
  // Date proposée : prochain jour de tournée du secteur du client
  const date = dateChoisie ?? (secteur ? prochaineLivraison(secteur, aujourdhui) : null);
  const horsJour = Boolean(secteur && date && jourSemaine(date) !== secteur.jour);

  const total = useMemo(
    () => articles.reduce((t, a) => t + (quantites[a.id] ?? 0) * a.prix_centimes, 0),
    [articles, quantites],
  );
  const aUnPanier = contientUnPanier(quantites, articles);
  const paniers = articles.filter((a) => a.categorie === "panier");
  const supplements = articles.filter((a) => a.categorie === "supplement");

  function choisirClient(nouveau: string | null) {
    setClientId(nouveau);
    if (!id) setDateChoisie(null); // la date suit le secteur du nouveau client
  }

  function ligneArticle(a: ArticleFormulaire) {
    const q = quantites[a.id] ?? 0;
    return (
      <li key={a.id} className="flex min-h-16 items-center gap-3 py-2">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{a.nom}</span>
          <span className="block text-sm text-stone-600">
            {formaterPrix(a.prix_centimes)}
            {!a.actif && " · hors saison"}
          </span>
        </span>
        <Compteur valeur={q} libelle={a.nom} onChange={(v) => setQuantites((qs) => ({ ...qs, [a.id]: v }))} />
      </li>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        demarrer(async () => {
          const r = await enregistrerCommande({ clientId: clientId ?? "", date: date ?? "", quantites, notes }, id);
          setResultat(r);
          if (!r.ok) window.scrollTo({ top: 0, behavior: "smooth" });
        });
      }}
    >
      {resultat && !resultat.ok && (
        <MessageErreur>
          {resultat.erreur}
          {resultat.lien && (
            <Link href={resultat.lien.href} className="mt-2 block font-bold underline">
              {resultat.lien.libelle} ›
            </Link>
          )}
        </MessageErreur>
      )}

      <Carte className="space-y-3">
        {clientFixe && client ? (
          <div>
            <p className="text-sm text-stone-600">Client</p>
            <p className="text-lg font-bold">{nomComplet(client)}</p>
            <p className="text-stone-600">{client.commune}</p>
          </div>
        ) : (
          <ChoixClient
            label="Client"
            clients={clients}
            valeur={clientId}
            onChange={choisirClient}
            erreur={champs.clientId}
          />
        )}

        {client && date && (
          <div className="rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
            <p className="text-sm text-stone-600">Livraison</p>
            <p className="text-lg font-bold">{formaterDate(date)}</p>
            {secteur && (
              <p className="flex items-center gap-2 text-sm text-stone-700">
                <PointCouleur couleur={secteur.couleur} /> {secteur.nom} · {libelleTournee(secteur)}
              </p>
            )}
            {horsJour && secteur && (
              <p className="mt-1 text-sm font-medium text-amber-800">
                Attention : ce secteur est livré le {NOMS_JOURS[secteur.jour - 1]}.
              </p>
            )}
            {modifierDate ? (
              <div className="mt-3">
                <Champ
                  label="Date de livraison"
                  name="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDateChoisie(e.target.value || null)}
                  erreur={champs.date}
                />
              </div>
            ) : (
              <Bouton variante="discret" taille="petit" className="mt-1 -ml-3" onClick={() => setModifierDate(true)}>
                Changer la date
              </Bouton>
            )}
          </div>
        )}
      </Carte>

      <Carte>
        <h2 className="text-lg font-bold">Paniers</h2>
        <ul className="divide-y divide-stone-100">{paniers.map(ligneArticle)}</ul>
        {paniers.length === 0 && <p className="text-stone-600">Aucun panier au catalogue (Réglages › Catalogue).</p>}
      </Carte>

      {supplements.length > 0 && (
        <Carte>
          <h2 className="text-lg font-bold">Suppléments</h2>
          <ul className="divide-y divide-stone-100">{supplements.map(ligneArticle)}</ul>
        </Carte>
      )}

      <Carte>
        <ZoneTexte
          label="Remarque (facultatif)"
          name="notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex. sans poireaux cette semaine"
        />
      </Carte>

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 rounded-2xl bg-white p-3 shadow-lg ring-1 ring-stone-200">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-stone-600">Total</span>
          <span className="text-2xl font-bold tabular-nums">{formaterPrix(total)}</span>
        </div>
        {!aUnPanier && <p className="mb-2 text-sm font-medium text-amber-800">Ajoutez au moins un panier.</p>}
        <Bouton type="submit" taille="grand" className="w-full" disabled={enCours || !aUnPanier || !client || !date}>
          {enCours ? "Enregistrement…" : id ? "Enregistrer les modifications" : "Enregistrer la commande"}
        </Bouton>
      </div>
    </form>
  );
}
