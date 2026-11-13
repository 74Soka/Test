import { describe, expect, it, vi } from "vitest";
import { alerteCommande, alerteInscription } from "@/lib/emails/alertes";
import { creerEnvoyeurBrevo, ErreurEmail } from "@/lib/emails/brevo";
import { formaterPrix } from "@/lib/domaine/argent";
import { formaterEcheance } from "@/lib/domaine/dates";

describe("envoi par Brevo", () => {
  it("envoie l'e-mail avec la clé, l'expéditeur, les destinataires et l'adresse de réponse", async () => {
    const fetch = vi.fn(async (..._a: unknown[]) => new Response(JSON.stringify({ messageId: "x" }), { status: 201 }));
    const envoyeur = creerEnvoyeurBrevo({
      cle: "cle-brevo",
      expediteur: { email: "commandes@exemple.fr", nom: "Paniers" },
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    await envoyeur.envoyer({ a: ["moi@exemple.fr", "associe@exemple.fr"], sujet: "Test", texte: "Bonjour", repondreA: "client@exemple.fr" });

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect((init.headers as Record<string, string>)["api-key"]).toBe("cle-brevo");
    expect(JSON.parse(String(init.body))).toEqual({
      sender: { email: "commandes@exemple.fr", name: "Paniers" },
      to: [{ email: "moi@exemple.fr" }, { email: "associe@exemple.fr" }],
      subject: "Test",
      textContent: "Bonjour",
      replyTo: { email: "client@exemple.fr" },
    });
  });

  it("signale un refus ou une panne, et n'envoie rien sans destinataire", async () => {
    const refus = creerEnvoyeurBrevo({
      cle: "x",
      expediteur: { email: "a@b.fr" },
      fetch: (async () => new Response("{}", { status: 401 })) as unknown as typeof globalThis.fetch,
    });
    await expect(refus.envoyer({ a: ["c@d.fr"], sujet: "s", texte: "t" })).rejects.toThrow("refusé l'envoi (401)");

    const panne = creerEnvoyeurBrevo({
      cle: "x",
      expediteur: { email: "a@b.fr" },
      fetch: (async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof globalThis.fetch,
    });
    await expect(panne.envoyer({ a: ["c@d.fr"], sujet: "s", texte: "t" })).rejects.toBeInstanceOf(ErreurEmail);

    const fetch = vi.fn();
    await creerEnvoyeurBrevo({ cle: "x", expediteur: { email: "a@b.fr" }, fetch }).envoyer({ a: [], sujet: "s", texte: "t" });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("textes des alertes", () => {
  const detail = {
    client: "Claire Martin (claire@exemple.fr)",
    dateLivraison: "2026-11-14",
    lignes: [
      { libelle: "Panier 30 €", quantite: 2, prix_unitaire_centimes: 3000 },
      { libelle: "Œufs BIO (6)", quantite: 1, prix_unitaire_centimes: 300 },
    ],
    offerts: [{ libelle: "Kakis BIO", quantite: 1, recompense: "Supplément offert" }],
    notes: "Portail ouvert",
    lien: "https://exemple.fr/commandes/123",
  };

  it("nouvelle commande : contenu, cadeaux, total, message et lien", () => {
    const { sujet, texte } = alerteCommande("nouvelle", detail);
    expect(sujet).toBe("Nouvelle commande : Claire Martin (claire@exemple.fr) · Samedi 14 novembre");
    expect(texte).toContain(`- 2 × Panier 30 € (${formaterPrix(6000)})`);
    expect(texte).toContain("- 1 × Kakis BIO (Supplément offert)");
    expect(texte).toContain(`Total à encaisser : ${formaterPrix(6300)}`);
    expect(texte).toContain("« Portail ouvert »");
    expect(texte).toContain("Voir la commande : https://exemple.fr/commandes/123");
  });

  it("annulation : sans le détail", () => {
    const { sujet, texte } = alerteCommande("annulee", detail);
    expect(sujet.startsWith("Commande annulée")).toBe(true);
    expect(texte).not.toContain("Panier 30 €");
    expect(texte).toContain("https://exemple.fr/commandes/123");
  });

  it("inscription à valider", () => {
    const { sujet, texte } = alerteInscription({
      nom: "Hélène Nouvelle",
      email: "helene@exemple.fr",
      telephone: "+33612345678",
      adresse: "4 Rue Neuve, 83000 Toulon",
      parrain: "Claire",
      lien: "https://exemple.fr/clients/inscriptions",
    });
    expect(sujet).toBe("Nouvelle inscription à valider : Hélène Nouvelle");
    expect(texte).toContain("Parrainé par : Claire");
  });
});

describe("échéance des commandes", () => {
  it("affiche la clôture à l'heure de Paris", () => {
    expect(formaterEcheance("2026-11-13T11:00:00Z")).toBe("vendredi 13 novembre à 12 h");
    expect(formaterEcheance("2026-07-10T16:30:00Z")).toBe("vendredi 10 juillet à 18 h 30");
  });
});

describe("e-mails aux clients", () => {
  it("préviennent le client que son compte est validé", async () => {
    const { emailCompteValide } = await import("@/lib/emails/clients");
    const e = emailCompteValide({ prenom: "Noé", lien: "https://fraisetfrancais.fr/espace", telephone: "06 25 50 24 87" });
    expect(e.sujet).toBe("Votre compte Frais et Français est validé");
    expect(e.texte).toMatch(/^Bonjour Noé,/);
    expect(e.texte).toContain("Votre espace : https://fraisetfrancais.fr/espace");
    expect(e.texte).toContain("06 25 50 24 87");
    expect(emailCompteValide({ prenom: "", lien: "x", telephone: "y" }).texte).toMatch(/^Bonjour,/);
  });

  it("confirment la commande avec le détail, le total et la clôture", async () => {
    const { emailCommandeClient } = await import("@/lib/emails/clients");
    const d = {
      prenom: "Emma",
      dateLivraison: "2026-11-14",
      lignes: [
        { libelle: "Panier 30 €", quantite: 1, prix_unitaire_centimes: 3000 },
        { libelle: "Œufs BIO (6)", quantite: 2, prix_unitaire_centimes: 300 },
      ],
      offerts: [{ libelle: "Confiture artisanale – figue", quantite: 1, recompense: "Cadeau" }],
      notes: "Sonner deux fois",
      cloture: "vendredi 13 novembre à 12 h",
      lien: "https://fraisetfrancais.fr/espace",
      telephone: "06 25 50 24 87",
    };
    const { sujet, texte } = emailCommandeClient("nouvelle", d);
    expect(sujet).toBe("Votre commande est confirmée · livraison Samedi 14 novembre");
    expect(texte).toContain("Bonjour Emma,");
    expect(texte).toContain("- 2 × Œufs BIO (6)");
    expect(texte).toContain("Offert grâce à votre fidélité :\n- 1 × Confiture artisanale – figue");
    expect(texte).toMatch(/Total à régler à la livraison : 36\s€/);
    expect(texte).toContain("jusqu'au vendredi 13 novembre à 12 h : https://fraisetfrancais.fr/espace");
    expect(texte).toContain("06 25 50 24 87");

    // Avec le solde du client : ajouté s'il doit, déduit s'il a un avoir
    const doit = emailCommandeClient("nouvelle", { ...d, soldeCompte: 1000 }).texte;
    expect(doit).toMatch(/Votre commande : 36\s€\nReste dû \(livraisons précédentes\) : \+ 10\s€\nTotal à régler à la livraison : 46\s€/);
    const avoir = emailCommandeClient("nouvelle", { ...d, soldeCompte: -5000 }).texte;
    expect(avoir).toMatch(/Votre avoir, déduit : − 36\s€\nTotal à régler à la livraison : 0\s€/);
    expect(avoir).toMatch(/Il vous restera 14\s€ d'avoir/);

    expect(emailCommandeClient("modifiee", d).sujet).toBe("Votre commande est modifiée · livraison Samedi 14 novembre");
    const annulee = emailCommandeClient("annulee", { ...d, prenom: "" });
    expect(annulee.sujet).toBe("Votre commande est annulée · Samedi 14 novembre");
    expect(annulee.texte).toMatch(/^Bonjour,\n\nVotre commande pour la livraison du samedi 14 novembre est bien annulée\./);
    expect(annulee.texte).not.toContain("Total");
  });
});
