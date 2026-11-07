import type { Metadata } from "next";
import Link from "next/link";
import { exigerAdmin } from "@/lib/auth";
import { lireParametresFidelite, listerArticles, listerRecompenses } from "@/lib/donnees";
import { formaterDate } from "@/lib/domaine/dates";
import { LIBELLES_NIVEAU, pluriel } from "@/lib/domaine/fidelite";
import { Carte, EnTetePage, LienBouton, Pastille, TitreSection } from "@/components/ui";
import { FormulaireParametres } from "./formulaire-parametres";

export const metadata: Metadata = { title: "Fidélité et parrainage" };

export default async function PageFidelite() {
  await exigerAdmin();
  const [parametres, recompenses, articles] = await Promise.all([
    lireParametresFidelite(),
    listerRecompenses(),
    listerArticles(),
  ]);
  const articlesAvecTampons = articles.filter((a) => a.tampons > 0);
  const filleulsLivres = parametres.filleuls_livres_seulement ? " livrés" : "";

  return (
    <>
      <EnTetePage titre="Fidélité et parrainage" retour="/reglages" />
      <div className="space-y-4">
        <Carte>
          <TitreSection>En résumé</TitreSection>
          <ul className="list-disc space-y-1 pl-5 text-stone-800">
            {parametres.tampons_bienvenue > 0 && (
              <li>Nouveau client : {pluriel(parametres.tampons_bienvenue, "tampon")} de bienvenue.</li>
            )}
            {articlesAvecTampons.map((a) => (
              <li key={a.id}>
                {a.nom} livré : {pluriel(a.tampons, "tampon")}.
              </li>
            ))}
            {parametres.tampons_parrainage > 0 && (
              <li>Parrainage : {pluriel(parametres.tampons_parrainage, "tampon")} pour le parrain.</li>
            )}
            {parametres.tampons_parrain_par_commande > 0 && (
              <li>
                Chaque commande livrée d&apos;un filleul : {pluriel(parametres.tampons_parrain_par_commande, "tampon")} pour
                le parrain.
              </li>
            )}
            <li>
              VIP à {pluriel(parametres.filleuls_vip, "filleul")}
              {filleulsLivres}, Ultra à {pluriel(parametres.filleuls_ultra, "filleul")}
              {filleulsLivres}.
            </li>
            <li>Une récompense utilisée retire ses tampons du solde.</li>
            <li>
              Parrainage, à partir du {formaterDate(parametres.parrainage_cadeaux_debut, { annee: true })} : à la première
              commande du filleul, œufs offerts au filleul et confiture offerte au parrain.
            </li>
          </ul>
          <p className="mt-2 text-sm text-stone-600">
            Les tampons par panier se règlent dans{" "}
            <Link href="/reglages/catalogue" className="font-semibold text-marque-800 underline">
              Catalogue
            </Link>
            .
          </p>
        </Carte>

        <Carte>
          <TitreSection
            action={
              <LienBouton href="/reglages/fidelite/recompenses/nouvelle" taille="petit">
                + Ajouter
              </LienBouton>
            }
          >
            Récompenses
          </TitreSection>
          <ul className="divide-y divide-stone-100">
            {recompenses.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/reglages/fidelite/recompenses/${r.id}`}
                  className="flex min-h-16 items-center justify-between gap-3 py-2"
                >
                  <span className="min-w-0">
                    <span className={r.actif ? "block font-semibold" : "block font-semibold text-stone-400"}>{r.nom}</span>
                    <span className="block text-sm text-stone-600">
                      {r.description}
                      {!r.actif && " · désactivée"}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-bold tabular-nums">
                      {r.type === "tampons" ? pluriel(r.cout_tampons, "tampon") : "🎁"}
                    </span>
                    {r.type !== "tampons" && <Pastille couleur="orange">Parrainage</Pastille>}
                    {r.niveau !== "standard" && (
                      <Pastille couleur={r.niveau === "ultra" ? "orange" : "bleu"}>{LIBELLES_NIVEAU[r.niveau]}</Pastille>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Carte>

        <Carte>
          <TitreSection>Règles</TitreSection>
          <FormulaireParametres
            initial={{
              tampons_bienvenue: String(parametres.tampons_bienvenue),
              tampons_parrainage: String(parametres.tampons_parrainage),
              tampons_parrain_par_commande: String(parametres.tampons_parrain_par_commande),
              filleuls_vip: String(parametres.filleuls_vip),
              filleuls_ultra: String(parametres.filleuls_ultra),
              filleuls_livres_seulement: parametres.filleuls_livres_seulement,
              parrainage_cadeaux_debut: parametres.parrainage_cadeaux_debut,
            }}
          />
        </Carte>
      </div>
    </>
  );
}
