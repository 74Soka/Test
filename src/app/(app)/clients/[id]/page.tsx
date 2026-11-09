import type { Metadata } from "next";
import Link from "next/link";
import { exigerAdmin } from "@/lib/auth";
import {
  commandeDeLaSemaine,
  aUnCompteEnLigne,
  compterTelephonesNotifies,
  lireClient,
  lireFideliteClient,
  lireParametresFidelite,
  listerRecompenses,
  listerSecteurs,
} from "@/lib/donnees";
import { formaterPrix } from "@/lib/domaine/argent";
import { LIBELLES_STATUT, resumeLignes, totalCommande, type Statut } from "@/lib/domaine/commandes";
import { aujourdhui, formaterDate, formaterDateCourte, lundiDeLaSemaine } from "@/lib/domaine/dates";
import { libelleTournee, prochaineLivraison } from "@/lib/domaine/secteurs";
import { estMobile, formaterTelephone } from "@/lib/domaine/telephone";
import { nomComplet } from "@/lib/domaine/texte";
import { BoutonNotificationTest } from "./bouton-notification-test";
import { Carte as CarteOsm } from "@/components/carte";
import {
  Carte,
  EnTetePage,
  LienBouton,
  LienExterneBouton,
  MessageInfo,
  Pastille,
  PointCouleur,
  TitreSection,
} from "@/components/ui";
import { BoutonActivite } from "./bouton-activite";
import { CarteFidelite } from "./carte-fidelite";

export const metadata: Metadata = { title: "Fiche client" };

const COULEUR_STATUT: Record<Statut, "orange" | "vert" | "gris"> = {
  a_livrer: "orange",
  livree: "vert",
  annulee: "gris",
};

