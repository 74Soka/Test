import type { Metadata } from "next";
import { exigerAdmin } from "@/lib/auth";
import { listerClients, listerSecteurs } from "@/lib/donnees";
import { EnTetePage, EtatVide, LienBouton, MessageInfo } from "@/components/ui";
import { ListeClients } from "./liste-clients";

export const metadata: Metadata = { title: "Clients" };

export default async function PageClients({ searchParams }: PageProps<"/clients">) {
  await exigerAdmin();
  const [clients, secteurs, { supprime }] = await Promise.all([listerClients(), listerSecteurs(), searchParams]);

  return (
    <>
      <EnTetePage
        titre="Clients"
        action={
          <LienBouton href="/clients/nouveau" taille="petit">
            + Nouveau
          </LienBouton>
        }
      />
      {supprime && (
        <div className="mb-3">
          <MessageInfo>Le client et ses données ont été supprimés.</MessageInfo>
        </div>
      )}
      {clients.length === 0 ? (
        <EtatVide action={<LienBouton href="/clients/nouveau">Ajouter un client</LienBouton>}>
          Aucun client pour l&apos;instant.
        </EtatVide>
      ) : (
        <ListeClients clients={clients} secteurs={secteurs} />
      )}
    </>
  );
}
