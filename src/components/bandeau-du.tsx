import type { ReactNode } from "react";
import { formaterPrix } from "@/lib/domaine/argent";
import { cx } from "./ui";

/**
 * Barre rouge « le client doit… », pour l'équipe (administrateur, livreur) :
 * bien visible d'un coup d'œil, en clair comme en sombre.
 */
export function BandeauDu({
  montant,
  libelle = "Doit",
  detail,
  grand = false,
  className,
}: {
  montant: number;
  libelle?: ReactNode;
  detail?: ReactNode;
  grand?: boolean;
  className?: string;
}) {
  return (
    <div className={cx("rounded-xl bg-red-600 px-3 py-2 text-white shadow-sm ring-1 ring-red-700", className)}>
      <p className="flex items-baseline justify-between gap-3 font-bold">
        <span>⚠️ {libelle}</span>
        <span className={cx("tabular-nums", grand ? "text-2xl" : "text-lg")}>{formaterPrix(montant)}</span>
      </p>
      {detail && <p className="text-sm font-medium text-white/90">{detail}</p>}
    </div>
  );
}

/** Petite pastille rouge « Doit 12,50 € » (liste des clients). */
export function PastilleDu({ montant }: { montant: number }) {
  return (
    <span className="shrink-0 rounded-full bg-red-600 px-2.5 py-1 text-sm font-bold whitespace-nowrap text-white tabular-nums">
      Doit {formaterPrix(montant)}
    </span>
  );
}
