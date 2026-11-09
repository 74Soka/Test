import webpush from "web-push";
import type { MessagePush } from "./messages";

/**
 * Envoi d'une notification web (protocole Web Push, signé avec les clés
 * VAPID). Le message est chiffré pour le téléphone ; on l'envoie nous-mêmes
 * avec fetch pour garder la main sur le délai d'attente.
 */

export type Abonnement = { endpoint: string; p256dh: string; auth: string };
export type ClesVapid = { publique: string; privee: string };
export type ResultatEnvoi = "envoye" | "expire" | "erreur";

export function creerEnvoyeurPush(options: { cles: ClesVapid; sujet: string; fetch?: typeof fetch; delai?: number }) {
  const fetcher = options.fetch ?? fetch;
  return {
    async envoyer(abonnement: Abonnement, message: MessagePush): Promise<ResultatEnvoi> {
      try {
        const details = webpush.generateRequestDetails(
          { endpoint: abonnement.endpoint, keys: { p256dh: abonnement.p256dh, auth: abonnement.auth } },
          JSON.stringify({ title: message.titre, body: message.corps, url: message.url, tag: message.tag }),
          {
            vapidDetails: { subject: options.sujet, publicKey: options.cles.publique, privateKey: options.cles.privee },
            TTL: 3600,
            urgency: "high",
          },
        );
        const res = await fetcher(details.endpoint, {
          method: details.method,
          headers: Object.fromEntries(Object.entries(details.headers).map(([k, v]) => [k, String(v)])),
          body: details.body ? new Uint8Array(details.body) : undefined,
          signal: AbortSignal.timeout(options.delai ?? 8000),
        });
        // Téléphone désabonné ou application désinstallée
        if (res.status === 404 || res.status === 410) return "expire";
        return res.ok ? "envoye" : "erreur";
      } catch (e) {
        console.error("Notification :", e);
        return "erreur";
      }
    },
  };
}
