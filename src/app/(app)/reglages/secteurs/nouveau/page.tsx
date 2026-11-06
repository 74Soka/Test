import type { Metadata } from "next";
import { exigerAdmin } from "@/lib/auth";
import { EnTetePage } from "@/components/ui";
import { FormulaireSecteur } from "../formulaire-secteur";

export const metadata: Metadata = { title: "Nouveau secteur" };

export default async function PageNouveauSecteur() {
  await exigerAdmin();
  return (
    <>
      <EnTetePage titre="Nouveau secteur" retour="/reglages/secteurs" />
      <FormulaireSecteur />
    </>
  );
}
