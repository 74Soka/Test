import type { Metadata } from "next";
import { exigerAdmin } from "@/lib/auth";
import { listerClients, listerSecteurs } from "@/lib/donnees";
import { formaterDate } from "@/lib/domaine/dates";
import { secteurPropose } from "@/lib/domaine/secteurs";
import { formaterTelephone } from "@/lib/domaine/telephone";
import { nomComplet } from "@/lib/domaine/texte";
import { clientSupabase } from "@/lib/supabase/serveur";
import { Carte, EnTetePage, EtatVide, Pastille } from "@/components/ui";
import { ValidationInscription } from "./validation";
import { codeComplet, formaterCode, normaliserCode } from "@/lib/domaine/parrainage";

export const metadata: Metadata = { title: "Inscriptions" };

export default async function PageInscriptions() {
  await exigerAdmin();
  const supabase = await clientSupabase();
  const [{ data: inscriptions, error }, secteurs, clients, { data: comptes }] = await Promise.all([
    supabase.from("inscriptions").select("*").order("statut").order("created_at"),
    listerSecteurs(),
    listerClients(),
    supabase.from("comptes_clients").select("client_id"),
  ]);
  if (error) throw new Error(error.message);
  // Parrains retrouvés par leur code (les anciennes inscriptions ont un nom en toutes lettres)
  const codes = [...new Set((inscriptions ?? []).map((i) => normaliserCode(i.parrain ?? "")).filter(codeComplet))];
  const { data: parrainsParCode } = codes.length
    ? await supabase.from("clients").select("id, nom, prenom, code_parrainage").in("code_parrainage", codes)
    : { data: [] };
  const parrainDuCode = new Map((parrainsParCode ?? []).map((c) => [c.code_parrainage, c]));
  const relies = new Set((comptes ?? []).map((c) => c.client_id));
  const libres = clients
    .filter((c) => !relies.has(c.id))
    .map((c) => ({ id: c.id, nom: c.nom, prenom: c.prenom, commune: c.commune, telephone: c.telephone }));
  const tous = clients.map((c) => ({ id: c.id, nom: c.nom, prenom: c.prenom, commune: c.commune, telephone: c.telephone }));

  return (
    <>
      <EnTetePage titre="Inscriptions en ligne" retour="/clients" />
      {!inscriptions?.length ? (
        <EtatVide>Aucune inscription en attente.</EtatVide>
      ) : (
        <ul className="space-y-4">
          {inscriptions.map((i) => (
            <li key={i.user_id}>
              <Carte aria-label={`Inscription de ${nomComplet(i)}`} className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-bold">{nomComplet(i)}</p>
                    <p className="text-sm text-stone-600">Inscrit le {formaterDate(i.created_at.slice(0, 10))}</p>
                  </div>
                  <Pastille couleur={i.statut === "en_attente" ? "orange" : "rouge"}>
                    {i.statut === "en_attente" ? "À valider" : "Refusée"}
                  </Pastille>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-stone-500">E-mail</dt>
                  <dd className="break-all">{i.email}</dd>
                  <dt className="text-stone-500">Téléphone</dt>
                  <dd>
                    <a href={`tel:${i.telephone}`} className="underline">
                      {formaterTelephone(i.telephone)}
                    </a>
                  </dd>
                  <dt className="text-stone-500">Adresse</dt>
                  <dd>
                    {i.adresse}
                    {i.complement_adresse && `, ${i.complement_adresse}`}, {i.code_postal} {i.commune}
                    {i.lat === null && <span className="block text-amber-800">Position à placer sur la fiche</span>}
                  </dd>
                  {i.notes_livraison && (
                    <>
                      <dt className="text-stone-500">Consignes</dt>
                      <dd>{i.notes_livraison}</dd>
                    </>
                  )}
                  {i.connu_par && (
                    <>
                      <dt className="text-stone-500">Nous a connus</dt>
                      <dd>{i.connu_par}</dd>
                    </>
                  )}
                  {i.parrain && (
                    <>
                      <dt className="text-stone-500">Parrain</dt>
                      <dd>
                        {codeComplet(i.parrain) ? (
                          <>
                            Code {formaterCode(i.parrain)}
                            {parrainDuCode.get(normaliserCode(i.parrain)) ? (
                              <span className="block font-semibold text-feuille-700">
                                ✓ {nomComplet(parrainDuCode.get(normaliserCode(i.parrain))!)}
                              </span>
                            ) : (
                              <span className="block text-amber-800">Code inconnu</span>
                            )}
                          </>
                        ) : (
                          <>« {i.parrain} »</>
                        )}
                      </dd>
                    </>
                  )}
                </dl>
                <ValidationInscription
                  userId={i.user_id}
                  statut={i.statut}
                  secteurs={secteurs.map((s) => ({ id: s.id, nom: s.nom }))}
                  secteurPropose={secteurPropose(i.code_insee, secteurs)?.id ?? null}
                  clientsLibres={libres}
                  parrains={tous}
                  parrainPropose={parrainDuCode.get(normaliserCode(i.parrain ?? ""))?.id ?? null}
                />
              </Carte>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
