import "server-only";
import { creerEnvoyeurBrevo, type Email } from "./brevo";

export { alerteAvis, alerteCommande, alerteInscription, type DetailCommande, type EvenementCommande } from "./alertes";
export { emailCommandeClient, emailCompteValide, type DetailCommandeClient } from "./clients";

/**
 * Alerte à l'équipe (EMAIL_ALERTES, plusieurs adresses séparées par des
 * virgules). Sans réglage (BREVO_API_KEY, EMAIL_EXPEDITEUR), rien n'est envoyé.
 * Une alerte ne fait jamais échouer l'action du client : en cas de panne, on
 * le note dans les journaux.
 */
export async function envoyerAlerte(email: Omit<Email, "a">): Promise<boolean> {
  const cle = process.env.BREVO_API_KEY;
  const expediteur = process.env.EMAIL_EXPEDITEUR;
  const destinataires = (process.env.EMAIL_ALERTES ?? "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  if (!cle || !expediteur || destinataires.length === 0) return false;
  try {
    await creerEnvoyeurBrevo({
      cle,
      expediteur: { email: expediteur, nom: process.env.EMAIL_NOM_EXPEDITEUR || "Frais et Français" },
      baseUrl: process.env.BREVO_URL || undefined,
    }).envoyer({ ...email, a: destinataires });
    return true;
  } catch (e) {
    console.error("Alerte e-mail :", e);
    return false;
  }
}

/**
 * E-mail à un client (commande, compte validé). Sans réglage
 * Brevo, rien n'est envoyé ; une panne ne fait jamais échouer l'action du client.
 */
export async function envoyerAuClient(destinataire: string, email: Omit<Email, "a">): Promise<boolean> {
  const cle = process.env.BREVO_API_KEY;
  const expediteur = process.env.EMAIL_EXPEDITEUR;
  if (!cle || !expediteur || !destinataire) return false;
  try {
    await creerEnvoyeurBrevo({
      cle,
      expediteur: { email: expediteur, nom: process.env.EMAIL_NOM_EXPEDITEUR || "Frais et Français" },
      baseUrl: process.env.BREVO_URL || undefined,
    }).envoyer({ ...email, a: [destinataire] });
    return true;
  } catch (e) {
    console.error("E-mail au client :", e);
    return false;
  }
}
