"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const ICONES = {
  livraisons: (
    <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7zM7.5 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17.5 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />
  ),
  clients: (
    <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 19v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.15a3.5 3.5 0 0 1 0 6.7" />
  ),
  commande: <path d="M12 5v14M5 12h14" />,
  tournee: (
    <path d="M9 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM19 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM7 16V9a3 3 0 0 1 3-3h5M17 8v7a3 3 0 0 1-3 3H9" />
  ),
  reglages: (
    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68 1.65 1.65 0 0 0 10 3.17V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  ),
};

type Onglet = { href: string; libelle: string; icone: React.ReactNode; accent?: boolean; exact?: boolean };

const ONGLETS_EQUIPE: Onglet[] = [
  { href: "/livraisons", libelle: "Livraisons", icone: ICONES.livraisons },
  { href: "/tournee", libelle: "Tournée", icone: ICONES.tournee },
  { href: "/commandes/nouvelle", libelle: "Commande", icone: ICONES.commande, accent: true },
  { href: "/clients", libelle: "Clients", icone: ICONES.clients },
  { href: "/reglages", libelle: "Réglages", icone: ICONES.reglages },
];

const ONGLETS_CLIENT: Onglet[] = [
  { href: "/espace", libelle: "Accueil", icone: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />, exact: true },
  { href: "/espace/fidelite", libelle: "Fidélité", icone: <path d="M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z" /> },
  { href: "/espace/commander", libelle: "Commander", icone: ICONES.commande, accent: true },
  { href: "/espace/commandes", libelle: "Commandes", icone: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /> },
  { href: "/espace/compte", libelle: "Compte", icone: <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" /> },
];

/** Barre d'onglets en bas d'écran : celle de l'équipe, ou celle des clients. */
export function NavigationBas({ espace = "equipe" }: { espace?: "equipe" | "client" }) {
  const chemin = usePathname();
  const onglets = espace === "client" ? ONGLETS_CLIENT : ONGLETS_EQUIPE;

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-5">
        {onglets.map((o) => {
          const actif = chemin === o.href || (!o.exact && chemin.startsWith(`${o.href}/`));
          return (
            <li key={o.href}>
              <Link
                href={o.href}
                aria-current={actif ? "page" : undefined}
                className={cx(
                  "flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold",
                  actif ? "text-marque-800" : "text-stone-600",
                )}
              >
                <span
                  className={cx(
                    "flex h-8 w-12 items-center justify-center rounded-full",
                    o.accent ? "bg-marque-700 text-white" : actif && "bg-marque-100",
                  )}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="size-6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    {o.icone}
                  </svg>
                </span>
                {o.libelle}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
