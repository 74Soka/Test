import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { exigerClient } from "@/lib/auth";
import { seDeconnecter } from "@/app/connexion/actions";
import { aujourdhui, formaterDate, formaterEcheance, lundiDeLaSemaine, majuscule } from "@/lib/domaine/dates";
import { pluriel, prochaineRecompense } from "@/lib/domaine/fidelite";
import { LIBELLES_CRENEAU } from "@/lib/domaine/secteurs";
import {
  lireCatalogue,
  lireCommandeClient,
  lireComposition,
  lireMaFidelite,
  lireMonInscription,
  lireRecompensesProposees,
  livraisonSansAvis,
} from "@/lib/espace-client";
import { GrilleTampons } from "@/components/grille-tampons";
import { Bouton, Carte, EnTetePage, LienBouton, MessageErreur, MessageInfo } from "@/components/ui";
import { clePubliqueVapid } from "@/lib/notifications";
import { BoutonAnnuler } from "./bouton-annuler";
import { ActivationNotifications } from "./notifications";
import { CompositionPaniers, RecapCommande } from "./composants";

export const metadata: Metadata = { title: "Mon espace" };

export default async function PageEspace({ searchParams }: PageProps<"/espace">) {
  const { situation, utilisateur } = await exigerClient();
  if (situation.etat === "nouveau") redirect("/espace/bienvenue");
  const sp = await searchParams;

  if (situation.etat === "en_attente" || situation.etat === "refusee") {
    const [catalogue, composition, inscription] = await Promise.all([
      lireCatalogue(),
      lireComposition(lundiDeLaSemaine(aujourdhui())),
      lireMonInscription(),
    ]);
    return (
      <>
        <EnTetePage titre={`Bonjour ${inscription?.prenom || ""}`.trim()} sousTitre={utilisateur.email ?? undefined} />
        <div className="space-y-4">
          {situation.etat === "en_attente" ? (
            <MessageInfo>
              <p className="font-semibold">Inscription reçue, merci !</p>
              <p>
                Nous vérifions que votre adresse est dans nos secteurs de livraison, puis nous activons votre compte. Vous
                pourrez alors commander directement ici.
              </p>
            </MessageInfo>
          ) : (
            <MessageErreur>Votre inscription n&apos;a pas pu être acceptée. Contactez-nous pour en savoir plus.</MessageErreur>
          )}
          <CompositionPaniers
            paniers={catalogue.filter((a) => a.categorie === "panier")}
            contenus={composition.contenus}
            sousTitre={composition.semaine ? `Semaine du ${formaterDate(composition.semaine)}` : undefined}
          />
          {situation.etat === "en_attente" && (
            <LienBouton href="/espace/bienvenue" variante="secondaire" className="w-full">
              Modifier mes informations
            </LienBouton>
          )}
          <form action={seDeconnecter}>
            <Bouton type="submit" variante="secondaire" className="w-full">
              Se déconnecter
            </Bouton>
          </form>
        </div>
      </>
    );
  }
  if (situation.etat !== "client") redirect("/");

  const date = situation.prochaine_livraison;
  const [catalogue, composition, commande, fidelite, recompenses, clePublique, sansAvis] = await Promise.all([
    lireCatalogue(),
    lireComposition(lundiDeLaSemaine(date ?? aujourdhui())),
    situation.commande_id ? lireCommandeClient(situation.commande_id) : Promise.resolve(null),
    lireMaFidelite(),
    lireRecompensesProposees(),
    clePubliqueVapid(),
    livraisonSansAvis(),
  ]);
  const suivante = prochaineRecompense(fidelite.solde, fidelite.niveau, recompenses);
  const peutCommander = situation.actif && situation.commandes_ouvertes && date !== null;

  return (
    <>
      <EnTetePage
        titre={`Bonjour ${situation.prenom || situation.nom}`}
        sousTitre={`Secteur ${situation.secteur}`}
        action={
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/logo.svg" alt="Frais et Français" width={48} height={48} className="shrink-0" />
        }
      />
      <div className="space-y-4">
        {sp.commande === "ok" && (
          <div role="status" className="rounded-2xl bg-feuille-50 px-4 py-3 font-medium text-feuille-900 ring-1 ring-feuille-600/30">
            ✅ Commande enregistrée. Merci !
          </div>
        )}
        {situation.message_clients && <MessageInfo>{situation.message_clients}</MessageInfo>}
        {sansAvis && (
          <Link
            href={`/espace/avis/${sansAvis.id}`}
            className="flex min-h-14 items-center justify-between gap-3 rounded-3xl bg-peche-50 px-4 py-3 font-semibold text-peche-900 ring-1 ring-peche-600/30"
          >
            <span>🧡 Comment était votre panier du {formaterDate(sansAvis.date_livraison)} ? Donnez votre avis</span>
            <span aria-hidden>›</span>
          </Link>
        )}
        {!situation.actif && (
          <MessageErreur>Votre compte est suspendu pour le moment : contactez-nous pour commander.</MessageErreur>
        )}

        <Carte aria-label="Prochaine livraison" className="space-y-3">
          <p className="text-sm font-bold tracking-wide text-peche-700 uppercase">Prochaine livraison</p>
          {date ? (
            <>
              <p className="font-titre text-2xl leading-tight text-marque-800">
                {majuscule(formaterDate(date))}{" "}
                <span className="font-sans text-lg font-semibold text-stone-600">({LIBELLES_CRENEAU[situation.creneau]})</span>
              </p>
              {situation.cloture && (
                <p className="text-stone-700">
                  Commandes et modifications jusqu&apos;au <strong>{formaterEcheance(situation.cloture)}</strong>.
                </p>
              )}
            </>
          ) : (
            <p className="text-stone-700">Aucune livraison n&apos;est prévue prochainement pour votre secteur.</p>
          )}

          {commande ? (
            <>
              <p className="font-semibold text-marque-800">Votre commande</p>
              <RecapCommande commande={commande} />
              {peutCommander && (
                <div className="grid gap-2">
                  <LienBouton href="/espace/commander" taille="grand" className="w-full">
                    Modifier ma commande
                  </LienBouton>
                  <BoutonAnnuler commandeId={commande.id} />
                </div>
              )}
            </>
          ) : peutCommander ? (
            <LienBouton href="/espace/commander" taille="grand" className="w-full">
              Commander
            </LienBouton>
          ) : (
            situation.actif &&
            !situation.commandes_ouvertes && (
              <p className="text-stone-700">Les commandes en ligne sont fermées pour le moment.</p>
            )
          )}
        </Carte>

        {commande && <ActivationNotifications clePublique={clePublique} variante="accueil" />}

        <CompositionPaniers
          paniers={catalogue.filter((a) => a.categorie === "panier")}
          contenus={composition.contenus}
          sousTitre={
            composition.semaine && !composition.exacte ? `Semaine du ${formaterDate(composition.semaine)}` : undefined
          }
        />

        <Carte aria-label="Ma fidélité" className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-titre text-xl text-marque-800">{pluriel(fidelite.solde, "tampon")}</p>
            <Link href="/espace/fidelite" className="text-sm font-semibold text-marque-800 underline">
              Ma carte
            </Link>
          </div>
          <GrilleTampons solde={fidelite.solde} />
          {suivante && (
            <p className="text-stone-700">
              Encore {pluriel(suivante.manque, "tampon")} pour « {suivante.recompense.nom} ».
            </p>
          )}
        </Carte>
      </div>
    </>
  );
}
