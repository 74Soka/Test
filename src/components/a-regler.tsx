import { formaterPrix } from "@/lib/domaine/argent";
import { aReglerALaLivraison } from "@/lib/domaine/commandes";
import { cx } from "./ui";

/**
 * Total de la commande avec le solde du client : ce qu'il doit déjà s'ajoute,
 * son avoir se déduit, et c'est précisé ligne par ligne.
 * `pour` : « client » (vous devez…) ou « equipe » (le client doit…).
 */
export function DetailARegler({
  total,
  solde,
  pour = "client",
  libelleTotal = "Commande",
  className,
}: {
  total: number;
  solde: number;
  pour?: "client" | "equipe";
  libelleTotal?: string;
  className?: string;
}) {
  const { aRegler, avoirRestant } = aReglerALaLivraison(total, solde);
  const ligne = "flex items-baseline justify-between gap-3";
  return (
    <div className={cx("space-y-1", className)}>
      {solde !== 0 && (
        <>
          <p className={ligne}>
            <span className="text-stone-600">{libelleTotal}</span>
            <span className="tabular-nums">{formaterPrix(total)}</span>
          </p>
          {solde > 0 ? (
            <p className={cx(ligne, "text-amber-800")}>
              <span>{pour === "client" ? "Reste dû (livraisons précédentes)" : "Le client doit déjà"}</span>
              <span className="font-semibold tabular-nums">+ {formaterPrix(solde)}</span>
            </p>
          ) : (
            <p className={cx(ligne, "text-feuille-700")}>
              <span>{pour === "client" ? "Votre avoir, déduit" : "Avoir du client, déduit"}</span>
              <span className="font-semibold tabular-nums">− {formaterPrix(Math.min(-solde, total))}</span>
            </p>
          )}
        </>
      )}
      <p className={cx(ligne, "font-bold", solde !== 0 && "border-t border-stone-200 pt-1")}>
        <span>À régler à la livraison</span>
        <span className="text-lg tabular-nums">{formaterPrix(aRegler)}</span>
      </p>
      {avoirRestant > 0 && (
        <p className="text-sm text-feuille-700">
          {pour === "client" ? "Il vous restera" : "Il restera au client"} {formaterPrix(avoirRestant)} d&apos;avoir pour la
          fois suivante.
        </p>
      )}
    </div>
  );
}
