import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { utilisateurCourant } from "@/lib/auth";
import { CadrePublic } from "@/components/cadre-public";
import { FormulaireNouveauMotDePasse } from "./formulaire-nouveau-mot-de-passe";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

export default async function PageNouveauMotDePasse() {
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) redirect("/connexion?message=lien");
  return (
    <CadrePublic titre="Nouveau mot de passe" sousTitre={utilisateur.email ?? undefined}>
      <FormulaireNouveauMotDePasse />
    </CadrePublic>
  );
}
