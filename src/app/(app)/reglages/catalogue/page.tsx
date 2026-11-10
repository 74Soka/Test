import type { Metadata } from "next";
import Link from "next/link";
import { exigerAdmin } from "@/lib/auth";
import { listerArticles, type Article } from "@/lib/donnees";
import { formaterPrix } from "@/lib/domaine/argent";
import { Carte, EnTetePage, TitreSection } from "@/components/ui";
import { BoutonActif } from "./bouton-actif";
import { FormulaireArticle } from "./formulaire-article";
import { NomProduit } from "@/components/produit";

export const metadata: Metadata = { title: "Catalogue" };

function Liste({ articles }: { articles: Article[] }) {
  if (articles.length === 0) return <p className="text-stone-500">Aucun article.</p>;
  return (
    <ul className="divide-y divide-stone-100">
      {articles.map((a) => (
        <li key={a.id} className="flex min-h-16 items-center gap-3 py-2">
          <Link href={`/reglages/catalogue/${a.id}`} className="min-w-0 flex-1">
            <span className={a.actif ? "block font-semibold" : "block font-semibold text-stone-400"}>
              <NomProduit nom={a.nom} />
            </span>
            <span className="block text-sm text-stone-600">
              {formaterPrix(a.prix_centimes)}
              {a.tampons > 0 && ` · ${a.tampons} graine${a.tampons > 1 ? "s" : ""} 🌱`}
              {!a.actif && " · hors saison"}
            </span>
          </Link>
          <BoutonActif id={a.id} actif={a.actif} nom={a.nom} />
        </li>
      ))}
    </ul>
  );
}

export default async function PageCatalogue() {
  await exigerAdmin();
  const articles = await listerArticles();

  return (
    <>
      <EnTetePage titre="Catalogue" retour="/reglages" />
      <div className="space-y-4">
        <Carte>
          <TitreSection>Paniers</TitreSection>
          <Liste articles={articles.filter((a) => a.categorie === "panier")} />
        </Carte>
        <Carte>
          <TitreSection>Suppléments</TitreSection>
          <p className="mb-2 text-sm text-stone-600">
            Désactivez un supplément hors saison : il disparaît des nouvelles commandes mais reste dans l&apos;historique.
          </p>
          <Liste articles={articles.filter((a) => a.categorie === "supplement")} />
        </Carte>
        <Carte>
          <TitreSection>Ajouter un article</TitreSection>
          <FormulaireArticle />
        </Carte>
      </div>
    </>
  );
}
