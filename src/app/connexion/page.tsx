import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { utilisateurCourant } from "@/lib/auth";
import { FormulaireConnexion } from "./formulaire-connexion";

export const metadata: Metadata = { title: "Connexion" };

export default async function PageConnexion({ searchParams }: PageProps<"/connexion">) {
  if (await utilisateurCourant()) redirect("/livraisons");
  const { suite } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-8 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" width={72} height={72} className="mx-auto mb-4 rounded-2xl" />
        <h1 className="text-2xl font-bold">Paniers</h1>
        <p className="mt-1 text-stone-600">Commandes et livraisons</p>
      </div>
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
        <FormulaireConnexion suite={typeof suite === "string" ? suite : undefined} />
      </div>
      <p className="mt-6 text-center text-sm text-stone-500">
        Pas de compte ? Les accès sont créés par l&apos;administrateur.
      </p>
    </main>
  );
}
