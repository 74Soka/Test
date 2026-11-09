"use client";

import { useCallback, useEffect, useState } from "react";
import { enregistrerMonAbonnement, supprimerMonAbonnement } from "./actions";
import { Bouton, Carte, MessageErreur, TitreSection } from "@/components/ui";

type Etat = "chargement" | "non-supporte" | "ios-installer" | "refuse" | "inactif" | "actif";

function versOctets(base64: string): Uint8Array<ArrayBuffer> {
  const remplissage = "=".repeat((4 - (base64.length % 4)) % 4);
  const brut = window.atob((base64 + remplissage).replace(/-/g, "+").replace(/_/g, "/"));
  const octets = new Uint8Array(new ArrayBuffer(brut.length));
  for (let i = 0; i < brut.length; i++) octets[i] = brut.charCodeAt(i);
  return octets;
}

function estIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function estInstallee() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function nomAppareil() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  return "Ordinateur";
}

async function enregistrement() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

/**
 * Notifications de livraison : « votre livraison est en route », « vous êtes
 * le prochain ». Sur iPhone, il faut d'abord ajouter l'application à l'écran
 * d'accueil (iOS 16.4 ou plus récent).
 */
export function ActivationNotifications({
  clePublique,
  variante,
}: {
  clePublique: string | null;
  /** accueil : invitation discrète, cachée une fois activées ; compte : réglage complet */
  variante: "accueil" | "compte";
}) {
  const [etat, setEtat] = useState<Etat>("chargement");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const verifier = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      return setEtat(estIos() && !estInstallee() ? "ios-installer" : "non-supporte");
    }
    if (Notification.permission === "denied") return setEtat("refuse");
    try {
      const reg = await enregistrement();
      setEtat((await reg.pushManager.getSubscription()) ? "actif" : "inactif");
    } catch {
      setEtat("non-supporte");
    }
  }, []);

  useEffect(() => {
    const minuteur = window.setTimeout(() => void verifier(), 0);
    return () => window.clearTimeout(minuteur);
  }, [verifier]);

  async function activer() {
    if (!clePublique) return;
    setErreur(null);
    setEnCours(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setEtat(permission === "denied" ? "refuse" : "inactif");
      const reg = await enregistrement();
      await navigator.serviceWorker.ready;
      const abonnement =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: versOctets(clePublique) }));
      const r = await enregistrerMonAbonnement(abonnement.toJSON(), nomAppareil());
      if (!r.ok) return setErreur(r.erreur);
      setEtat("actif");
    } catch (e) {
      console.error(e);
      setErreur("Les notifications n'ont pas pu être activées sur ce téléphone.");
    } finally {
      setEnCours(false);
    }
  }

  async function desactiver() {
    setEnCours(true);
    try {
      const reg = await enregistrement();
      const abonnement = await reg.pushManager.getSubscription();
      if (abonnement) {
        await supprimerMonAbonnement(abonnement.endpoint);
        await abonnement.unsubscribe();
      }
      setEtat("inactif");
    } finally {
      setEnCours(false);
    }
  }

  if (variante === "accueil" && (etat !== "inactif" && etat !== "ios-installer")) return null;
  if (variante === "accueil" && !clePublique) return null;

  return (
    <Carte aria-label="Notifications de livraison" className="space-y-3">
      <TitreSection>🔔 Prévenu le jour de la livraison</TitreSection>
      <p className="text-stone-700">
        Une notification quand le livreur part, avec l&apos;heure d&apos;arrivée estimée, puis quand vous êtes le
        prochain.
      </p>
      {erreur && <MessageErreur>{erreur}</MessageErreur>}

      {!clePublique ? (
        <p className="text-sm text-stone-600">Les notifications seront disponibles très bientôt.</p>
      ) : etat === "ios-installer" ? (
        <ol className="list-inside list-decimal space-y-1 rounded-2xl bg-marque-50 p-3 text-stone-800">
          <li>
            Dans Safari, touchez <strong>Partager</strong> (le carré avec une flèche).
          </li>
          <li>
            Choisissez <strong>Sur l&apos;écran d&apos;accueil</strong>.
          </li>
          <li>Ouvrez l&apos;application depuis sa nouvelle icône, puis revenez ici pour activer les notifications.</li>
        </ol>
      ) : etat === "non-supporte" ? (
        <p className="text-sm text-stone-600">Ce navigateur ne permet pas les notifications.</p>
      ) : etat === "refuse" ? (
        <p className="text-sm text-stone-600">
          Les notifications sont bloquées pour ce site : autorisez-les dans les réglages du téléphone, puis revenez ici.
        </p>
      ) : etat === "actif" ? (
        <div className="space-y-2">
          <p role="status" className="font-medium text-feuille-700">
            ✓ Activées sur ce téléphone
          </p>
          <Bouton variante="secondaire" taille="petit" disabled={enCours} onClick={desactiver}>
            Désactiver
          </Bouton>
        </div>
      ) : etat === "inactif" ? (
        <Bouton className="w-full" disabled={enCours} onClick={activer}>
          {enCours ? "Activation…" : "Activer les notifications"}
        </Bouton>
      ) : null}
    </Carte>
  );
}
