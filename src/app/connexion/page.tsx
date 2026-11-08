import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { utilisateurCourant } from "@/lib/auth";
import { CadrePublic } from "@/components/cadre-public";
import { MessageErreur, MessageInfo } from "@/components/ui";
import { FormulaireConnexion } from "./formulaire-connexion";

export const metadata: Metadata = { title: "Connexion" };

const MESSAGES: Record<string, { type: "info" | "erreur"; texte: string }> = {
  lien: {
    type: "info",
    texte:
      "Lien ouvert sur un autre appareil ou déjà utilisé ? Si vous venez de confirmer votre adresse, connectez-vous ci-dessous.",
  },
  confirme: { type: "info", texte: "Adresse confirmée : connectez-vous pour continuer." },
  supprime: { type: "info", texte: "Votre compte et vos données ont été supprimés." },
};

export default async function PageConnexion({ searchParams }: PageProps<"/connexion">) {
  if (await utilisateurCourant()) redirect("/");
  const { suite, message } = await searchParams;
  const info = typeof message === "string" ? MESSAGES[message] : undefined;

  return (
    <CadrePublic
      titre="Frais et Français"
      sousTitre="Paniers de fruits et légumes livrés le week-end"
      pied={
        <>
          <p>
            <Link href="/mot-de-passe-oublie" className="font-semibold text-marque-800 underline">
              Mot de passe oublié ?
            </Link>
          </p>
          <p>
            Pas encore de compte ?{" "}
            <Link href="/inscription" className="font-semibold text-marque-800 underline">
              Créer mon compte client
            </Link>
          </p>
        </>
      }
    >
      {info && <div className="mb-4">{info.type === "info" ? <MessageInfo>{info.texte}</MessageInfo> : <MessageErreur>{info.texte}</MessageErreur>}</div>}
      <FormulaireConnexion suite={typeof suite === "string" ? suite : undefined} />
    </CadrePublic>
  );
}
