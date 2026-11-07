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

const ONGLETS = [
  { href: "/livraisons", libelle: "Livraisons", icone: ICONES.livraisons },
  { href: "/tournee", libelle: "Tournée", icone: ICONES.tournee },
  { href: "/commandes/nouvelle", libelle: "Commande", icone: ICONES.commande, accent: true },
  { href: "/clients", libelle: "Clients", icone: ICONES.clients },
  { href: "/reglages", libelle: "Réglages", icone: ICONES.reglages },
] as const;

export function NavigationBas() {
  const chemin = usePathname();

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-5">
        {ONGLETS.map((o) => {
          const actif = chemin === o.href || chemin.startsWith(`${o.href}/`);
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
                    "accent" in o && o.accent ? "bg-marque-700 text-white" : actif && "bg-marque-100",
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
