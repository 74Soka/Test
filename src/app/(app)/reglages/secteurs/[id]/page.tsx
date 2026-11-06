import type { Metadata } from "next";
import { exigerAdmin } from "@/lib/auth";
import { compterClientsParSecteur, lireSecteur } from "@/lib/donnees";
import { EnTetePage } from "@/components/ui";
import type { Creneau } from "@/lib/domaine/secteurs";
import { FormulaireSecteur } from "../formulaire-secteur";

export const metadata: Metadata = { title: "Modifier le secteur" };

export default async function PageModifierSecteur({ params }: PageProps<"/reglages/secteurs/[id]">) {
  await exigerAdmin();
  const { id } = await params;
  const [secteur, comptes] = await Promise.all([lireSecteur(id), compterClientsParSecteur()]);

  return (
    <>
      <EnTetePage titre={secteur.nom} retour="/reglages/secteurs" />
      <FormulaireSecteur
        id={secteur.id}
        nombreClients={comptes[secteur.id] ?? 0}
        initial={{
          nom: secteur.nom,
          jour: secteur.jour,
          creneau: secteur.creneau as Creneau,
          couleur: secteur.couleur,
          depart: { adresse: secteur.depart_adresse, lat: secteur.depart_lat, lng: secteur.depart_lng },
          communes: secteur.communes,
        }}
      />
    </>
  );
}
