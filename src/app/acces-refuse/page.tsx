import { redirect } from "next/navigation";
import { utilisateurCourant } from "@/lib/auth";

/** Ancienne page d'accès limité : chacun est désormais aiguillé vers ses écrans. */
export default async function PageAccesRefuse() {
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) redirect("/connexion");
  if (utilisateur.role === "admin") redirect("/livraisons");
  if (utilisateur.role === "livreur") redirect("/tournee");
  redirect("/espace");
}
