import type { Metadata } from "next";
import Link from "next/link";
import { exigerAdmin } from "@/lib/auth";
import { seDeconnecter } from "@/app/connexion/actions";
import { Bouton, Carte, EnTetePage } from "@/components/ui";
import { ActivationNotifications } from "@/app/espace/notifications";
import { clePubliqueVapid } from "@/lib/notifications";
import { abonnerTelephoneEquipe, desabonnerTelephoneEquipe } from "./actions-notifications";

export const metadata: Metadata = { title: "Réglages" };

const LIENS = [
  { href: "/reglages/messages", titre: "📣 Notification aux clients", detail: "Nouveau produit, information : envoyée tout de suite" },
  { href: "/reglages/composition", titre: "Composition des paniers", detail: "Le contenu des paniers, semaine par semaine" },
  { href: "/reglages/commandes-en-ligne", titre: "Commandes en ligne", detail: "Ouverture, heure de clôture, message aux clients" },
  { href: "/reglages/secteurs", titre: "Secteurs", detail: "Zones, jours et créneaux de livraison, communes couvertes" },
  { href: "/reglages/catalogue", titre: "Catalogue", detail: "Paniers et suppléments de saison, prix" },
  { href: "/reglages/fidelite", titre: "Fidélité et parrainage", detail: "Tampons, récompenses, niveaux VIP et Ultra" },
];

export default async function PageReglages() {
  const utilisateur = await exigerAdmin();
  const clePublique = await clePubliqueVapid();

  return (
    <>
      <EnTetePage titre="Réglages" />
      <div className="space-y-4">
        <nav className="overflow-hidden rounded-3xl bg-white shadow-[0_2px_8px_rgb(53_3_122/0.06)] ring-1 ring-marque-100">
          <ul className="divide-y divide-stone-100">
            {LIENS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 hover:bg-marque-50">
                  <span>
                    <span className="block font-semibold">{l.titre}</span>
                    <span className="block text-sm text-stone-600">{l.detail}</span>
                  </span>
                  <span aria-hidden className="text-2xl text-stone-400">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <ActivationNotifications
          clePublique={clePublique}
          variante="compte"
          nom="Alertes de l'équipe"
          titre="🔔 Alertes sur ce téléphone"
          description="Une notification à chaque nouvelle inscription à valider, et à chaque commande passée, modifiée ou annulée en ligne par un client."
          enregistrer={abonnerTelephoneEquipe}
          supprimer={desabonnerTelephoneEquipe}
        />

        <Carte>
          <p className="text-sm text-stone-600">Connecté en tant que</p>
          <p className="mb-4 font-semibold">{utilisateur.email}</p>
          <form action={seDeconnecter}>
            <Bouton type="submit" variante="secondaire" className="w-full">
              Se déconnecter
            </Bouton>
          </form>
        </Carte>
      </div>
    </>
  );
}
