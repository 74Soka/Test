import crypto from "node:crypto";
import webpush from "web-push";
import { describe, expect, it, vi } from "vitest";
import { creerEnvoyeurPush } from "@/lib/notifications/envoi";
import {
  arrondiCinqMinutes,
  dureeEstimee,
  heureParis,
  heuresArrivee,
  messageDepart,
  messageProchain,
  TEMPS_PAR_ARRET_S,
} from "@/lib/notifications/messages";

describe("heures d'arrivée estimées", () => {
  it("cumule les trajets et le temps passé aux arrêts précédents", () => {
    const depart = new Date("2026-11-14T08:00:00Z");
    const arrivees = heuresArrivee(depart, [600, 300, 900], 240);
    expect(arrivees.map((d) => d.toISOString())).toEqual([
      "2026-11-14T08:10:00.000Z", // 10 min de route
      "2026-11-14T08:19:00.000Z", // + 4 min d'arrêt + 5 min de route
      "2026-11-14T08:38:00.000Z", // + 4 min + 15 min
    ]);
    expect(TEMPS_PAR_ARRET_S).toBe(240);
  });

  it("arrondit aux 5 minutes et lit l'heure de Paris", () => {
    expect(arrondiCinqMinutes(new Date("2026-11-14T08:12:29Z")).toISOString()).toBe("2026-11-14T08:10:00.000Z");
    expect(arrondiCinqMinutes(new Date("2026-11-14T08:12:31Z")).toISOString()).toBe("2026-11-14T08:15:00.000Z");
    expect(heureParis(new Date("2026-11-14T08:15:00Z"))).toBe("9 h 15");
    expect(heureParis(new Date("2026-07-14T08:00:00Z"))).toBe("10 h");
  });

  it("estime le temps de route sans service d'itinéraires", () => {
    expect(Math.round(dureeEstimee(10_000) / 60)).toBe(20); // 13 km de route à 40 km/h
  });
});

describe("textes des notifications", () => {
  it("départ de la tournée : premier arrêt, ou rang et heure", () => {
    expect(messageDepart(1, new Date("2026-11-14T08:31:00Z"))).toEqual({
      titre: "🚚 Votre livraison est en route !",
      corps: "Vous êtes le premier arrêt : arrivée estimée vers 9 h 30.",
      url: "/espace",
      tag: "livraison",
    });
    expect(messageDepart(3, new Date("2026-11-14T09:14:00Z")).corps).toBe(
      "Vous êtes le 3e arrêt de la tournée : arrivée estimée vers 10 h 15. Nous vous préviendrons quand vous serez le prochain.",
    );
  });

  it("vous êtes le prochain : durée et heure, ou « quelques minutes »", () => {
    const maintenant = new Date("2026-11-14T09:28:00Z");
    expect(messageProchain(12 * 60, maintenant)).toMatchObject({
      titre: "📍 Vous êtes le prochain !",
      corps: "Le livreur arrive dans environ 12 min (vers 10 h 40).",
    });
    expect(messageProchain(90, maintenant).corps).toBe("Le livreur arrive dans quelques minutes.");
  });
});

