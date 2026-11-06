import type { Metadata } from "next";
import Link from "next/link";
import { exigerAdmin } from "@/lib/auth";
import { compterClientsParSecteur, listerSecteurs } from "@/lib/donnees";
import { libelleTournee } from "@/lib/domaine/secteurs";
import { EnTetePage, EtatVide, LienBouton, PointCouleur } from "@/components/ui";

export const metadata: Metadata = { title: "Secteurs" };

export default async function PageSecteurs() {
  await exigerAdmin();
  const [secteurs, comptes] = await Promise.all([listerSecteurs(), compterClientsParSecteur()]);

  return (
    <>
      <EnTetePage
        titre="Secteurs"
        retour="/reglages"
        action={
          <LienBouton href="/reglages/secteurs/nouveau" taille="petit">
            + Ajouter
          </LienBouton>
        }
      />
      {secteurs.length === 0 ? (
        <EtatVide action={<LienBouton href="/reglages/secteurs/nouveau">Créer un secteur</LienBouton>}>
          Aucun secteur pour l&apos;instant. Commencez par en créer un : chaque client y sera rattaché.
        </EtatVide>
      ) : (
        <ul className="space-y-3">
          {secteurs.map((s) => (
            <li key={s.id}>
              <Link
                href={`/reglages/secteurs/${s.id}`}
                className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200 hover:bg-stone-50"
              >
                <div className="flex items-center gap-2">
                  <PointCouleur couleur={s.couleur} />
                  <span className="font-semibold">{s.nom}</span>
                  <span className="ml-auto text-sm text-stone-600">{comptes[s.id] ?? 0} clients</span>
                </div>
                <p className="mt-1 text-stone-700">{libelleTournee(s)}</p>
                <p className="mt-1 text-sm text-stone-500">
                  {s.communes.length ? s.communes.map((c) => c.nom).join(", ") : "Aucune commune renseignée"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