export default async function PageClient({ params }: PageProps<"/clients/[id]">) {
  await exigerAdmin();
  const { id } = await params;
  const [{ client, parrain, filleuls, commandes }, secteurs, fidelite, recompenses, parametres, compteEnLigne] =
    await Promise.all([
      lireClient(id),
      listerSecteurs(),
      lireFideliteClient(id),
      listerRecompenses({ actifsSeulement: true }),
      lireParametresFidelite(),
      aUnCompteEnLigne(id),
    ]);
  const telephones = compteEnLigne ? await compterTelephonesNotifies(id) : 0;
  const secteur = secteurs.find((s) => s.id === client.secteur_id);
  const prochaine = secteur ? prochaineLivraison(secteur, aujourdhui()) : null;
  const commandeSemaine = prochaine ? await commandeDeLaSemaine(id, lundiDeLaSemaine(prochaine)) : null;
  const derniere = commandes.find((c) => c.statut !== "annulee");
  const position = client.lat !== null && client.lng !== null ? { lat: client.lat, lng: client.lng } : null;

  return (
    <>
      <EnTetePage
        titre={nomComplet(client)}
        sousTitre={secteur ? `${secteur.nom} · ${libelleTournee(secteur)}` : undefined}
        retour="/clients"
        action={
          <LienBouton href={`/clients/${id}/modifier`} variante="secondaire" taille="petit">
            Modifier
          </LienBouton>
        }
      />

      <div className="space-y-4">
        {!client.actif && <MessageInfo>Client inactif : il n&apos;apparaît plus dans la saisie des commandes.</MessageInfo>}

        {client.telephone && (
          <div className="grid grid-cols-2 gap-2">
            <LienExterneBouton href={`tel:${client.telephone}`} taille="grand">
              Appeler
            </LienExterneBouton>
            {estMobile(client.telephone) ? (
              <LienExterneBouton href={`sms:${client.telephone}`} taille="grand">
                SMS
              </LienExterneBouton>
            ) : (
              <span />
            )}
          </div>
        )}

        {client.actif && (
          <Carte>
            <TitreSection>Commande</TitreSection>
            {commandeSemaine && prochaine ? (
              <div className="space-y-2">
                <p>
                  Déjà une commande pour le {formaterDate(commandeSemaine.date_livraison)}.
                </p>
                <LienBouton href={`/commandes/${commandeSemaine.id}`} className="w-full">
                  Voir la commande
                </LienBouton>
              </div>
            ) : (
              <div className="space-y-2">
                {prochaine && <p className="text-stone-700">Prochaine livraison : {formaterDate(prochaine)}</p>}
                {derniere && (
                  <LienBouton
                    href={`/commandes/nouvelle?client=${id}&depuis=${derniere.id}`}
                    taille="grand"
                    className="w-full"
                  >
                    Recommander comme la dernière fois
                  </LienBouton>
                )}
                <LienBouton
                  href={`/commandes/nouvelle?client=${id}`}
                  variante={derniere ? "secondaire" : "principal"}
                  taille={derniere ? "normal" : "grand"}
                  className="w-full"
                >
                  Nouvelle commande
                </LienBouton>
              </div>
            )}
          </Carte>
        )}

        <CarteFidelite clientId={id} fidelite={fidelite} recompenses={recompenses} parametres={parametres} />

        <Carte className="space-y-3">
          <TitreSection>Livraison</TitreSection>
          <p>
            <span className="block font-semibold">{client.adresse}</span>
            {client.complement_adresse && <span className="block">{client.complement_adresse}</span>}
            <span className="block text-stone-600">
              {client.code_postal} {client.commune}
            </span>
          </p>
          {client.notes_livraison && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-amber-200">
              {client.notes_livraison}
            </p>
          )}
          {position && (
            <>
              <CarteOsm position={position} centre={position} hauteur={180} />
              <LienExterneBouton
                href={`https://www.google.com/maps/search/?api=1&query=${position.lat},${position.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full"
              >
                Ouvrir dans Google Maps
              </LienExterneBouton>
            </>
          )}
          {secteur && (
            <p className="flex items-center gap-2 text-stone-700">
              <PointCouleur couleur={secteur.couleur} /> {secteur.nom} · {libelleTournee(secteur)}
            </p>
          )}
        </Carte>

        <Carte>
          <TitreSection>Coordonnées</TitreSection>
          <dl className="space-y-2">
            <div>
              <dt className="text-sm text-stone-600">Téléphone</dt>
              <dd>{client.telephone ? formaterTelephone(client.telephone) : "—"}</dd>
            </div>
            <div>
              <dt className="text-sm text-stone-600">E-mail</dt>
              <dd className="break-all">{client.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-sm text-stone-600">Compte en ligne</dt>
              <dd>
                {compteEnLigne
                  ? "Oui : commande depuis son espace client"
                  : client.email
                    ? "Pas encore : il peut créer son compte avec cette adresse e-mail"
                    : "Non (ajoutez son e-mail pour qu'il puisse créer son compte)"}
              </dd>
            </div>
            {compteEnLigne && (
              <div>
                <dt className="text-sm text-stone-600">Notifications de livraison</dt>
                <dd>
                  {telephones > 0
                    ? `Activées sur ${telephones} téléphone${telephones > 1 ? "s" : ""}`
                    : "Pas activées (le client les active depuis son espace)"}
                  {telephones > 0 && <BoutonNotificationTest clientId={client.id} />}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-sm text-stone-600">Client depuis le</dt>
              <dd>{formaterDate(client.date_inscription, { annee: true })}</dd>
            </div>
          </dl>
        </Carte>

        <Carte>
          <TitreSection>Parrainage</TitreSection>
          <p className="text-sm text-stone-600">Parrain</p>
          <p className="mb-3">
            {parrain ? (
              <Link href={`/clients/${parrain.id}`} className="font-semibold text-marque-800 underline">
                {nomComplet(parrain)}
              </Link>
            ) : (
              "Aucun"
            )}
          </p>
          <p className="text-sm text-stone-600">Filleuls ({filleuls.length})</p>
          {filleuls.length === 0 ? (
            <p>Aucun</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {filleuls.map((f) => (
                <li key={f.id}>
                  <Link href={`/clients/${f.id}`} className="font-semibold text-marque-800 underline">
                    {nomComplet(f)}
                  </Link>{" "}
                  <span className="text-stone-600">
                    · {f.commune}
                    {!f.actif && " (inactif)"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Carte>

        <Carte>
          <TitreSection>Dernières commandes</TitreSection>
          {commandes.length === 0 ? (
            <p className="text-stone-600">Aucune commande.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {commandes.map((c) => (
                <li key={c.id}>
                  <Link href={`/commandes/${c.id}`} className="flex min-h-14 items-center gap-3 py-2">
                    <span className="w-24 shrink-0 text-sm font-semibold">{formaterDateCourte(c.date_livraison)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-stone-700">
                      {c.recompenses.length > 0 && "🎁 "}
                      {resumeLignes(c.lignes) || "Récompense seule"}
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      <span className="text-sm font-semibold">{formaterPrix(totalCommande(c.lignes))}</span>
                      <Pastille couleur={COULEUR_STATUT[c.statut]}>{LIBELLES_STATUT[c.statut]}</Pastille>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Carte>

        <Carte className="space-y-2">
          <TitreSection>Gestion</TitreSection>
          <BoutonActivite id={id} actif={client.actif} />
          <LienBouton href={`/clients/${id}/supprimer`} variante="discret" className="w-full text-red-700">
            Supprimer le client et ses données…
          </LienBouton>
        </Carte>
      </div>
    </>
  );
}
