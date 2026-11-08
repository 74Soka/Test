import type { Metadata } from "next";
import { exigerClientRelie } from "@/lib/auth";
import { formaterDate, majuscule } from "@/lib/domaine/dates";
import { LIBELLES_STATUT } from "@/lib/domaine/commandes";
import { listerMesCommandes } from "@/lib/espace-client";
import { Carte, EnTetePage, EtatVide, LienBouton, Pastille } from "@/components/ui";
import { RecapCommande } from "../composants";

export const metadata: Metadata = { title: "Mes commandes" };

export default async function PageMesCommandes() {
  await exigerClientRelie();
  const commandes = await listerMesCommandes();

  return (
    <>
      <EnTetePage titre="Mes commandes" />
      {commandes.length === 0 ? (
        <EtatVide
          action={
            <LienBouton href="/espace/commander" taille="grand">
              Commander
            </LienBouton>
          }
        >
          Vous n&apos;avez pas encore commandé.
        </EtatVide>
      ) : (
        <ul className="space-y-3">
          {commandes.map((c) => (
            <li key={c.id}>
              <Carte aria-label={`Commande du ${formaterDate(c.date_livraison)}`} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold">{majuscule(formaterDate(c.date_livraison, { annee: true }))}</p>
                  <Pastille couleur={c.statut === "livree" ? "vert" : c.statut === "annulee" ? "rouge" : "bleu"}>
                    {LIBELLES_STATUT[c.statut]}
                  </Pastille>
                </div>
                <RecapCommande commande={c} />
              </Carte>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
