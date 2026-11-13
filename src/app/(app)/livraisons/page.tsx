import type { Metadata } from "next";
import Link from "next/link";
import { exigerAdmin } from "@/lib/auth";
import { preparerNotifications } from "@/lib/notifications";
import { listerCommandes, listerSecteurs, type CommandeDetaillee, type SecteurAvecCommunes } from "@/lib/donnees";
import { formaterPrix } from "@/lib/domaine/argent";
import {
  articlesOfferts,
  LIBELLES_STATUT,
  nombreDePaniers,
  recapitulatif,
  resumeLignes,
  totalCommande,
  type Statut,
} from "@/lib/domaine/commandes";
import {
  ajouterJours,
  aujourdhui,
  estDateIso,
  formaterDate,
  formaterDateCourte,
  formaterSemaine,
  joursDeLaSemaine,
  jourSemaine,
  lundiDeLaSemaine,
  majuscule,
} from "@/lib/domaine/dates";
import { comparerSecteurs, LIBELLES_CRENEAU, secteurDeLivraison } from "@/lib/domaine/secteurs";
import { nomComplet } from "@/lib/domaine/texte";
import { Carte, EnTetePage, EtatVide, LienBouton, Pastille, PointCouleur, cx } from "@/components/ui";
import { NomProduit } from "@/components/produit";

export const metadata: Metadata = { title: "Livraisons" };

const COULEUR_STATUT: Record<Statut, "orange" | "vert" | "gris"> = {
  a_livrer: "orange",
  livree: "vert",
  annulee: "gris",
};

type Vue = "semaine" | "jour";

function lien(params: { du: string; vue: Vue; secteur?: string | null }) {
  const p = new URLSearchParams({ du: params.du, vue: params.vue });
  if (params.secteur) p.set("secteur", params.secteur);
  return `/livraisons?${p}`;
}

