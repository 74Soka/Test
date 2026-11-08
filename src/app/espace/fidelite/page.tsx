import type { Metadata } from "next";
import { exigerClientRelie } from "@/lib/auth";
import { aujourdhui, formaterDate } from "@/lib/domaine/dates";
import {
  LIBELLES_MOTIF,
  LIBELLES_NIVEAU,
  niveauSuffisant,
  niveauSuivant,
  pluriel,
  prochaineRecompense,
} from "@/lib/domaine/fidelite";
import { lireMaFidelite, lireMesTampons, lireRecompensesProposees, lireReglesFidelite } from "@/lib/espace-client";
import { GrilleTampons } from "@/components/grille-tampons";
import { Carte, EnTetePage, Pastille, TitreSection } from "@/components/ui";

export const metadata: Metadata = { title: "Ma fidélité" };

export default async function PageFidelite() {
  const { situation } = await exigerClientRelie();
  const [fidelite, recompenses, regles, tampons] = await Promise.all([
    lireMaFidelite(),
    lireRecompensesProposees(),
    lireReglesFidelite(),
    lireMesTampons(),
  ]);
  const suivante = prochaineRecompense(fidelite.solde, fidelite.niveau, recompenses);
  const niveauApres = regles ? niveauSuivant(fidelite.niveau, fidelite.filleuls_comptes, regles) : null;
  const enTampons = recompenses.filter((r) => r.type === "tampons");

  return (
    <>
      <EnTetePage titre="Ma fidélité" sousTitre={`${situation.prenom} ${situation.nom}`.trim()} />
      <div className="space-y-4">
        <Carte aria-label="Ma carte" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-titre text-2xl text-marque-800">{pluriel(fidelite.solde, "tampon")}</p>
            <Pastille couleur={fidelite.niveau === "standard" ? "gris" : "vert"}>
              {fidelite.niveau === "standard" ? "Client" : `Client ${LIBELLES_NIVEAU[fidelite.niveau]}`}
            </Pastille>
          </div>
          <GrilleTampons solde={fidelite.solde} />
          {suivante ? (
            <p className="text-stone-700">
              Encore {pluriel(suivante.manque, "tampon")} pour « {suivante.recompense.nom} ».
            </p>
          ) : (
            fidelite.solde > 0 && <p className="font-semibold text-peche-700">🎁 Vous pouvez utiliser une récompense à votre prochaine commande !</p>
          )}
          <p className="text-sm text-stone-600">
            Un tampon par Panier 30 €, deux par Panier 50 €, à chaque livraison. Les récompenses s&apos;utilisent au moment
            de commander.
          </p>
        </Carte>

        <Carte aria-label="Récompenses">
          <TitreSection>Récompenses</TitreSection>
          <ul className="space-y-2">
            {enTampons.map((r) => {
              const accessible = niveauSuffisant(fidelite.niveau, r.niveau);
              const atteinte = accessible && r.cout_tampons <= fidelite.solde;
              return (
                <li key={r.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{r.nom}</p>
                    {r.description && <p className="text-sm text-stone-600">{r.description}</p>}
                  </div>
                  <Pastille couleur={atteinte ? "vert" : accessible ? "gris" : "orange"}>
                    {accessible ? pluriel(r.cout_tampons, "tampon") : r.niveau === "vip" ? "VIP" : "Ultra"}
                  </Pastille>
                </li>
              );
            })}
          </ul>
        </Carte>

        <Carte aria-label="Parrainage" className="space-y-3">
          <TitreSection>Parrainage</TitreSection>
          <p className="text-stone-700">
            Faites découvrir nos paniers : à l&apos;inscription, votre filleul indique votre nom. Vous gagnez{" "}
            {regles ? pluriel(regles.tampons_parrainage, "tampon") : "des tampons"}, puis{" "}
            {regles ? pluriel(regles.tampons_parrain_par_commande, "tampon") : "des tampons"} à chacune de ses commandes
            livrées.
            {regles &&
              (regles.parrainage_cadeaux_debut <= aujourdhui()
                ? " Une confiture vous est offerte à sa première commande, et 6 œufs BIO pour lui."
                : ` À partir du ${formaterDate(regles.parrainage_cadeaux_debut, { annee: true })}, une confiture vous est offerte à sa première commande, et 6 œufs BIO pour lui.`)}
          </p>
          {fidelite.confitures_dues > 0 && (
            <p className="rounded-xl bg-peche-50 px-3 py-2 font-medium text-peche-900 ring-1 ring-peche-600/30">
              🎁 {fidelite.confitures_dues > 1 ? `${fidelite.confitures_dues} confitures vous attendent` : "Une confiture vous attend"}{" "}
              grâce à vos filleuls : elle sera ajoutée à une prochaine livraison.
            </p>
          )}
          {fidelite.filleuls.length > 0 ? (
            <ul className="space-y-1">
              {fidelite.filleuls.map((f, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span>
                    {f.prenom} {f.initiale}.
                  </span>
                  <span className="text-sm text-stone-600">{f.livre ? "déjà livré" : "pas encore livré"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-stone-600">Pas encore de filleul.</p>
          )}
          {niveauApres && regles && (
            <p className="text-sm text-stone-600">
              {niveauApres.manque > 0
                ? `Encore ${pluriel(niveauApres.manque, "filleul")}${regles.filleuls_livres_seulement ? " (livrés au moins une fois)" : ""} pour devenir client ${LIBELLES_NIVEAU[niveauApres.niveau]}.`
                : `Statut ${LIBELLES_NIVEAU[niveauApres.niveau]} bientôt atteint.`}{" "}
              VIP : {pluriel(regles.filleuls_vip, "filleul")} · Ultra : {pluriel(regles.filleuls_ultra, "filleul")}.
            </p>
          )}
        </Carte>

        {tampons.length > 0 && (
          <Carte aria-label="Historique des tampons">
            <TitreSection>Derniers tampons</TitreSection>
            <ul className="divide-y divide-stone-100">
              {tampons.map((t) => (
                <li key={t.id} className="flex justify-between gap-2 py-1.5">
                  <span>
                    {LIBELLES_MOTIF[t.motif]}
                    <span className="block text-sm text-stone-500">
                      {formaterDate(t.created_at.slice(0, 10), { annee: true })}
                    </span>
                  </span>
                  <span className={t.quantite > 0 ? "font-bold text-feuille-700" : "font-bold text-red-700"}>
                    {t.quantite > 0 ? "+" : ""}
                    {t.quantite}
                  </span>
                </li>
              ))}
            </ul>
          </Carte>
        )}
      </div>
    </>
  );
}
