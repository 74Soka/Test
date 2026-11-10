"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { enregistrerCommande } from "./actions";
import { RecompensesCommande, type RecompenseEnCours } from "./recompenses-commande";
import { ChoixClient, type ClientChoisissable } from "@/components/choix-client";
import { Compteur } from "@/components/compteur";
import { Bouton, Carte, Champ, MessageErreur, PointCouleur, Selection, ZoneTexte } from "@/components/ui";
import { formaterPrix } from "@/lib/domaine/argent";
import { contientUnPanier } from "@/lib/domaine/commandes";
import { formaterDate, jourSemaine, NOMS_JOURS } from "@/lib/domaine/dates";
import { dateDuSecteurDansLaSemaine, libelleTournee, prochaineLivraison, type Creneau } from "@/lib/domaine/secteurs";
import { oeufsDeBienvenue, type FideliteSaisie, type RecompenseProposee } from "@/lib/domaine/fidelite";
import { nomComplet } from "@/lib/domaine/texte";
import type { Resultat } from "@/lib/erreurs";
import { NomProduit } from "@/components/produit";

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
  fidelite,
  recompenses,
  debutParrainage,
}: {
  id?: string;
  clients: ClientFormulaire[];
  secteurs: SecteurFormulaire[];
  /** Articles proposés (prix du catalogue, ou prix figés pour une commande existante) */
  articles: ArticleFormulaire[];
  aujourdhui: string;
  initial: {
    clientId: string | null;
    date: string | null;
    quantites: Record<string, number>;
    notes: string;
    /** Secteur choisi pour cette livraison seulement (vide : secteur du client) */
    secteurId?: string | null;
    recompenses?: (RecompenseEnCours & { id: string })[];
  };
  clientFixe?: boolean;
  /** Fidélité de chaque client (solde, niveau, cadeaux de parrainage) */
  fidelite: Record<string, FideliteSaisie>;
  /** Récompenses proposées (en tampons et cadeaux de parrainage) */
  recompenses: RecompenseProposee[];
  /** Début de l'offre de parrainage (AAAA-MM-JJ) */
  debutParrainage: string;
}) {
  /** Œufs de bienvenue ajoutés d'office à la première commande d'un filleul */
  function cadeauxDOffice(idClient: string | null, dateLivraison: string | null): RecompenseEnCours[] {
    const oeufs = recompenses.find((r) => r.type === "bienvenue_filleul" && r.actif);
    if (id || !idClient || !oeufs?.article_id || !articles.some((a) => a.id === oeufs.article_id && a.actif)) return [];
    if (!oeufsDeBienvenue(fidelite[idClient], dateLivraison, debutParrainage)) return [];
    return [{ recompense_id: oeufs.id, nom: oeufs.nom, cout_tampons: 0, articles: { [oeufs.article_id]: 1 } }];
  }
  function dateProposee(idClient: string | null): string | null {
    const c = clients.find((x) => x.id === idClient);
    const s = c ? secteurs.find((x) => x.id === c.secteur_id) : undefined;
    return s ? prochaineLivraison(s, aujourdhui) : null;
  }

  const [clientId, setClientId] = useState<string | null>(initial.clientId);
  const [dateChoisie, setDateChoisie] = useState<string | null>(initial.date);
  const [modifierDate, setModifierDate] = useState(false);
  const [secteurPonctuelId, setSecteurPonctuelId] = useState<string | null>(initial.secteurId ?? null);
  const [modifierSecteur, setModifierSecteur] = useState(Boolean(initial.secteurId));
  const [quantites, setQuantites] = useState<Record<string, number>>(initial.quantites);
  const [notes, setNotes] = useState(initial.notes);
  const [recompensesEnCours, setRecompensesEnCours] = useState<RecompenseEnCours[]>(
    () => initial.recompenses ?? cadeauxDOffice(initial.clientId, initial.date ?? dateProposee(initial.clientId)),
  );
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const champs = resultat && !resultat.ok ? (resultat.champs ?? {}) : {};

  const client = clients.find((c) => c.id === clientId) ?? null;
  const secteurHabituel = client ? secteurs.find((s) => s.id === client.secteur_id) : undefined;
  // Autre secteur pour cette livraison seulement (le secteur habituel n'en est pas un)
  const secteurPonctuel =
    secteurPonctuelId && secteurPonctuelId !== client?.secteur_id
      ? secteurs.find((s) => s.id === secteurPonctuelId)
      : undefined;
  const secteur = secteurPonctuel ?? secteurHabituel;
  // Date proposée : prochain jour de tournée du secteur du client ; avec un autre
  // secteur, le jour de ce secteur dans la même semaine (comme le fait la base)
  const dateDeBase = dateChoisie ?? (secteurHabituel ? prochaineLivraison(secteurHabituel, aujourdhui) : null);
  const date = dateDeBase && secteurPonctuel ? dateDuSecteurDansLaSemaine(secteurPonctuel, dateDeBase) : dateDeBase;
  const horsJour = Boolean(!secteurPonctuel && secteur && date && jourSemaine(date) !== secteur.jour);

  const total = useMemo(
    () => articles.reduce((t, a) => t + (quantites[a.id] ?? 0) * a.prix_centimes, 0),
    [articles, quantites],
  );
  const panierOffert = recompensesEnCours.some((r) =>
    Object.entries(r.articles).some(([id, q]) => q > 0 && articles.find((a) => a.id === id)?.categorie === "panier"),
  );
  const aUnPanier = contientUnPanier(quantites, articles) || panierOffert;
  const fideliteClient = client ? fidelite[client.id] : undefined;
  const paniers = articles.filter((a) => a.categorie === "panier");
  const supplements = articles.filter((a) => a.categorie === "supplement");

  function choisirClient(nouveau: string | null) {
    setClientId(nouveau);
    if (!id) {
      setDateChoisie(null); // la date suit le secteur du nouveau client
      setSecteurPonctuelId(null);
      setModifierSecteur(false);
      // Les récompenses dépendent du client ; œufs d'office pour la 1re commande d'un filleul
      setRecompensesEnCours(cadeauxDOffice(nouveau, dateProposee(nouveau)));
    }
  }

  function ligneArticle(a: ArticleFormulaire) {
    const q = quantites[a.id] ?? 0;
    return (
      <li key={a.id} className="flex min-h-16 items-center gap-3 py-2">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">
            <NomProduit nom={a.nom} />
          </span>
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
          setResultat(
            await enregistrerCommande(
              {
                clientId: clientId ?? "",
                date: date ?? "",
                secteurId: secteurPonctuel?.id ?? null,
                quantites,
                notes,
                recompenses: recompensesEnCours.map((r) => ({
                  id: r.id ?? null,
                  recompense_id: r.recompense_id,
                  articles: Object.entries(r.articles)
                    .filter(([, q]) => q > 0)
                    .map(([article_id, quantite]) => ({ article_id, quantite })),
                })),
              },
              id,
            ),
          );
        });
      }}
    >
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
          <div className="rounded-2xl bg-marque-50 p-3 ring-1 ring-marque-100">
            <p className="text-sm text-stone-600">Livraison</p>
            <p className="text-lg font-bold">{formaterDate(date)}</p>
            {secteur && (
              <p className="flex items-center gap-2 text-sm text-stone-700">
                <PointCouleur couleur={secteur.couleur} /> {secteur.nom} · {libelleTournee(secteur)}
              </p>
            )}
            {secteurPonctuel && secteurHabituel && (
              <p className="mt-1 text-sm font-medium text-peche-900">
                Cette livraison seulement : habituellement {secteurHabituel.nom} · {libelleTournee(secteurHabituel)}.
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
            {secteurs.length > 1 &&
              (modifierSecteur ? (
                <div className="mt-3">
                  <Selection
                    label="Secteur pour cette livraison"
                    name="secteurPonctuel"
                    value={secteurPonctuel?.id ?? ""}
                    onChange={(e) => {
                      const choisi = secteurs.find((x) => x.id === e.target.value) ?? secteurHabituel;
                      setSecteurPonctuelId(e.target.value || null);
                      // La date suit le jour du secteur choisi, dans la même semaine
                      if (choisi && date) setDateChoisie(dateDuSecteurDansLaSemaine(choisi, date));
                    }}
                    aide="Seulement cette fois : la fiche du client garde son secteur."
                  >
                    <option value="">
                      {secteurHabituel ? `${secteurHabituel.nom} · ${libelleTournee(secteurHabituel)} (habituel)` : "Secteur habituel"}
                    </option>
                    {secteurs
                      .filter((s) => s.id !== client.secteur_id)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nom} · {libelleTournee(s)}
                        </option>
                      ))}
                  </Selection>
                </div>
              ) : (
                <Bouton variante="discret" taille="petit" className="mt-1 -ml-3 block" onClick={() => setModifierSecteur(true)}>
                  Livrer dans un autre secteur cette fois
                </Bouton>
              ))}
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

      {client && fideliteClient && (
        <RecompensesCommande
          niveau={fideliteClient.niveau}
          soldeActuel={fideliteClient.solde}
          enregistrees={(initial.recompenses ?? []).map((r) => ({ id: r.id, cout_tampons: r.cout_tampons }))}
          recompenses={recompenses}
          articles={articles}
          valeur={recompensesEnCours}
          onChange={setRecompensesEnCours}
          confituresDues={fideliteClient.confitures}
        />
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
        {resultat && !resultat.ok && (
          <div className="mb-3">
            <MessageErreur>
              {resultat.erreur}
              {resultat.lien && (
                <Link href={resultat.lien.href} className="mt-2 block font-bold underline">
                  {resultat.lien.libelle} ›
                </Link>
              )}
            </MessageErreur>
          </div>
        )}
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
