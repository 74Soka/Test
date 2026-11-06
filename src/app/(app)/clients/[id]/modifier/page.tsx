import type { Metadata } from "next";
import { exigerAdmin } from "@/lib/auth";
import { lireClient, listerClients, listerSecteurs } from "@/lib/donnees";
import { formaterTelephone } from "@/lib/domaine/telephone";
import { nomComplet } from "@/lib/domaine/texte";
import { EnTetePage } from "@/components/ui";
import { FormulaireClient } from "../../formulaire-client";

export const metadata: Metadata = { title: "Modifier le client" };

export default async function PageModifierClient({ params }: PageProps<"/clients/[id]/modifier">) {
  await exigerAdmin();
  const { id } = await params;
  const [{ client }, secteurs, clients] = await Promise.all([lireClient(id), listerSecteurs(), listerClients()]);

  return (
    <>
      <EnTetePage titre={nomComplet(client)} sousTitre="Modifier la fiche" retour={`/clients/${id}`} />
      <FormulaireClient
        id={id}
        secteurs={secteurs}
        clients={clients.filter((c) => c.id !== id)}
        initial={{
          nom: client.nom,
          prenom: client.prenom,
          telephone: formaterTelephone(client.telephone),
          email: client.email ?? "",
          adresse: {
            ligne: client.adresse,
            codePostal: client.code_postal,
            commune: client.commune,
            codeInsee: client.code_insee,
            lat: client.lat,
            lng: client.lng,
            source: client.source_position,
          },
          complementAdresse: client.complement_adresse ?? "",
          notesLivraison: client.notes_livraison ?? "",
          secteurId: client.secteur_id,
          parrainId: client.parrain_id,
          dateInscription: client.date_inscription,
        }}
      />
    </>
  );
}
