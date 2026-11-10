"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { commanderEnLigne } from "../actions";
import { Compteur } from "@/components/compteur";
import { Bouton, Carte, MessageErreur, TitreSection, ZoneTexte, cx } from "@/components/ui";
import { formaterPrix } from "@/lib/domaine/argent";
import { manquePourCommander } from "@/lib/domaine/commandes";
import { niveauSuffisant, pluriel, soldeDisponible, type Niveau } from "@/lib/domaine/fidelite";
import type { ArticleCatalogue, CommandeClient, RecompenseProposeeClient } from "@/lib/espace-client";
import { NomProduit } from "@/components/produit";

type Nouvelle = { cle: number; recompense: RecompenseProposeeClient; articles: Record<string, number> };

export function FormulaireCommandeClient({
  articles,
  contenus,
  commande,
  solde,
  niveau,
  recompenses,
}: {
  articles: ArticleCatalogue[];
  contenus: Record<string, string>;
  commande: CommandeClient | null;
  solde: number;
  niveau: Niveau;
  recompenses: RecompenseProposeeClient[];
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [quantites, setQuantites] = useState<Record<string, number>>(() =>
    Object.fromEntries((commande?.lignes ?? []).map((l) => [l.article_id, l.quantite])),
  );
  const [notes, setNotes] = useState(commande?.notes ?? "");

  // Récompenses déjà sur la commande : celles payées en tampons peuvent être retirées
  const enregistrees = (commande?.recompenses ?? []).filter((r) => r.type === "tampons");
  const cadeauxParrainage = (commande?.recompenses ?? []).filter((r) => r.type !== "tampons");
  const [gardees, setGardees] = useState<string[]>(() => enregistrees.map((r) => r.id));
  const [nouvelles, setNouvelles] = useState<Nouvelle[]>([]);
  const [choix, setChoix] = useState<Nouvelle | null>(null);
  const prochaineCle = useRef(0);

  const paniers = articles.filter((a) => a.categorie === "panier");
  const supplements = articles.filter((a) => a.categorie === "supplement");
  const prixParId = useMemo(() => new Map(articles.map((a) => [a.id, a])), [articles]);

  // Une ligne existante dont l'article a été retiré du catalogue reste affichée
  const lignesRetirees = (commande?.lignes ?? []).filter((l) => !prixParId.has(l.article_id));

  const total =
    articles.reduce((t, a) => t + (quantites[a.id] ?? 0) * a.prix_centimes, 0) +
    lignesRetirees.reduce((t, l) => t + (quantites[l.article_id] ?? 0) * l.prix_unitaire_centimes, 0);
  const aUnPanier =
    paniers.some((p) => (quantites[p.id] ?? 0) > 0) ||
    nouvelles.some((n) => n.recompense.article_id && prixParId.get(n.recompense.article_id)?.categorie === "panier") ||
    enregistrees.some(
      (r) => gardees.includes(r.id) && r.cadeaux.some((c) => c.categorie === "panier"),
    );
  const manque = manquePourCommander(aUnPanier, total);

  const disponible = soldeDisponible(
    solde,
    enregistrees.map((r) => ({ id: r.id, cout_tampons: r.cout_tampons })),
    [
      ...enregistrees.filter((r) => gardees.includes(r.id)).map((r) => ({ id: r.id, cout_tampons: r.cout_tampons })),
      ...nouvelles.map((n) => ({ cout_tampons: n.recompense.cout_tampons })),
    ],
  );
  const proposees = recompenses.filter((r) => r.type === "tampons");

  function maj(id: string, valeur: number) {
    setQuantites((q) => ({ ...q, [id]: valeur }));
  }

  function utiliser(r: RecompenseProposeeClient) {
    const n: Nouvelle = { cle: ++prochaineCle.current, recompense: r, articles: r.article_id ? { [r.article_id]: 1 } : {} };
    if (r.article_id) setNouvelles((liste) => [...liste, n]);
    else setChoix(n);
  }

  function valider() {
    setErreur(null);
    demarrer(async () => {
      const r = await commanderEnLigne({
        lignes: Object.entries(quantites).map(([article_id, quantite]) => ({ article_id, quantite })),
        gardees,
        nouvelles: nouvelles.map((n) => ({
          recompense_id: n.recompense.id,
          articles: Object.entries(n.articles).map(([article_id, quantite]) => ({ article_id, quantite })),
        })),
        notes,
      });
      if (!r.ok) {
        setErreur(r.erreur);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      router.push("/espace?commande=ok");
    });
  }

  const nomArticle = (id: string) => prixParId.get(id)?.nom ?? "Article";

  return (
    <div className="space-y-4">
      {erreur && <MessageErreur>{erreur}</MessageErreur>}

      <Carte aria-label="Paniers">
        <TitreSection>Paniers</TitreSection>
        <div className="space-y-4">
          {paniers.map((p) => (
            <div key={p.id} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-bold">{p.nom}</p>
                  <p className="text-stone-600">{formaterPrix(p.prix_centimes)}</p>
                </div>
                <Compteur libelle={p.nom} valeur={quantites[p.id] ?? 0} onChange={(v) => maj(p.id, v)} />
              </div>
              {contenus[p.id] && (
                <p className="rounded-2xl bg-feuille-50 px-3 py-2 text-sm whitespace-pre-line text-feuille-900">
                  {contenus[p.id]}
                </p>
              )}
            </div>
          ))}
        </div>
      </Carte>

      {supplements.length > 0 && (
        <Carte aria-label="Suppléments">
          <TitreSection>Suppléments</TitreSection>
          <ul className="divide-y divide-stone-100">
            {supplements.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="font-semibold">{s.nom}</p>
                  <p className="text-sm text-stone-600">{formaterPrix(s.prix_centimes)}</p>
                </div>
                <Compteur libelle={s.nom} valeur={quantites[s.id] ?? 0} onChange={(v) => maj(s.id, v)} />
              </li>
            ))}
            {lignesRetirees.map((l) => (
              <li key={l.article_id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="font-semibold">
                    <NomProduit nom={l.libelle} />
                  </p>
                  <p className="text-sm text-stone-500">Plus proposé : vous pouvez seulement le retirer</p>
                </div>
                <Compteur
                  libelle={l.libelle}
                  valeur={quantites[l.article_id] ?? 0}
                  max={l.quantite}
                  onChange={(v) => maj(l.article_id, v)}
                />
              </li>
            ))}
          </ul>
        </Carte>
      )}

      <Carte aria-label="Fidélité">
        <TitreSection>Ma fidélité</TitreSection>
        <p className="mb-3 text-stone-700">
          {pluriel(disponible, "graine")} disponible{disponible > 1 ? "s" : ""}.
        </p>
        <ul className="space-y-2">
          {cadeauxParrainage.map((r) => (
            <li key={r.id} className="rounded-xl bg-peche-50 px-3 py-2 text-peche-900 ring-1 ring-peche-600/30">
              🎁 {r.nom} : {r.cadeaux.map((c) => `${c.quantite} × ${c.libelle}`).join(", ")}
            </li>
          ))}
          {enregistrees.map((r) => {
            const gardee = gardees.includes(r.id);
            return (
              <li
                key={r.id}
                className={cx(
                  "flex items-center justify-between gap-2 rounded-xl px-3 py-2 ring-1",
                  gardee ? "bg-peche-50 ring-peche-600/30" : "bg-stone-50 text-stone-500 line-through ring-stone-200",
                )}
              >
                <span>
                  🎁 {r.nom} : {r.cadeaux.map((c) => `${c.quantite} × ${c.libelle}`).join(", ")}
                </span>
                <Bouton
                  variante="secondaire"
                  taille="petit"
                  onClick={() => setGardees((g) => (gardee ? g.filter((x) => x !== r.id) : [...g, r.id]))}
                >
                  {gardee ? "Retirer" : "Garder"}
                </Bouton>
              </li>
            );
          })}
          {nouvelles.map((n) => (
            <li
              key={n.cle}
              className="flex items-center justify-between gap-2 rounded-xl bg-peche-50 px-3 py-2 ring-1 ring-peche-600/30"
            >
              <span>
                🎁 {n.recompense.nom} :{" "}
                {Object.entries(n.articles)
                  .map(([id, q]) => `${q} × ${nomArticle(id)}`)
                  .join(", ")}
              </span>
              <Bouton
                variante="secondaire"
                taille="petit"
                onClick={() => setNouvelles((liste) => liste.filter((x) => x.cle !== n.cle))}
              >
                Retirer
              </Bouton>
            </li>
          ))}
        </ul>

        {choix ? (
          <ChoixSupplements
            nouvelle={choix}
            supplements={supplements}
            onAnnuler={() => setChoix(null)}
            onValider={(n) => {
              setNouvelles((liste) => [...liste, n]);
              setChoix(null);
            }}
          />
        ) : (
          <div className="mt-3 space-y-2">
            {proposees.map((r) => {
              const accessible = niveauSuffisant(niveau, r.niveau);
              const assez = r.cout_tampons <= disponible;
              return (
                <div key={r.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{r.nom}</p>
                    <p className="text-sm text-stone-600">
                      {pluriel(r.cout_tampons, "graine")}
                      {r.description ? ` · ${r.description}` : ""}
                      {!accessible &&
                        !/réservé/i.test(r.description ?? "") &&
                        ` · réservé aux clients ${r.niveau === "vip" ? "VIP" : "Ultra"}`}
                    </p>
                  </div>
                  <Bouton
                    variante={accessible && assez ? "principal" : "secondaire"}
                    taille="petit"
                    disabled={!accessible || !assez}
                    onClick={() => utiliser(r)}
                    aria-label={`Utiliser : ${r.nom}`}
                  >
                    Utiliser
                  </Bouton>
                </div>
              );
            })}
          </div>
        )}
      </Carte>

      <Carte>
        <ZoneTexte
          label="Un message pour nous ? (facultatif)"
          name="notes"
          value={notes}
          maxLength={500}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex. : je serai absent, laisser devant le portail"
        />
      </Carte>

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 rounded-2xl bg-white p-4 shadow-lg ring-1 ring-stone-200">
        <p className="mb-2 flex justify-between text-lg font-bold">
          <span>Total à régler à la livraison</span>
          <span className="tabular-nums">{formaterPrix(total)}</span>
        </p>
        {manque && <p className="mb-2 text-sm text-amber-800">{manque}</p>}
        <Bouton taille="grand" className="w-full" disabled={enCours || Boolean(manque)} onClick={valider}>
          {enCours ? "Envoi…" : commande ? "Enregistrer les modifications" : "Valider ma commande"}
        </Bouton>
      </div>
    </div>
  );
}

function ChoixSupplements({
  nouvelle,
  supplements,
  onAnnuler,
  onValider,
}: {
  nouvelle: Nouvelle;
  supplements: ArticleCatalogue[];
  onAnnuler: () => void;
  onValider: (n: Nouvelle) => void;
}) {
  const [articles, setArticles] = useState<Record<string, number>>({});
  const voulu = nouvelle.recompense.nb_offerts;
  const choisis = Object.values(articles).reduce((t, q) => t + q, 0);
  return (
    <div className="mt-3 space-y-3 rounded-2xl bg-marque-50 p-3 ring-1 ring-marque-100" role="group" aria-label="Choix des cadeaux">
      <p className="font-semibold">
        {nouvelle.recompense.nom} : choisissez {pluriel(voulu, "supplément")} ({choisis}/{voulu})
      </p>
      {nouvelle.recompense.description && <p className="text-sm text-stone-600">{nouvelle.recompense.description}</p>}
      <ul className="divide-y divide-stone-200">
        {supplements.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0 font-medium">{s.nom}</span>
            <Compteur
              libelle={`${s.nom} offert`}
              valeur={articles[s.id] ?? 0}
              max={(articles[s.id] ?? 0) + (voulu - choisis)}
              onChange={(v) => setArticles((a) => ({ ...a, [s.id]: v }))}
            />
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <Bouton variante="secondaire" onClick={onAnnuler}>
          Annuler
        </Bouton>
        <Bouton
          disabled={choisis !== voulu}
          onClick={() =>
            onValider({ ...nouvelle, articles: Object.fromEntries(Object.entries(articles).filter(([, q]) => q > 0)) })
          }
        >
          Valider
        </Bouton>
      </div>
    </div>
  );
}
