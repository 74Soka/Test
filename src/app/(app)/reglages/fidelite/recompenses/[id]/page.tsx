import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { exigerAdmin } from "@/lib/auth";
import { listerArticles, listerRecompenses } from "@/lib/donnees";
import { Carte, EnTetePage } from "@/components/ui";
import { FormulaireRecompense } from "../../formulaire-recompense";

export const metadata: Metadata = { title: "Modifier la récompense" };

export default async function PageRecompense({ params }: PageProps<"/reglages/fidelite/recompenses/[id]">) {
  await exigerAdmin();
  const { id } = await params;
  const [recompenses, articles] = await Promise.all([listerRecompenses(), listerArticles()]);
  const r = recompenses.find((x) => x.id === id);
  if (!r) notFound();

  return (
    <>
      <EnTetePage titre={r.nom} retour="/reglages/fidelite" />
      <Carte>
        <FormulaireRecompense
          id={r.id}
          articles={articles}
          initial={{
            nom: r.nom,
            description: r.description ?? "",
            cout_tampons: String(r.cout_tampons),
            niveau: r.niveau,
            article_id: r.article_id ?? "",
            actif: r.actif,
          }}
        />
      </Carte>
    </>
  );
}
