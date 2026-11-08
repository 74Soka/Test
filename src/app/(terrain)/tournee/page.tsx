import type { Metadata } from "next";
import Link from "next/link";
import { exigerEquipe } from "@/lib/auth";
import { listerCommandesDuJour, listerSecteurs } from "@/lib/donnees";
import { resumeLignes, totalCommande, articlesOfferts } from "@/lib/domaine/commandes";
import {
  ajouterJours,
  aujourdhui,
  estDateIso,
  formaterDate,
  formaterDateCourte,
  joursDeLaSemaine,
  jourSemaine,
  majuscule,
} from "@/lib/domaine/dates";
import { comparerSecteurs, LIBELLES_CRENEAU } from "@/lib/domaine/secteurs";
import { nomComplet } from "@/lib/domaine/texte";
import { EnTetePage, EtatVide, PointCouleur, cx } from "@/components/ui";
import { Tournee, type ArretTournee } from "./tournee";

export const metadata: Metadata = { title: "Tournée" };

function lien(du: string, secteur?: string) {
  const p = new URLSearchParams({ du });
  if (secteur) p.set("secteur", secteur);
  return `/tournee?${p}`;
}

export default async function PageTournee({ searchParams }: PageProps<"/tournee">) {
  const utilisateur = await exigerEquipe();
  const sp = await searchParams;
  const ajd = aujourdhui();
  const secteurs = (await listerSecteurs()).sort(comparerSecteurs);
  const joursTournee = new Set(secteurs.map((s) => s.jour));

  // Par défaut : aujourd'hui si c'est un jour de tournée, sinon le prochain
  let date = typeof sp.du === "string" && estDateIso(sp.du) ? sp.du : ajd;
  if (!(typeof sp.du === "string" && estDateIso(sp.du)) && joursTournee.size > 0) {
    for (let i = 0; i < 7 && !joursTournee.has(jourSemaine(date)); i++) date = ajouterJours(ajd, i + 1);
  }

  const commandes = await listerCommandesDuJour(date);
  const secteursDuJour = secteurs.filter(
    (s) => s.jour === jourSemaine(date) || commandes.some((c) => c.client.secteur_id === s.id),
  );
  const secteurDemande = typeof sp.secteur === "string" ? sp.secteur : null;
  const secteur = secteursDuJour.find((s) => s.id === secteurDemande) ?? secteursDuJour[0];
  const joursSemaine = joursDeLaSemaine(date).filter((d) => joursTournee.has(jourSemaine(d)));

  const arrets: ArretTournee[] = secteur
    ? commandes
        .filter((c) => c.client.secteur_id === secteur.id)
        .map((c) => {
          const offerts = articlesOfferts(c.recompenses);
          return {
            id: c.id,
            nom: nomComplet(c.client),
            adresse: c.client.adresse,
            complement: c.client.complement_adresse,
            commune: c.client.commune,
            telephone: c.client.telephone,
            notesLivraison: c.client.notes_livraison,
            notesCommande: c.notes,
            position: c.client.lat !== null && c.client.lng !== null ? { lat: c.client.lat, lng: c.client.lng } : null,
            contenu: resumeLignes(c.lignes) || "Récompense seule",
            offert: offerts.length ? offerts.map((o) => `${o.quantite} × ${o.libelle}`).join(", ") : null,
            totalCentimes: totalCommande(c.lignes),
            livree: c.statut === "livree",
            livreeLe: c.livree_le,
          };
        })
    : [];

  return (
    <>
      <EnTetePage
        titre="Tournée"
        sousTitre={
          secteur
            ? `${majuscule(formaterDate(date))} · ${secteur.nom} (${LIBELLES_CRENEAU[secteur.creneau]})`
            : majuscule(formaterDate(date))
        }
      />
      <div className="space-y-4">
        {joursSemaine.length > 1 && (
          <div className="flex gap-2" role="group" aria-label="Jour">
            {joursSemaine.map((d) => (
              <Link
                key={d}
                href={lien(d)}
                aria-current={d === date ? "page" : undefined}
                className={cx(
                  "flex min-h-11 flex-1 items-center justify-center rounded-full px-3 font-semibold ring-1",
                  d === date ? "bg-marque-700 text-white ring-marque-700" : "bg-white ring-stone-300",
                )}
              >
                {formaterDateCourte(d)}
              </Link>
            ))}
          </div>
        )}
        {secteursDuJour.length > 1 && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Secteur">
            {secteursDuJour.map((s) => (
              <Link
                key={s.id}
                href={lien(date, s.id)}
                aria-current={s.id === secteur?.id ? "page" : undefined}
                className={cx(
                  "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold whitespace-nowrap ring-1",
                  s.id === secteur?.id ? "bg-marque-800 text-white ring-marque-800" : "bg-white ring-stone-300",
                )}
              >
                <PointCouleur couleur={s.couleur} />
                {s.nom}
              </Link>
            ))}
          </div>
        )}

        {!secteur ? (
          <EtatVide>Aucun secteur n&apos;est livré ce jour-là.</EtatVide>
        ) : arrets.length === 0 ? (
          <EtatVide>
            Aucune livraison prévue pour {secteur.nom} le {formaterDate(date)}.
            {date < ajd && " (date passée)"}
          </EtatVide>
        ) : (
          <Tournee
            key={`${date}-${secteur.id}`}
            date={date}
            estAdmin={utilisateur.role === "admin"}
            secteur={{
              id: secteur.id,
              nom: secteur.nom,
              couleur: secteur.couleur,
              depart: { lat: secteur.depart_lat, lng: secteur.depart_lng, adresse: secteur.depart_adresse },
            }}
            arrets={arrets}
          />
        )}
      </div>
    </>
  );
}
