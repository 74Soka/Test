"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { demarrerTournee, enregistrerOrdre, marquerLivraison, optimiserTournee } from "./actions";
import { CarteTournee } from "@/components/carte-tournee";
import { Bouton, Carte, LienExterneBouton, MessageErreur, MessageInfo, cx } from "@/components/ui";
import { formaterPrix } from "@/lib/domaine/argent";
import { formaterTelephone } from "@/lib/domaine/telephone";
import {
  ajouterALaFile,
  ecrireFile,
  lireFile,
  viderFile,
  type ActionLivraison,
} from "@/lib/tournees/file-attente";
import { longueurTrajet } from "@/lib/tournees/geo";
import {
  cleDuTrajet,
  lireTrajetMemorise,
  memoriserTrajet,
  pointsDeLaCle,
  tempsEntreArrets,
  type ResultatTrajet,
} from "@/lib/tournees/trajet";
import type { Troncon } from "@/lib/tournees/types";
import {
  formaterDistance,
  formaterDuree,
  lienGoogleMaps,
  lienTourneeGoogleMaps,
  lienWaze,
} from "@/lib/tournees/navigation";

export type ArretTournee = {
  id: string;
  nom: string;
  adresse: string;
  complement: string | null;
  commune: string;
  telephone: string | null;
  notesLivraison: string | null;
  notesCommande: string | null;
  position: { lat: number; lng: number } | null;
  contenu: string;
  offert: string | null;
  totalCentimes: number;
  livree: boolean;
  livreeLe: string | null;
  /** Payée à la livraison (null : pas encore livrée) */
  payee: boolean | null;
  /** Ce que le client devait déjà (+) ou son avoir (−), sans cette commande */
  duAvantCentimes: number;
};

type EtatLivraison = { livree: boolean; heure: string | null; payee: boolean | null };

const HEURE = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });

/** Montant à encaisser : le panier, plus ce que le client devait déjà (ou moins son avoir). */
function AEncaisser({ total, duAvant }: { total: number; duAvant: number }) {
  if (duAvant === 0) return <p className="mt-1 text-sm text-stone-600">À encaisser : {formaterPrix(total)}</p>;
  const aPayer = Math.max(0, total + duAvant);
  return (
    <p className="mt-1 text-sm">
      <span className="font-semibold text-amber-900">À encaisser : {formaterPrix(aPayer)}</span>
      <span className="block text-stone-600">
        {formaterPrix(total)} {duAvant > 0 ? `+ ${formaterPrix(duAvant)} dus (livraisons précédentes)` : `− ${formaterPrix(-duAvant)} d'avoir`}
      </span>
    </p>
  );
}

const route = (t: Troncon) => `${formaterDuree(t.dureeSecondes)} · ${formaterDistance(t.distanceMetres)}`;

