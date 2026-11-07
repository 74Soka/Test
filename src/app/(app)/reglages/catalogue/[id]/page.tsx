import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { exigerAdmin } from "@/lib/auth";
import { listerArticles } from "@/lib/donnees";
import { centimesVersSaisie } from "@/lib/domaine/argent";
import { Carte, EnTetePage } from "@/components/ui";
import { FormulaireArticle } from "../formulaire-article";

export const metadata: Metadata = { title: "Modifier l'article" };

export default async function PageArticle({ params }: PageProps<"/reglages/catalogue/[id]">) {
  await exigerAdmin();
  const { id } = await params;
  const article = (await listerArticles()).find((a) => a.id === id);
  if (!article) notFound();

  return (
    <>
      <EnTetePage titre={article.nom} retour="/reglages/catalogue" />
      <Carte>
        <FormulaireArticle
          id={article.id}
          initial={{
            nom: article.nom,
            categorie: article.categorie,
            prix: centimesVersSaisie(article.prix_centimes),
            tampons: String(article.tampons),
          }}
        />
      </Carte>
    </>
  );
}
