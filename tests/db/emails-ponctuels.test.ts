import type { ClientBase } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { codeErreur, creerBaseDeTest, creerCompte, en, type BaseDeTest } from "./outils";

/** E-mails ponctuels déposés dans la base, envoyés par le site avec le jeton du robot. */

let base: BaseDeTest;
let admin: string;
let jeton: string;

const anonyme = <T>(fn: (c: ClientBase) => Promise<T>) => en(base.client, { role: "anon" }, fn);
const comme = <T>(userId: string, fn: (c: ClientBase) => Promise<T>) =>
  en(base.client, { role: "authenticated", userId }, fn);
const sql = async <T extends Record<string, unknown>>(texte: string, valeurs: unknown[] = []) =>
  (await base.client.query<T>(texte, valeurs)).rows;

async function erreur(promesse: Promise<unknown>): Promise<string | undefined> {
  try {
    await promesse;
  } catch (e) {
    return codeErreur(e);
  }
  return "aucune erreur";
}

const aEnvoyer = (j: string) =>
  anonyme(async (c) => (await c.query<{ id: string; destinataire: string }>("select * from public.emails_a_envoyer($1)", [j])).rows);
const resultat = (j: string, id: string, erreurEnvoi: string | null = null) =>
  anonyme((c) => c.query("select public.email_envoye($1, $2, $3)", [j, id, erreurEnvoi]));

beforeAll(async () => {
  base = await creerBaseDeTest();
  admin = await creerCompte(base.client, "admin");
  [{ jeton }] = await sql<{ jeton: string }>("select jeton from prive.parametres_robot");
});

afterAll(async () => {
  await base?.detruire();
});

describe("e-mails ponctuels", () => {
  it("chaque e-mail déposé est remis une seule fois au site, qui note le résultat", async () => {
    await sql(
      `insert into prive.emails_a_envoyer (destinataire, sujet, texte)
       values ('a@exemple.fr', 'Bonjour', 'Texte A'), ('b@exemple.fr', 'Bonjour', 'Texte B')`,
    );
    const lignes = await aEnvoyer(jeton);
    expect(lignes.map((l) => l.destinataire).sort()).toEqual(["a@exemple.fr", "b@exemple.fr"]);
    expect(await aEnvoyer(jeton)).toHaveLength(0);

    const [a, b] = [...lignes].sort((x, y) => x.destinataire.localeCompare(y.destinataire));
    await resultat(jeton, a.id);
    await resultat(jeton, b.id, "Le service d'e-mails a refusé l'envoi (400).");
    const etat = await sql<{ destinataire: string; envoye: boolean; erreur: string | null }>(
      "select destinataire, envoye_le is not null as envoye, erreur from prive.emails_a_envoyer order by destinataire",
    );
    expect(etat).toEqual([
      { destinataire: "a@exemple.fr", envoye: true, erreur: null },
      { destinataire: "b@exemple.fr", envoye: false, erreur: "Le service d'e-mails a refusé l'envoi (400)." },
    ]);
  });

  it("adresse, sujet et texte vérifiés", async () => {
    expect(
      await erreur(sql("insert into prive.emails_a_envoyer (destinataire, sujet, texte) values ('pas-une-adresse', 'S', 'T')")),
    ).toBe("23514");
    expect(
      await erreur(sql("insert into prive.emails_a_envoyer (destinataire, sujet, texte) values ('a@exemple.fr', ' ', 'T')")),
    ).toBe("23514");
  });

  it("protégés par le jeton secret ; la file reste fermée aux visiteurs et à l'équipe", async () => {
    const faux = "faux-jeton-".repeat(5);
    expect(await erreur(aEnvoyer(faux))).toBe("42501");
    expect(await erreur(resultat(faux, "1"))).toBe("42501");
    expect(await erreur(anonyme((c) => c.query("select * from prive.emails_a_envoyer")))).toBe("42501");
    expect(await erreur(comme(admin, (c) => c.query("select * from prive.emails_a_envoyer")))).toBe("42501");
    expect(
      await erreur(comme(admin, (c) => c.query("insert into prive.emails_a_envoyer (destinataire, sujet, texte) values ('a@b.fr', 'S', 'T')"))),
    ).toBe("42501");
    expect(await erreur(anonyme((c) => c.query("select prive.declencher_emails()")))).toBe("42501");
  });
});
