import type { Metadata } from "next";
import Link from "next/link";
import { exigerAdmin } from "@/lib/auth";
import { listerArticles } from "@/lib/donnees";
import { ajouterJours, aujourdhui, estDateIso, formaterSemaine, jourSemaine, lundiDeLaSemaine } from "@/lib/domaine/dates";
import { clientSupabase } from "@/lib/supabase/serveur";
import { EnTetePage } from "@/components/ui";
import { FormulaireComposition } from "./formulaire";

export const metadata: Metadata = { title: "Composition des paniers" };

export default async function PageComposition({ searchParams }: PageProps<"/reglages/composition">) {
  await exigerAdmin();
  const { semaine: demandee } = await searchParams;
  // Par défaut : la semaine en cours du lundi au vendredi, la suivante le week-end
  const ajd = aujourdhui();
  const parDefaut = lundiDeLaSemaine(jourSemaine(ajd) >= 6 ? ajouterJours(ajd, 7) : ajd);
  const semaine =
    typeof demandee === "string" && estDateIso(demandee) ? lundiDeLaSemaine(demandee) : parDefaut;

  const supabase = await clientSupabase();
  const [articles, { data: lignes }, { data: precedentes }] = await Promise.all([
    listerArticles({ actifsSeulement: true }),
    supabase.from("compositions").select("article_id, contenu").eq("semaine", semaine),
    supabase.from("compositions").select("article_id, contenu").eq("semaine", ajouterJours(semaine, -7)),
  ]);
  const paniers = articles.filter((a) => a.categorie === "panier");
  const versDico = (l: { article_id: string; contenu: string }[] | null) =>
    Object.fromEntries((l ?? []).map((x) => [x.article_id, x.contenu]));

  const lien = (s: string) => `/reglages/composition?semaine=${s}`;
  return (
    <>
      <EnTetePage titre="Composition des paniers" sousTitre={formaterSemaine(semaine)} retour="/reglages" />
      <div className="mb-4 flex items-center justify-between gap-2">
        <Link href={lien(ajouterJours(semaine, -7))} className="min-h-11 rounded-full bg-white px-4 py-2 font-semibold ring-1 ring-stone-300">
          ‹ Semaine précédente
        </Link>
        <Link href={lien(ajouterJours(semaine, 7))} className="min-h-11 rounded-full bg-white px-4 py-2 font-semibold ring-1 ring-stone-300">
          Semaine suivante ›
        </Link>
      </div>
      <FormulaireComposition
        key={semaine}
        semaine={semaine}
        paniers={paniers.map((p) => ({ id: p.id, nom: p.nom }))}
        initial={versDico(lignes)}
        precedente={versDico(precedentes)}
      />
    </>
  );
}