export function Tournee({
  date,
  secteur,
  arrets,
  estAdmin,
  demarreeLe,
}: {
  date: string;
  secteur: { id: string; nom: string; couleur: string; depart: { lat: number; lng: number; adresse: string } };
  arrets: ArretTournee[];
  estAdmin: boolean;
  /** Heure de départ de la tournée (clients prévenus), ou null */
  demarreeLe: string | null;
}) {
  const [depart, setDepart] = useState<{ le: string; prevenus?: number; clients?: number } | null>(
    demarreeLe ? { le: demarreeLe } : null,
  );
  const parId = useMemo(() => new Map(arrets.map((a) => [a.id, a])), [arrets]);
  const [ordre, setOrdre] = useState(() => arrets.map((a) => a.id));
  const [etats, setEtats] = useState<Record<string, EtatLivraison>>(() =>
    Object.fromEntries(arrets.map((a) => [a.id, { livree: a.livree, heure: a.livreeLe, payee: a.payee }])),
  );
  const [file, setFile] = useState<ActionLivraison[]>([]);
  const [reorganiser, setReorganiser] = useState(false);
  const [infos, setInfos] = useState<{ texte: string; avertissement?: string } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const envoiEnCours = useRef(false);
  const [itineraire, setItineraire] = useState<({ cle: string } & ResultatTrajet) | null>(null);
  // Arrêt qui vient d'être livré : on y propose de partir tout de suite vers le suivant
  const [justeLivre, setJusteLivre] = useState<string | null>(null);

  // Envoie les appuis en attente ; s'arrête à la première coupure réseau
  const vider = useCallback(async (aEnvoyer: ActionLivraison[]) => {
    if (envoiEnCours.current || aEnvoyer.length === 0) return;
    envoiEnCours.current = true;
    try {
      const { restantes, refus } = await viderFile(aEnvoyer, (a) =>
        marquerLivraison(a.commandeId, a.livree, a.horodatage, a.payee ?? true),
      );
      // Des appuis ont pu arriver pendant l'envoi : on garde ceux qui ne sont pas partis
      setFile((actuelle) => {
        const envoyees = aEnvoyer.filter((a) => !restantes.includes(a));
        const suite = actuelle.filter((a) => !envoyees.includes(a));
        ecrireFile(window.localStorage, suite);
        return suite;
      });
      if (refus.length) setErreur(refus.map((r) => r.erreur).join(" "));
    } finally {
      envoiEnCours.current = false;
    }
  }, []);

  // Au chargement (après le premier affichage) : on reprend les appuis restés dans le téléphone
  useEffect(() => {
    const minuteur = window.setTimeout(() => {
      const enAttente = lireFile(window.localStorage).filter((a) => parId.has(a.commandeId));
      if (enAttente.length === 0) return;
      setFile(enAttente);
      setEtats((e) => {
        const copie = { ...e };
        for (const a of enAttente)
          copie[a.commandeId] = {
            livree: a.livree,
            heure: a.livree ? a.horodatage : null,
            payee: a.livree ? (a.payee ?? true) : null,
          };
        return copie;
      });
      void vider(enAttente);
    }, 0);
    return () => window.clearTimeout(minuteur);
  }, [parId, vider]);

  // Retour du réseau, et nouvel essai régulier tant qu'il reste des appuis
  useEffect(() => {
    if (file.length === 0) return;
    const essayer = () => void vider(file);
    window.addEventListener("online", essayer);
    const minuteur = window.setInterval(essayer, 30_000);
    return () => {
      window.removeEventListener("online", essayer);
      window.clearInterval(minuteur);
    };
  }, [file, vider]);

  /** Livré et payé, livré sans paiement, ou annulation de la livraison (payee null). */
  function basculer(id: string, payee: boolean | null) {
    const livree = payee !== null;
    const action: ActionLivraison = {
      commandeId: id,
      livree,
      horodatage: new Date().toISOString(),
      ...(livree ? { payee } : {}),
    };
    setEtats((e) => ({ ...e, [id]: { livree, heure: livree ? action.horodatage : null, payee } }));
    setJusteLivre(livree ? id : null);
    const suite = ajouterALaFile(file, action);
    setFile(suite);
    ecrireFile(window.localStorage, suite);
    void vider(suite);
  }

  function deplacer(index: number, sens: -1 | 1) {
    const cible = index + sens;
    if (cible < 0 || cible >= ordre.length) return;
    const copie = [...ordre];
    [copie[index], copie[cible]] = [copie[cible], copie[index]];
    setOrdre(copie);
  }

  const arretsOrdonnes = ordre.map((id) => parId.get(id)!).filter(Boolean);
  const restants = arretsOrdonnes.filter((a) => !etats[a.id]?.livree);
  const prochain = restants[0];
  const nbLivres = arretsOrdonnes.length - restants.length;
  const positions = arretsOrdonnes.flatMap((a) => (a.position ? [a.position] : []));
  const distanceEstimee = longueurTrajet([secteur.depart, ...positions, secteur.depart]);

  // Itinéraire par les routes : départ → arrêts dans l'ordre → retour
  const cleTrajet = positions.length ? cleDuTrajet([secteur.depart, ...positions, secteur.depart]) : null;
  const trajet = itineraire && itineraire.cle === cleTrajet ? itineraire.trajet : null;
  const temps = trajet ? tempsEntreArrets(trajet, positions.length) : null;
  const tempsParArret = new Map<string, Troncon>();
  if (temps) arretsOrdonnes.filter((a) => a.position).forEach((a, j) => tempsParArret.set(a.id, temps.arrivees[j]));
  const resteSecondes = temps
    ? restants.reduce((t, a) => t + (tempsParArret.get(a.id)?.dureeSecondes ?? 0), 0) + temps.retour.dureeSecondes
    : null;
  const departRestant =
    [...arretsOrdonnes].reverse().find((a) => etats[a.id]?.livree && a.position)?.position ?? secteur.depart;
  const lienComplet = lienTourneeGoogleMaps(
    departRestant,
    restants.flatMap((a) => (a.position ? [a.position] : [])),
  );

  // Calculé quand l'ordre change (pas pendant « Réorganiser ») ; le dernier tracé
  // reste dans le téléphone pour les zones sans réseau
  useEffect(() => {
    if (!cleTrajet || reorganiser) return;
    let annule = false;
    const minuteur = window.setTimeout(async () => {
      const memorise = lireTrajetMemorise(window.localStorage, cleTrajet);
      if (memorise) return setItineraire({ cle: cleTrajet, trajet: memorise });
      try {
        const res = await fetch("/api/trajet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ points: pointsDeLaCle(cleTrajet) }),
        });
        if (!res.ok || annule) return;
        const r = (await res.json()) as ResultatTrajet;
        if (annule) return;
        setItineraire({ cle: cleTrajet, ...r });
        if (r.trajet) memoriserTrajet(window.localStorage, cleTrajet, r.trajet);
      } catch {
        // Hors connexion : lignes droites en attendant
      }
    }, 300);
    return () => {
      annule = true;
      window.clearTimeout(minuteur);
    };
  }, [cleTrajet, reorganiser]);

  function defilerVers(id: string) {
    document.getElementById(`arret-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="space-y-4">
      {file.length > 0 && (
        <MessageInfo>
          📶 Hors connexion ? {file.length} livraison{file.length > 1 ? "s" : ""} en attente d&apos;envoi : elles
          partiront dès que le réseau revient. Gardez cette page ouverte.
        </MessageInfo>
      )}
      {erreur && <MessageErreur>{erreur}</MessageErreur>}

      <Carte className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-lg font-bold">
            {nbLivres} / {arretsOrdonnes.length} livré{nbLivres > 1 ? "s" : ""}
          </p>
          {trajet ? (
            <p className="text-right text-sm text-stone-600">
              {formaterDistance(trajet.distanceMetres)} · {formaterDuree(trajet.dureeSecondes)} de route
            </p>
          ) : (
            positions.length > 0 && (
              <p className="text-sm text-stone-600">≈ {formaterDistance(distanceEstimee)} à vol d&apos;oiseau</p>
            )
          )}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-stone-200">
          <div
            className="h-full bg-feuille-600 transition-all"
            style={{ width: `${arretsOrdonnes.length ? (100 * nbLivres) / arretsOrdonnes.length : 0}%` }}
          />
        </div>
        {nbLivres > 0 && restants.length > 0 && resteSecondes !== null && (
          <p className="text-sm text-stone-600">Reste ≈ {formaterDuree(resteSecondes)} de route, retour compris.</p>
        )}
        {itineraire?.cle === cleTrajet && !itineraire?.trajet && itineraire?.raison && (
          <p className="text-sm text-amber-800">Itinéraire par les routes indisponible : {itineraire.raison}</p>
        )}

        {depart ? (
          <p role="status" className="text-sm font-medium text-feuille-800">
            🚚 Tournée démarrée à {HEURE.format(new Date(depart.le))}
            {depart.clients !== undefined &&
              ` · ${depart.prevenus} client${depart.prevenus === 1 ? "" : "s"} sur ${depart.clients} prévenu${depart.prevenus === 1 ? "" : "s"} par notification`}
            . Le client suivant est prévenu à chaque « Livré ».
          </p>
        ) : (
          restants.length > 0 && (
            <div className="space-y-1">
              <Bouton
                taille="grand"
                className="w-full"
                disabled={enCours}
                onClick={() =>
                  demarrer(async () => {
                    setErreur(null);
                    const r = await demarrerTournee(date, secteur.id);
                    if (!r.ok) return setErreur(r.erreur);
                    setDepart({ le: r.demarreeLe, prevenus: r.prevenus, clients: r.clients });
                  })
                }
              >
                {enCours ? "…" : "🚚 Démarrer la tournée"}
              </Bouton>
              <p className="text-center text-sm text-stone-600">
                Les clients qui ont activé les notifications reçoivent leur heure d&apos;arrivée estimée.
              </p>
            </div>
          )
        )}

        {prochain ? (
          <div className="rounded-2xl bg-marque-50 p-3 ring-1 ring-marque-100">
            <p className="text-sm text-stone-600">
              Prochain arrêt
              {tempsParArret.has(prochain.id) && ` · 🚗 ${route(tempsParArret.get(prochain.id)!)}`}
            </p>
            <button type="button" className="text-left" onClick={() => defilerVers(prochain.id)}>
              <span className="block text-lg font-bold">
                {ordre.indexOf(prochain.id) + 1}. {prochain.nom}
              </span>
              <span className="block text-stone-700">
                {prochain.adresse}, {prochain.commune}
              </span>
            </button>
            {prochain.position && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <LienExterneBouton href={lienWaze(prochain.position)} target="_blank" rel="noopener noreferrer" variante="principal">
                  Waze
                </LienExterneBouton>
                <LienExterneBouton href={lienGoogleMaps(prochain.position)} target="_blank" rel="noopener noreferrer" variante="principal">
                  Google Maps
                </LienExterneBouton>
              </div>
            )}
          </div>
        ) : (
          arretsOrdonnes.length > 0 && <p className="font-semibold text-feuille-700">🎉 Tournée terminée !</p>
        )}

        <div className="flex flex-wrap gap-2">
          <Bouton
            variante="secondaire"
            taille="petit"
            disabled={enCours || reorganiser}
            onClick={() =>
              demarrer(async () => {
                setErreur(null);
                const r = await optimiserTournee(date, secteur.id);
                if (!r.ok) return setErreur(r.erreur);
                setOrdre(r.ordre.filter((id) => parId.has(id)));
                setInfos({
                  texte:
                    r.methode === "openrouteservice"
                      ? `${r.optimal ? "Meilleur ordre possible" : "Ordre optimisé"} par les routes${r.distanceMetres ? ` : ${formaterDistance(r.distanceMetres)}` : ""}${r.dureeSecondes ? `, ${formaterDuree(r.dureeSecondes)} de route` : ""}.`
                      : "Ordre optimisé à vol d'oiseau (sans tenir compte des routes).",
                  avertissement: r.avertissement,
                });
              })
            }
          >
            {enCours && !reorganiser ? "Calcul…" : "Optimiser l'ordre"}
          </Bouton>
          {reorganiser ? (
            <Bouton
              taille="petit"
              disabled={enCours}
              onClick={() =>
                demarrer(async () => {
                  const r = await enregistrerOrdre(ordre);
                  if (!r.ok) return setErreur(r.erreur);
                  setReorganiser(false);
                  setInfos({ texte: "Ordre enregistré." });
                })
              }
            >
              Enregistrer l&apos;ordre
            </Bouton>
          ) : (
            <Bouton variante="secondaire" taille="petit" onClick={() => setReorganiser(true)}>
              Réorganiser
            </Bouton>
          )}
          {lienComplet && (
            <LienExterneBouton href={lienComplet.url} target="_blank" rel="noopener noreferrer" taille="petit">
              {lienComplet.arrets < restants.length ? `Google Maps (${lienComplet.arrets} prochains)` : "Tout dans Google Maps"}
            </LienExterneBouton>
          )}
        </div>
        {infos && (
          <p className="text-sm text-stone-700">
            {infos.texte} {infos.avertissement && <span className="text-amber-800">{infos.avertissement}</span>}
          </p>
        )}
      </Carte>

      {positions.length > 0 && (
        <CarteTournee
          depart={secteur.depart}
          couleur={secteur.couleur}
          onChoisir={defilerVers}
          trace={reorganiser ? null : trajet?.geometrie}
          points={arretsOrdonnes.flatMap((a, i) =>
            a.position ? [{ id: a.id, ...a.position, numero: i + 1, livre: Boolean(etats[a.id]?.livree) }] : [],
          )}
        />
      )}
      <p className="text-sm text-stone-600">Départ : {secteur.depart.adresse}</p>

      <ol className="space-y-3">
        {arretsOrdonnes.map((a, i) => {
          const etat = etats[a.id];
          return (
            <li key={a.id} id={`arret-${a.id}`}>
              <section
                aria-label={`Arrêt ${i + 1} : ${a.nom}`}
                className={cx(
                  "rounded-3xl bg-white p-4 shadow-[0_2px_8px_rgb(53_3_122/0.06)] ring-1",
                  etat?.livree ? "ring-feuille-600/40" : "ring-marque-100",
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-full font-bold text-white"
                    style={{ backgroundColor: etat?.livree ? "#15803d" : secteur.couleur }}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-bold">{a.nom}</p>
                    <p className="text-stone-700">
                      {a.adresse}
                      {a.complement && `, ${a.complement}`}, {a.commune}
                    </p>
                  </div>
                  {reorganiser && (
                    <div className="flex flex-col gap-1">
                      <Bouton variante="secondaire" taille="petit" aria-label={`Monter ${a.nom}`} disabled={i === 0} onClick={() => deplacer(i, -1)}>
                        ↑
                      </Bouton>
                      <Bouton
                        variante="secondaire"
                        taille="petit"
                        aria-label={`Descendre ${a.nom}`}
                        disabled={i === arretsOrdonnes.length - 1}
                        onClick={() => deplacer(i, 1)}
                      >
                        ↓
                      </Bouton>
                    </div>
                  )}
                </div>

                {!reorganiser && tempsParArret.has(a.id) && (
                  <p className="mt-1 text-sm text-stone-600">
                    🚗 {route(tempsParArret.get(a.id)!)} depuis {a.id === arretsOrdonnes.find((x) => x.position)?.id ? "le départ" : "l'arrêt précédent"}
                  </p>
                )}
                {a.notesLivraison && (
                  <p className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 font-medium text-amber-900 ring-1 ring-amber-200">
                    {a.notesLivraison}
                  </p>
                )}
                <p className="mt-2">{a.contenu}</p>
                {a.offert && <p className="font-medium text-peche-700">🎁 À remettre : {a.offert}</p>}
                {a.notesCommande && <p className="text-sm text-amber-800">« {a.notesCommande} »</p>}
                <AEncaisser total={a.totalCentimes} duAvant={a.duAvantCentimes} />

                {!reorganiser && (
                  <>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {a.telephone ? (
                        <LienExterneBouton href={`tel:${a.telephone}`} taille="petit" aria-label={`Appeler ${a.nom} au ${formaterTelephone(a.telephone)}`}>
                          Appeler
                        </LienExterneBouton>
                      ) : (
                        <span />
                      )}
                      {a.position ? (
                        <>
                          <LienExterneBouton href={lienGoogleMaps(a.position)} target="_blank" rel="noopener noreferrer" taille="petit">
                            Maps
                          </LienExterneBouton>
                          <LienExterneBouton href={lienWaze(a.position)} target="_blank" rel="noopener noreferrer" taille="petit">
                            Waze
                          </LienExterneBouton>
                        </>
                      ) : (
                        <span className="col-span-2 self-center text-sm text-stone-500">Position inconnue</span>
                      )}
                    </div>
                    {etat?.livree ? (
                      <Bouton taille="grand" variante="secondaire" className="mt-2 w-full" onClick={() => basculer(a.id, null)}>
                        {`✓ ${etat.payee === false ? "Livré · non payé" : "Livré et payé"}${etat.heure ? ` à ${HEURE.format(new Date(etat.heure))}` : ""} · annuler`}
                      </Bouton>
                    ) : (
                      <div className="mt-2 grid grid-cols-[2fr_1fr] gap-2">
                        <Bouton taille="grand" className="w-full" onClick={() => basculer(a.id, true)}>
                          Livré et payé
                        </Bouton>
                        <Bouton taille="grand" variante="secondaire" className="w-full" onClick={() => basculer(a.id, false)}>
                          Livré
                        </Bouton>
                      </div>
                    )}
                    {etat?.livree && etat.payee === false && (
                      <p className="mt-1 text-sm font-medium text-amber-800">
                        {formaterPrix(a.duAvantCentimes + a.totalCentimes)} à encaisser à la prochaine livraison.
                      </p>
                    )}
                    {etat?.livree && a.id === justeLivre && prochain && (
                      <div role="group" aria-label="Arrêt suivant" className="mt-2 rounded-xl bg-marque-50 p-3 ring-1 ring-marque-600/30">
                        <p className="text-sm text-stone-600">
                          Ensuite
                          {tempsParArret.has(prochain.id) && ` · 🚗 ${route(tempsParArret.get(prochain.id)!)}`}
                        </p>
                        <p className="font-bold">
                          {ordre.indexOf(prochain.id) + 1}. {prochain.nom}
                        </p>
                        {prochain.position ? (
                          <div className="mt-2 space-y-2">
                            <LienExterneBouton
                              href={lienWaze(prochain.position)}
                              target="_blank"
                              rel="noopener noreferrer"
                              variante="principal"
                              className="w-full"
                            >
                              Y aller avec Waze
                            </LienExterneBouton>
                            <a
                              href={lienGoogleMaps(prochain.position)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block text-center text-sm font-semibold text-marque-800 underline"
                            >
                              ou avec Google Maps
                            </a>
                          </div>
                        ) : (
                          <p className="text-sm text-stone-500">Position inconnue</p>
                        )}
                      </div>
                    )}
                    {estAdmin && (
                      <Link href={`/commandes/${a.id}`} className="mt-2 block text-center text-sm font-semibold text-marque-800 underline">
                        Voir la commande
                      </Link>
                    )}
                  </>
                )}
              </section>
            </li>
          );
        })}
      </ol>
      {temps && !reorganiser && (
        <p className="text-sm text-stone-600">🏠 Retour au départ : {route(temps.retour)}</p>
      )}
    </div>
  );
}
