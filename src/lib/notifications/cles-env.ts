import "server-only";
import type { ClesVapid } from "./envoi";

/**
 * Clés de signature des notifications rangées dans Netlify (variables
 * VAPID_CLE_PUBLIQUE et VAPID_CLE_PRIVEE) : la clé privée n'est alors plus
 * lisible depuis la base par aucun compte. Sans elles, l'application reprend
 * les clés de la base (fonctionnement d'avant, et tests).
 */
export function clesDeNetlify(): ClesVapid | null {
  const publique = process.env.VAPID_CLE_PUBLIQUE?.trim();
  const privee = process.env.VAPID_CLE_PRIVEE?.trim();
  return publique && privee ? { publique, privee } : null;
}
