import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { utilisateurCourant } from "@/lib/auth";
import { CadrePublic } from "@/components/cadre-public";
import { FormulaireInscription } from "./formulaire-inscription";

export const metadata: Metadata = { title: "Créer mon compte" };

export default async function PageInscription() {
  if (await utilisateurCourant()) redirect("/");
  return (
    <CadrePublic
      titre="Créer mon compte"
      sousTitre="Pour commander vos paniers et suivre votre carte de fidélité"
      pied={
        <p>
          Déjà un compte ?{" "}
          <Link href="/connexion" className="font-semibold text-marque-800 underline">
            Se connecter
          </Link>
        </p>
      }
    >
      <FormulaireInscription />
    </CadrePublic>
  );
}