export default async function PageLivraisons({ searchParams }: PageProps<"/livraisons">) {
  await exigerAdmin();
  await preparerNotifications();
  const sp = await searchParams;
  const vue: Vue = sp.vue === "jour" ? "jour" : "semaine";
  const ajd = aujourdhui();
  const du = typeof sp.du === "string" && estDateIso(sp.du) ? sp.du : ajd;
  const secteurFiltre = typeof sp.secteur === "string" ? sp.secteur : null;

  const lundi = lundiDeLaSemaine(du);
  const dimanche = ajouterJours(lundi, 6);
  const [secteurs, commandesSemaine] = await Promise.all([listerSecteurs(), listerCommandes(lundi, dimanche)]);

  // Jours de livraison de la semaine : jours des secteurs + jours ayant des commandes
  const joursLivraison = joursDeLaSemaine(du).filter(
    (d) =>
      secteurs.some((s) => s.jour === jourSemaine(d)) || commandesSemaine.some((c) => c.date_livraison === d),
  );
  // En vue « jour », si la date demandée n'est pas un jour de livraison, on prend le suivant
  const jour =
    vue === "jour"
      ? joursLivraison.includes(du)
        ? du
        : (joursLivraison.find((d) => d >= du) ?? joursLivraison[0] ?? du)
      : null;

  const secteurParId = new Map(secteurs.map((s) => [s.id, s]));
  const commandes = commandesSemaine.filter(
    (c) => (!jour || c.date_livraison === jour) && (!secteurFiltre || secteurDeLivraison(c) === secteurFiltre),
  );
  const actives = commandes.filter((c) => c.statut !== "annulee");
  const recap = recapitulatif(commandes);

  // Groupes date → secteur
  const groupes: { date: string; secteur: SecteurAvecCommunes | undefined; commandes: CommandeDetaillee[] }[] = [];
  for (const c of commandes) {
    const secteur = secteurParId.get(secteurDeLivraison(c));
    let groupe = groupes.find((g) => g.date === c.date_livraison && g.secteur?.id === secteur?.id);
    if (!groupe) {
      groupe = { date: c.date_livraison, secteur, commandes: [] };
      groupes.push(groupe);
    }
    groupe.commandes.push(c);
  }
  groupes.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.secteur && b.secteur ? comparerSecteurs(a.secteur, b.secteur) : a.secteur ? -1 : 1),
  );
  for (const g of groupes) {
    g.commandes.sort((a, b) => a.client.commune.localeCompare(b.client.commune, "fr") || a.client.nom.localeCompare(b.client.nom, "fr"));
  }

  const pas = 7;
  const semaineCourante = lundi === lundiDeLaSemaine(ajd);

  return (
    <>
      <EnTetePage
        titre="Livraisons"
        sousTitre={jour ? majuscule(formaterDate(jour, { annee: true })) : formaterSemaine(du)}
      />

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <LienBouton
            href={lien({ du: ajouterJours(du, -pas), vue, secteur: secteurFiltre })}
            variante="secondaire"
            aria-label="Semaine précédente"
            className="w-12 px-0 text-2xl"
          >
            ‹
          </LienBouton>
          <div className="flex flex-1 rounded-xl bg-white p-1 ring-1 ring-stone-300" role="group" aria-label="Affichage">
            {(["semaine", "jour"] as const).map((v) => (
              <Link
                key={v}
                href={lien({ du: jour ?? du, vue: v, secteur: secteurFiltre })}
                aria-current={vue === v ? "page" : undefined}
                className={cx(
                  "flex min-h-10 flex-1 items-center justify-center rounded-lg font-semibold",
                  vue === v ? "bg-marque-800 text-white" : "text-stone-700",
                )}
              >
                {v === "semaine" ? "Semaine" : "Jour"}
              </Link>
            ))}
          </div>
          <LienBouton
            href={lien({ du: ajouterJours(du, pas), vue, secteur: secteurFiltre })}
            variante="secondaire"
            aria-label="Semaine suivante"
            className="w-12 px-0 text-2xl"
          >
            ›
          </LienBouton>
        </div>

        {!semaineCourante && (
          <Link href={lien({ du: ajd, vue, secteur: secteurFiltre })} className="block text-center font-semibold text-marque-800 underline">
            Revenir à cette semaine
          </Link>
        )}

        {vue === "jour" && joursLivraison.length > 0 && (
          <div className="flex gap-2" role="group" aria-label="Jour">
            {joursLivraison.map((d) => (
              <Link
                key={d}
                href={lien({ du: d, vue, secteur: secteurFiltre })}
                aria-current={d === jour ? "page" : undefined}
                className={cx(
                  "flex min-h-11 flex-1 items-center justify-center rounded-full px-3 font-semibold ring-1",
                  d === jour ? "bg-marque-700 text-white ring-marque-700" : "bg-white ring-stone-300",
                )}
              >
                {formaterDateCourte(d)}
              </Link>
            ))}
          </div>
        )}

        {secteurs.length > 1 && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Secteur">
            <Link
              href={lien({ du: jour ?? du, vue })}
              aria-current={!secteurFiltre ? "page" : undefined}
              className={cx(
                "inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold ring-1",
                !secteurFiltre ? "bg-marque-800 text-white ring-marque-800" : "bg-white ring-stone-300",
              )}
            >
              Tous
            </Link>
            {[...secteurs].sort(comparerSecteurs).map((s) => (
              <Link
                key={s.id}
                href={lien({ du: jour ?? du, vue, secteur: secteurFiltre === s.id ? null : s.id })}
                aria-current={secteurFiltre === s.id ? "page" : undefined}
                className={cx(
                  "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold whitespace-nowrap ring-1",
                  secteurFiltre === s.id ? "bg-marque-800 text-white ring-marque-800" : "bg-white ring-stone-300",
                )}
              >
                <PointCouleur couleur={s.couleur} />
                {s.nom}
              </Link>
            ))}
          </div>
        )}

        {commandes.length === 0 ? (
          <EtatVide action={<LienBouton href="/commandes/nouvelle">Nouvelle commande</LienBouton>}>
            Aucune livraison prévue {jour ? "ce jour-là" : "cette semaine"}.
          </EtatVide>
        ) : (
          <>
            <Carte aria-labelledby="titre-recap">
              <h2 id="titre-recap" className="text-lg font-bold">
                À préparer
              </h2>
              <p className="mb-3 text-stone-600">
                {actives.length} commande{actives.length > 1 ? "s" : ""} ·{" "}
                {formaterPrix(actives.reduce((t, c) => t + totalCommande(c.lignes), 0))}
              </p>
              <table className="w-full">
                <tbody className="divide-y divide-stone-100">
                  {recap.map((l) => (
                    <tr key={l.cle}>
                      <td className={cx("py-2", l.categorie === "panier" && "font-semibold")}>
                        <NomProduit nom={l.libelle} />
                        {l.offerts > 0 && (
                          <span className="block text-sm font-normal text-peche-700">dont {l.offerts} offert{l.offerts > 1 ? "s" : ""} 🎁</span>
                        )}
                      </td>
                      <td className="py-2 text-right text-xl font-bold tabular-nums">{l.quantite}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Carte>

            {groupes.map((g) => {
              const actifsGroupe = g.commandes.filter((c) => c.statut !== "annulee");
              return (
                <section key={`${g.date}-${g.secteur?.id}`} aria-label={`${formaterDate(g.date)} ${g.secteur?.nom ?? ""}`}>
                  <div className="mb-2 flex items-center gap-2 px-1">
                    {g.secteur && <PointCouleur couleur={g.secteur.couleur} />}
                    <h2 className="font-bold">
                      {majuscule(formaterDate(g.date))}
                      {g.secteur && ` · ${g.secteur.nom}`}
                    </h2>
                  </div>
                  <p className="mb-2 px-1 text-sm text-stone-600">
                    {g.secteur && `${majuscule(LIBELLES_CRENEAU[g.secteur.creneau])} · `}
                    {actifsGroupe.length} arrêt{actifsGroupe.length > 1 ? "s" : ""} ·{" "}
                    {actifsGroupe.reduce((n, c) => n + nombreDePaniers([...c.lignes, ...articlesOfferts(c.recompenses)]), 0)} panier(s)
                  </p>
                  <ul className="divide-y divide-stone-100 overflow-hidden rounded-3xl bg-white shadow-[0_2px_8px_rgb(53_3_122/0.06)] ring-1 ring-marque-100">
                    {g.commandes.map((c) => (
                      <li key={c.id}>
                        <Link
                          href={`/commandes/${c.id}`}
                          className={cx("block px-4 py-3 hover:bg-marque-50", c.statut === "annulee" && "opacity-60")}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <span className="min-w-0">
                              <span className={cx("block font-semibold", c.statut === "annulee" && "line-through")}>
                                {nomComplet(c.client)}
                                {c.source === "client" && (
                                  <span className="ml-2 align-middle text-xs font-semibold text-sky-800">🌐 en ligne</span>
                                )}
                              </span>
                              <span className="block text-sm text-stone-600">
                                {c.client.adresse}, {c.client.commune}
                              </span>
                            </span>
                            <Pastille couleur={COULEUR_STATUT[c.statut]}>{LIBELLES_STATUT[c.statut]}</Pastille>
                          </div>
                          <div className="mt-1 flex items-baseline justify-between gap-3">
                            <span className="text-stone-800">{resumeLignes(c.lignes) || "—"}</span>
                            <span className="font-semibold whitespace-nowrap tabular-nums">
                              {formaterPrix(totalCommande(c.lignes))}
                            </span>
                          </div>
                          {c.recompenses.length > 0 && (
                            <p className="mt-1 text-sm font-medium text-peche-700">
                              🎁 Offert : {articlesOfferts(c.recompenses).map((a) => `${a.quantite} × ${a.libelle}`).join(", ")}
                            </p>
                          )}
                          {c.notes && <p className="mt-1 text-sm text-amber-800">« {c.notes} »</p>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </>
        )}
      </div>
    </>
  );
}
