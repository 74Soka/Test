import Link from "next/link";
import type { FideliteClient, Recompense } from "@/lib/donnees";
import { aujourdhui, formaterDateCourte } from "@/lib/domaine/dates";
import {
  LIBELLES_MOTIF,
  LIBELLES_NIVEAU,
  niveauSuivant,
  pluriel,
  prochaineRecompense,
  recompensesDisponibles,
} from "@/lib/domaine/fidelite";
import { nomComplet } from "@/lib/domaine/texte";
import { GrilleTampons } from "@/components/grille-tampons";
import { Carte, Pastille, TitreSection, cx } from "@/components/ui";
import { AjustementTampons } from "./ajustement-tampons";

type Mouvement = {
  cle: string;
  date: string;
  quantite: number;
  libelle: string;
  detail?: string;
  lien?: string;
  barre?: boolean;
  /** Cadeau de parrainage (ne coûte pas de tampons) */
  offert?: boolean;
};

export function CarteFidelite({
  clientId,
  fidelite,
  recompenses,
  parametres,
}: {
  clientId: string;
  fidelite: FideliteClient;
  recompenses: Recompense[];
  parametres: {
    filleuls_vip: number;
    filleuls_ultra: number;
    filleuls_livres_seulement: boolean;
    parrainage_cadeaux_debut: string;
  };
}) {
  const { solde, niveau } = fidelite;
  const disponibles = recompensesDisponibles(solde, niveau, recompenses);
  const prochaine = prochaineRecompense(solde, niveau, recompenses);
  const suivant = niveauSuivant(niveau, fidelite.filleulsComptes, parametres);

  const mouvements: Mouvement[] = [
    ...fidelite.gains.map((g) => ({
      cle: `g-${g.id}`,
      date: aujourdhui(new Date(g.created_at)),
      quantite: g.quantite,
      libelle: LIBELLES_MOTIF[g.motif],
      detail:
        g.motif === "ajustement"
          ? (g.note ?? undefined)
          : g.filleul
            ? nomComplet(g.filleul)
            : g.commande
              ? `livraison du ${formaterDateCourte(g.commande.date_livraison)}`
              : undefined,
    })),
    ...fidelite.depenses.map((d) => ({
      cle: `d-${d.id}`,
      date: aujourdhui(new Date(d.created_at)),
      quantite: -d.cout_tampons,
      libelle: d.nom,
      detail:
        d.statut === "annulee"
          ? "commande annulée : tampons rendus"
          : `commande du ${formaterDateCourte(d.date_livraison)}`,
      lien: `/commandes/${d.commande_id}`,
      barre: d.statut === "annulee",
      offert: d.cout_tampons === 0,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Carte className="space-y-3">
      <TitreSection
        action={
          niveau !== "standard" ? <Pastille couleur={niveau === "ultra" ? "orange" : "bleu"}>{LIBELLES_NIVEAU[niveau]}</Pastille> : undefined
        }
      >
        Carte de fidélité
      </TitreSection>

      <p>
        <span className="text-4xl font-bold tabular-nums">{solde}</span>{" "}
        <span className="text-lg text-stone-700">{Math.abs(solde) > 1 ? "tampons" : "tampon"}</span>
      </p>
      <GrilleTampons solde={solde} />

      {disponibles.length > 0 && (
        <div className="rounded-xl bg-marque-50 px-3 py-2 text-marque-900 ring-1 ring-marque-600/30">
          <p className="font-semibold">🎁 Récompense disponible</p>
          <ul className="text-sm">
            {disponibles.map((r) => (
              <li key={r.id}>
                {r.nom} ({pluriel(r.cout_tampons, "tampon")})
              </li>
            ))}
          </ul>
          <p className="mt-1 text-sm">À utiliser depuis une commande du client.</p>
        </div>
      )}
      {prochaine && (
        <p className="text-stone-700">
          Encore <strong>{pluriel(prochaine.manque, "tampon")}</strong> pour « {prochaine.recompense.nom} ».
        </p>
      )}

      {(fidelite.confituresDues.length > 0 ||
        (fidelite.filleul && fidelite.commandesNonAnnulees === 0)) && (
        <div className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-amber-300">
          <p className="font-semibold">🎁 Cadeaux de parrainage</p>
          <ul className="text-sm">
            {fidelite.filleul && fidelite.commandesNonAnnulees === 0 && (
              <li>
                Œufs offerts dans sa première commande (ajoutés d&apos;office
                {aujourdhui() < parametres.parrainage_cadeaux_debut
                  ? `, à partir du ${formaterDateCourte(parametres.parrainage_cadeaux_debut).replace(/^\S+ /, "")}`
                  : ""}
                ).
              </li>
            )}
            {fidelite.confituresDues.map((c) => (
              <li key={c.filleul_id}>
                Une confiture à lui offrir : son filleul {[c.filleul_prenom, c.filleul_nom].filter(Boolean).join(" ")} a
                commandé.
              </li>
            ))}
          </ul>
          {fidelite.confituresDues.length > 0 && (
            <p className="mt-1 text-sm">À ajouter à l&apos;une de ses commandes (section Fidélité).</p>
          )}
        </div>
      )}

      <p className="text-sm text-stone-600">
        {pluriel(fidelite.filleuls, "filleul")}
        {parametres.filleuls_livres_seulement && fidelite.filleuls > 0 && ` (dont ${fidelite.filleulsComptes} déjà livré${fidelite.filleulsComptes > 1 ? "s" : ""})`}
        {suivant
          ? ` · ${LIBELLES_NIVEAU[suivant.niveau]} dans ${pluriel(suivant.manque, "filleul")}${parametres.filleuls_livres_seulement ? " livré" + (suivant.manque > 1 ? "s" : "") : ""}`
          : " · niveau maximum"}
      </p>

      <details className="group">
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-marque-800">
          Historique ({mouvements.length})
        </summary>
        <ul className="divide-y divide-stone-100">
          {mouvements.map((m) => {
            const contenu = (
              <>
                <span className="w-16 shrink-0 text-sm text-stone-500">{formaterDateCourte(m.date).replace(/^\S+ /, "")}</span>
                <span className={cx("min-w-0 flex-1", m.barre && "text-stone-400 line-through")}>
                  <span className="block text-sm font-medium">{m.libelle}</span>
                  {m.detail && <span className="block truncate text-xs text-stone-500">{m.detail}</span>}
                </span>
                <span
                  className={cx(
                    "font-bold tabular-nums",
                    m.barre ? "text-stone-400 line-through" : m.quantite > 0 ? "text-marque-800" : "text-red-700",
                  )}
                >
                  {m.offert ? "🎁" : m.quantite > 0 ? `+${m.quantite}` : m.quantite}
                </span>
              </>
            );
            return (
              <li key={m.cle}>
                {m.lien ? (
                  <Link href={m.lien} className="flex min-h-12 items-center gap-3 py-1.5">
                    {contenu}
                  </Link>
                ) : (
                  <div className="flex min-h-12 items-center gap-3 py-1.5">{contenu}</div>
                )}
              </li>
            );
          })}
        </ul>
      </details>

      <AjustementTampons clientId={clientId} />
    </Carte>
  );
}
