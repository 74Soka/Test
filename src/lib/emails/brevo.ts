/**
 * Envoi d'e-mails par Brevo (offre gratuite : environ 300 e-mails par jour).
 * Isolé ici : changer de fournisseur revient à réécrire ce fichier.
 */

export const URL_BREVO = "https://api.brevo.com";

export type Email = {
  a: string[];
  sujet: string;
  texte: string;
  /** Adresse de réponse (ex. le client qui vient de commander) */
  repondreA?: string;
};

export class ErreurEmail extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "ErreurEmail";
  }
}

export function creerEnvoyeurBrevo(options: {
  cle: string;
  expediteur: { email: string; nom?: string };
  baseUrl?: string;
  fetch?: typeof fetch;
  delai?: number;
}) {
  const baseUrl = (options.baseUrl ?? URL_BREVO).replace(/\/+$/, "");
  const fetcher = options.fetch ?? fetch;

  return {
    async envoyer(email: Email): Promise<void> {
      if (email.a.length === 0) return;
      let res: Response;
      try {
        res = await fetcher(`${baseUrl}/v3/smtp/email`, {
          method: "POST",
          headers: { "api-key": options.cle, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            sender: { email: options.expediteur.email, name: options.expediteur.nom ?? "Paniers" },
            to: email.a.map((adresse) => ({ email: adresse })),
            subject: email.sujet,
            textContent: email.texte,
            ...(email.repondreA ? { replyTo: { email: email.repondreA } } : {}),
          }),
          signal: AbortSignal.timeout(options.delai ?? 8000),
        });
      } catch (e) {
        throw new ErreurEmail("Le service d'e-mails ne répond pas.", e);
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new ErreurEmail(`Le service d'e-mails a refusé l'envoi (${res.status}).`, detail);
      }
    },
  };
}