describe("envoi chiffré (Web Push)", () => {
  const cles = (() => {
    const k = webpush.generateVAPIDKeys();
    return { publique: k.publicKey, privee: k.privateKey };
  })();
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  const abonnement = {
    endpoint: "https://push.exemple/abonnement-1",
    p256dh: ecdh.getPublicKey().toString("base64url"),
    auth: crypto.randomBytes(16).toString("base64url"),
  };
  const message = messageProchain(600, new Date("2026-11-14T09:00:00Z"));

  it("signe, chiffre et envoie au service du téléphone", async () => {
    const fetch = vi.fn(async (..._a: unknown[]) => new Response(null, { status: 201 }));
    const envoyeur = creerEnvoyeurPush({ cles, sujet: "mailto:equipe@exemple.fr", fetch: fetch as unknown as typeof globalThis.fetch });
    expect(await envoyeur.envoyer(abonnement, message)).toBe("envoye");

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(abonnement.endpoint);
    expect(init.method).toBe("POST");
    const entetes = init.headers as Record<string, string>;
    expect(entetes.Authorization).toMatch(/^vapid t=.+, k=/);
    expect(entetes.TTL).toBe("3600");
    expect(entetes.Urgency).toBe("high");
    expect(entetes["Content-Encoding"]).toBe("aes128gcm");
    const corps = init.body as Uint8Array;
    expect(corps.byteLength).toBeGreaterThan(100);
    // Le texte n'apparaît pas en clair
    expect(Buffer.from(corps).toString()).not.toContain("prochain");
  });

  it("repère un téléphone désabonné et ne plante jamais", async () => {
    const expire = creerEnvoyeurPush({
      cles,
      sujet: "mailto:equipe@exemple.fr",
      fetch: (async () => new Response(null, { status: 410 })) as unknown as typeof globalThis.fetch,
    });
    expect(await expire.envoyer(abonnement, message)).toBe("expire");

    const panne = creerEnvoyeurPush({
      cles,
      sujet: "mailto:equipe@exemple.fr",
      fetch: (async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof globalThis.fetch,
    });
    const erreurs = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await panne.envoyer(abonnement, message)).toBe("erreur");
    expect(await panne.envoyer({ ...abonnement, p256dh: "abime" }, message)).toBe("erreur");
    erreurs.mockRestore();
  });
});

import { messageAnnonce, messageMerci, messageRappel } from "@/lib/notifications/messages";
import { alerteAvis } from "@/lib/emails/alertes";

describe("merci, annonce et rappels", () => {
  it("merci après la livraison, avec le lien vers l'avis", () => {
    expect(messageMerci("c1")).toEqual({
      titre: "🧡 Merci pour votre commande !",
      corps: "Bonne dégustation ! Un souci ou un avis sur votre panier ? Dites-le-nous en un geste.",
      url: "/espace/avis/c1",
      tag: "merci",
    });
  });

  it("annonce : quelques produits sans les quantités, et la clôture", () => {
    const m = messageAnnonce("1 kg de pommes de terre\n500 g de carottes\n1 salade\n4 pommes\n1 courge", "vendredi 12 h");
    expect(m.titre).toBe("🥕 Les paniers de la semaine sont prêts !");
    expect(m.corps).toBe("Au menu : pommes de terre, carottes, salade, pommes… Commandez avant vendredi 12 h.");
    expect(messageAnnonce(null, null).corps).toBe("Commandez dès maintenant.");
  });

  it("rappels du jeudi : midi personnalisé, soir « dernier rappel »", () => {
    expect(messageRappel("midi", "Léa", "vendredi 13 novembre à 12 h")).toMatchObject({
      titre: "🧺 Votre panier de la semaine ?",
      corps: "Bonjour Léa, n'oubliez pas de commander avant vendredi 13 novembre à 12 h.",
      url: "/espace/commander",
    });
    expect(messageRappel("midi", "", "vendredi 13 novembre à 12 h").corps).toBe(
      "N'oubliez pas de commander avant vendredi 13 novembre à 12 h.",
    );
    expect(messageRappel("soir", "Léa", "vendredi 13 novembre à 12 h").titre).toBe("⏰ Dernier rappel");
  });

  it("e-mail d'avis : étoiles, alerte si mauvaise note", () => {
    const a = alerteAvis({ client: "Léa Robert", dateLivraison: "2026-11-14", note: 2, commentaire: "Salade abîmée", lien: "https://x/clients/retours" });
    expect(a.sujet).toBe("⚠️ Avis de Léa Robert : ★★☆☆☆ (2/5)");
    expect(a.texte).toContain("« Salade abîmée »");
    expect(alerteAvis({ client: "Léa", dateLivraison: "2026-11-14", note: null, commentaire: "Merci", lien: "x" }).sujet).toBe(
      "Avis de Léa : sans note",
    );
  });
});
