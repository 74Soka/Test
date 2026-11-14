import { formaterPrix } from "@/lib/domaine/argent";
import {
  recapEncaissements,
  totalEncaisse,
  totalReconcilie,
  type CommandeEncaissement,
  type Encaissements,
} from "@/lib/domaine/encaissements";
import { Carte, PointCouleur, cx } from "./ui";

type SecteurAffiche = { id: string; nom: string; couleur: string };

function Ligne({ libelle, montant, classe, signe }: { libelle: string; montant: number; classe?: string; signe?: string }) {
  return (
    <div className={cx("flex items-baseline justify-between gap-3 py-1", classe)}>
      <dt>{libelle}</dt>
      <dd className="shrink-0 font-semibold tabular-nums">
        {signe}
        {formaterPrix(montant)}
      </dd>
    </div>
  );
}

function Bloc({ e, titre, couleur }: { e: Encaissements; titre: string; couleur?: string }) {
  const juste = totalReconcilie(e) === e.montantCommandes;
  return (
    <section aria-label={`Encaissements ${titre}`} className="rounded-2xl bg-stone-50 p-3 ring-1 ring-stone-200">
      <h3 className="mb-1 flex items-center gap-2 font-bold">
        {couleur && <PointCouleur couleur={couleur} />}
        {titre}
      </h3>
      <dl className="divide-y divide-stone-200 text-[0.95rem]">
        <Ligne libelle="Espèces" montant={e.especes} />
        <Ligne libelle="Chèques" montant={e.cheques} />
        {e.nonPrecise > 0 && <Ligne libelle="Encaissé, mode non précisé" montant={e.nonPrecise} />}
        <Ligne libelle="Total encaissé" montant={totalEncaisse(e)} classe="text-lg font-bold" />
        {e.avoirsDeduits > 0 && <Ligne libelle="Avoirs déduits" montant={e.avoirsDeduits} classe="text-feuille-700" />}
        {e.resteDu > 0 && <Ligne libelle="Reste dû (non payé)" montant={e.resteDu} classe="text-amber-800" />}
        {e.pasEncoreLivre > 0 && <Ligne libelle="Pas encore livré" montant={e.pasEncoreLivre} classe="text-stone-600" />}
        {e.encaisseEnPlus > 0 && (
          <Ligne
            libelle="Dont encaissé en plus (anciennes dettes, trop-perçu)"
            montant={e.encaisseEnPlus}
            classe="text-sky-800"
          />
        )}
      </dl>
      {e.complementsQuantite > 0 ? (
        <p className="mt-1 rounded-xl bg-marque-50 px-3 py-2 text-sm font-semibold text-marque-900">
          ➕ Compléments du livreur : {e.complementsQuantite} article{e.complementsQuantite > 1 ? "s" : ""} ·{" "}
          {formaterPrix(e.complementsCentimes)}
          <span className="block font-normal text-stone-600">Compris dans le montant des commandes.</span>
        </p>
      ) : (
        <p className="mt-1 rounded-xl bg-stone-100 px-3 py-2 text-sm font-semibold text-stone-600">➕ Aucun complément</p>
      )}
      <p className={cx("mt-1 text-sm", juste ? "text-feuille-700" : "font-semibold text-red-700")}>
        {juste ? "✓" : "⚠"} {e.commandes} commande{e.commandes > 1 ? "s" : ""} à préparer :{" "}
        {formaterPrix(e.montantCommandes)}
        {juste ? "" : ` (le récapitulatif donne ${formaterPrix(totalReconcilie(e))})`}
      </p>
    </section>
  );
}

/**
 * Argent de la période : espèces et chèques par secteur et au total, avec
 * avoirs, reste dû et commandes pas encore livrées, qui retombent sur le
 * montant des commandes à préparer.
 */
export function RecapEncaissements({
  commandes,
  secteurs,
  titre = "💶 Encaissements",
}: {
  commandes: CommandeEncaissement[];
  secteurs: SecteurAffiche[];
  titre?: string;
}) {
  const { parSecteur, total } = recapEncaissements(commandes);
  if (total.commandes === 0) return null;
  const blocs = secteurs.filter((s) => parSecteur.has(s.id));
  const inconnus = [...parSecteur.keys()].filter((id) => !secteurs.some((s) => s.id === id));
  return (
    <Carte aria-label="Encaissements" className="space-y-3">
      <h2 className="text-lg font-bold">{titre}</h2>
      {blocs.length + inconnus.length > 1 &&
        blocs.map((s) => <Bloc key={s.id} e={parSecteur.get(s.id)!} titre={s.nom} couleur={s.couleur} />)}
      <Bloc e={total} titre={blocs.length + inconnus.length > 1 ? "Tous les secteurs" : (blocs[0]?.nom ?? "Total")} couleur={blocs.length + inconnus.length > 1 ? undefined : blocs[0]?.couleur} />
    </Carte>
  );
}
