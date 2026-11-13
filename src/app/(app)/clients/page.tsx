import type { Metadata } from "next";
import Link from "next/link";
import { exigerAdmin } from "@/lib/auth";
import { clientSupabase } from "@/lib/supabase/serveur";
import { listerClients, listerSecteurs } from "@/lib/donnees";
import { EnTetePage, EtatVide, LienBouton, MessageInfo } from "@/components/ui";
import { ListeClients } from "./liste-clients";
import { PlacerReperes } from "./placer-reperes";

export const metadata: Metadata = { title: "Clients" };

export default async function PageClients({ searchParams }: PageProps<"/clients">) {
  await exigerAdmin();
  const supabase = await clientSupabase();
  const [clients, secteurs, { supprime }, { count: inscriptions }, { count: retours }, { count: sansRepere }] = await Promise.all([
    listerClients(),
    listerSecteurs(),
    searchParams,
    supabase.from("inscriptions").select("user_id", { count: "exact", head: true }).eq("statut", "en_attente"),
    supabase.from("avis_livraison").select("commande_id", { count: "exact", head: true }).is("traite_le", null),
    supabase.from("clients").select("id", { count: "exact", head: true }).is("lat", null),
  ]);

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
      {(inscriptions ?? 0) > 0 && (
        <Link
          href="/clients/inscriptions"
          className="mb-3 flex min-h-12 items-center justify-between gap-2 rounded-xl bg-amber-50 px-4 py-2 font-semibold text-amber-900 ring-1 ring-amber-300"
        >
          <span>
            🔔 {inscriptions} inscription{inscriptions! > 1 ? "s" : ""} en ligne à valider
          </span>
          <span aria-hidden>›</span>
        </Link>
      )}
      <Link
        href="/clients/retours"
        className="mb-3 flex min-h-12 items-center justify-between gap-2 rounded-2xl bg-white px-4 py-2 font-semibold text-marque-800 ring-1 ring-marque-100"
      >
        <span>💬 Retours clients{(retours ?? 0) > 0 ? ` : ${retours} à traiter` : ""}</span>
        <span aria-hidden>›</span>
      </Link>
      <PlacerReperes nombre={sansRepere ?? 0} />
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
