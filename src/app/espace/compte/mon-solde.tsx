import { Carte, TitreSection } from "@/components/ui";
import { formaterPrix } from "@/lib/domaine/argent";
import { formaterDate } from "@/lib/domaine/dates";

type Mouvement = {
  id: string;
  montant_centimes: number;
  motif: string;
  mode_paiement: string | null;
  created_at: string;
  commande: { date_livraison: string } | null;
};

const JOUR = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long" });

function libelle(m: Mouvement): string {
  if (m.motif === "livraison") return m.commande ? `Livraison du ${formaterDate(m.commande.date_livraison)}` : "Livraison";
  if (m.motif === "paiement") {
    const mode = m.mode_paiement === "especes" ? " en espèces" : m.mode_paiement === "cheque" ? " par chèque" : "";
    return `Paiement reçu${mode}`;
  }
  return m.montant_centimes < 0 ? "Avoir" : "Correction";
}

/** Solde du client : ce qu'il doit, ou ce que Frais et Français lui doit, et les derniers mouvements. */
export function MonSolde({ solde, mouvements }: { solde: number; mouvements: Mouvement[] }) {
  return (
    <Carte aria-label="Mon solde" className="space-y-3">
      <TitreSection>Mon solde</TitreSection>
      {solde > 0 ? (
        <div className="rounded-2xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200">
          <p className="text-2xl font-bold text-amber-900">Vous devez {formaterPrix(solde)}</p>
          <p className="text-amber-900">À régler avec votre prochaine livraison.</p>
        </div>
      ) : solde < 0 ? (
        <div className="rounded-2xl bg-feuille-50 px-4 py-3 ring-1 ring-feuille-600/30">
          <p className="text-2xl font-bold text-feuille-900">Frais et Français vous doit {formaterPrix(-solde)}</p>
          <p className="text-feuille-900">Déduits de votre prochaine livraison.</p>
        </div>
      ) : (
        <p className="text-2xl font-bold text-feuille-700">✓ Vous êtes à jour</p>
      )}

      {mouvements.length > 0 && (
        <>
          <h3 className="text-sm font-bold tracking-wide text-stone-600 uppercase">Derniers mouvements</h3>
          <ul className="divide-y divide-stone-100">
            {mouvements.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block font-medium">{libelle(m)}</span>
                  {m.motif !== "livraison" && (
                    <span className="block text-sm text-stone-600">le {JOUR.format(new Date(m.created_at))}</span>
                  )}
                </span>
                <span
                  className={
                    m.montant_centimes > 0 ? "shrink-0 font-semibold tabular-nums" : "shrink-0 font-semibold text-feuille-700 tabular-nums"
                  }
                >
                  {m.montant_centimes > 0 ? "+" : "−"} {formaterPrix(Math.abs(m.montant_centimes))}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-stone-600">« + » : à payer · « − » : réglé ou en votre faveur.</p>
        </>
      )}
    </Carte>
  );
}
