import type { Metadata } from "next";
import { exigerAdmin } from "@/lib/auth";
import { listerArticles } from "@/lib/donnees";
import { Carte, EnTetePage } from "@/components/ui";
import { FormulaireRecompense } from "../../formulaire-recompense";

export const metadata: Metadata = { title: "Nouvelle récompense" };

export default async function PageNouvelleRecompense() {
  await exigerAdmin();
  const articles = await listerArticles({ actifsSeulement: true });
  return (
    <>
      <EnTetePage titre="Nouvelle récompense" retour="/reglages/fidelite" />
      <Carte>
        <FormulaireRecompense articles={articles} />
      </Carte>
    </>
  );
}
