import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { utilisateurCourant } from "@/lib/auth";
import { seDeconnecter } from "@/app/connexion/actions";
import { Bouton } from "@/components/ui";

export const metadata: Metadata = { title: "Accès refusé" };

export default async function PageAccesRefuse() {
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) redirect("/connexion");
  if (utilisateur.role === "admin") redirect("/livraisons");

  const message =
    utilisateur.role === "livreur"
      ? "Votre compte livreur est bien créé. Les écrans de tournée arriveront avec la prochaine étape de l'application."
      : "Votre compte n'a pas encore accès à l'application. Demandez à l'administrateur de vous ajouter.";

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 py-10 text-center">
      <h1 className="text-2xl font-bold">Accès limité</h1>
      <p className="text-stone-700">{message}</p>
      <p className="text-sm text-stone-500">Connecté en tant que {utilisateur.email}</p>
      <form action={seDeconnecter}>
        <Bouton type="submit" variante="secondaire" className="w-full">
          Se déconnecter
        </Bouton>
      </form>
    </main>
  );
}
