import type { Metadata } from "next";
import { exigerAdmin } from "@/lib/auth";
import { listerClients, listerSecteurs } from "@/lib/donnees";
import { aujourdhui } from "@/lib/domaine/dates";
import { EnTetePage } from "@/components/ui";
import { FormulaireClient } from "../formulaire-client";

export const metadata: Metadata = { title: "Nouveau client" };

export default async function PageNouveauClient() {
  await exigerAdmin();
  const [secteurs, clients] = await Promise.all([listerSecteurs(), listerClients()]);

  return (
    <>
      <EnTetePage titre="Nouveau client" retour="/clients" />
      <FormulaireClient
        secteurs={secteurs}
        clients={clients}
        initial={{
          nom: "",
          prenom: "",
          telephone: "",
          email: "",
          adresse: undefined as never,
          complementAdresse: "",
          notesLivraison: "",
          secteurId: "",
          parrainId: null,
          dateInscription: aujourdhui(),
        }}
      />
    </>
  );
}
