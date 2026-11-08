import type { Metadata } from "next";
import Link from "next/link";
import { CadrePublic } from "@/components/cadre-public";
import { FormulaireOubli } from "./formulaire-oubli";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function PageMotDePasseOublie() {
  return (
    <CadrePublic
      titre="Mot de passe oublié"
      sousTitre="Recevez un lien pour en choisir un nouveau"
      pied={
        <p>
          <Link href="/connexion" className="font-semibold text-marque-800 underline">
            Retour à la connexion
          </Link>
        </p>
      }
    >
      <FormulaireOubli />
    </CadrePublic>
  );
}
