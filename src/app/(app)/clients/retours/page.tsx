import type { Metadata } from "next";
import Link from "next/link";
import { exigerAdmin } from "@/lib/auth";
import { formaterDate } from "@/lib/domaine/dates";
import { nomComplet } from "@/lib/domaine/texte";
import { clientSupabase } from "@/lib/supabase/serveur";
import { Carte, EnTetePage, EtatVide, Pastille } from "@/components/ui";
import { BoutonTraite } from "./bouton-traite";

export const metadata: Metadata = { title: "Retours clients" };

export default async function PageRetours() {
  await exigerAdmin();
  const supabase = await clientSupabase();
  const { data: avis, error } = await supabase
    .from("avis_livraison")
    .select("commande_id, note, commentaire, created_at, updated_at, traite_le")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  const { data: commandes } = avis?.length
    ? await supabase
        .from("commandes")
        .select("id, date_livraison, client:clients(id, nom, prenom, telephone)")
        .in(
          "id",
          avis.map((a) => a.commande_id),
        )
    : { data: [] };
  const parId = new Map((commandes ?? []).map((c) => [c.id, c]));
  const tries = [...(avis ?? [])].sort((a, b) => Number(a.traite_le !== null) - Number(b.traite_le !== null));

  return (
    <>
      <EnTetePage titre="Retours clients" retour="/clients" />
      {tries.length === 0 ? (
        <EtatVide>Aucun avis pour le moment.</EtatVide>
      ) : (
        <ul className="space-y-3">
          {tries.map((a) => {
            const c = parId.get(a.commande_id);
            return (
              <li key={a.commande_id}>
                <Carte aria-label={`Avis de ${c ? nomComplet(c.client) : "client"}`} className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold">{c ? nomComplet(c.client) : "Client"}</p>
                      <p className="text-sm text-stone-600">
                        Livraison du {c ? formaterDate(c.date_livraison) : "—"} · avis du {formaterDate(a.updated_at.slice(0, 10))}
                      </p>
                    </div>
                    {a.traite_le ? <Pastille couleur="vert">Traité</Pastille> : <Pastille couleur="orange">À traiter</Pastille>}
                  </div>
                  {a.note !== null && (
                    <p className="text-xl text-peche-600" aria-label={`${a.note} sur 5`}>
                      {"★".repeat(a.note)}
                      <span className="text-marque-200">{"★".repeat(5 - a.note)}</span>
                    </p>
                  )}
                  {a.commentaire && <p className="whitespace-pre-line text-stone-800">« {a.commentaire} »</p>}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex gap-3 text-sm">
                      <Link href={`/commandes/${a.commande_id}`} className="font-semibold text-marque-800 underline">
                        La commande
                      </Link>
                      {c?.client.telephone && (
                        <a href={`tel:${c.client.telephone}`} className="font-semibold text-marque-800 underline">
                          Appeler
                        </a>
                      )}
                    </span>
                    <BoutonTraite commandeId={a.commande_id} traite={a.traite_le !== null} />
                  </div>
                </Carte>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
