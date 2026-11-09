import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creerBaseDeTest, creerCompteEnLigne, en, type BaseDeTest } from "./outils";
import { creerSecteur } from "./fabrique";

let base: BaseDeTest;
let secteur: string;
let compte: string;

beforeAll(async () => {
  base = await creerBaseDeTest();
  secteur = await creerSecteur(base.client);
  compte = await creerCompteEnLigne(base.client, "filleul@test.local");
});

afterAll(async () => {
  await base?.detruire();
});

async function client(prenom: string, nom: string, telephone: string | null, actif = true) {
  const { rows } = await base.client.query<{ id: string; code_parrainage: string | null }>(
    `insert into public.clients (prenom, nom, telephone, adresse, code_postal, commune, secteur_id, actif)
     values ($1, $2, $3, '1 rue Test', '83000', 'Toulon', $4, $5) returning id, code_parrainage`,
    [prenom, nom, telephone, secteur, actif],
  );
  return rows[0];
}

const verifier = (code: string) =>
  en(base.client, { role: "authenticated", userId: compte }, async (c) =>
    (await c.query("select public.verifier_code_parrainage($1) as ok", [code])).rows[0].ok as boolean,
  );

describe("codes de parrainage", () => {
  it("2 lettres du prénom, 2 du nom, 4 derniers chiffres du téléphone", async () => {
    expect((await client("Evan", "Capel", "+33635169616")).code_parrainage).toBe("EVCA9616");
    expect((await client("Élodie", "Cœur", "+33611111234")).code_parrainage).toBe("ELCO1234");
    expect((await client("", "Celia", "+33642011872")).code_parrainage).toBe("CELI1872");
    expect((await client("Paul", "X", "+33600009999")).code_parrainage).toBe("PAUL9999");
    expect((await client("Sans", "Téléphone", null)).code_parrainage).toBeNull();
  });

  it("deux codes identiques : le second reçoit un chiffre", async () => {
    await client("Marie", "Durand", "+33600004321");
    expect((await client("Marc", "Dupont", "+33699994321")).code_parrainage).toBe("MADU43212");
  });

  it("change avec le téléphone, mais pas pour une autre modification", async () => {
    const c = await client("Jean", "Martin", "+33600001111");
    const lire = async () =>
      (await base.client.query("select code_parrainage from public.clients where id = $1", [c.id])).rows[0]
        .code_parrainage;
    await base.client.query("update public.clients set notes_livraison = 'Portail bleu' where id = $1", [c.id]);
    expect(await lire()).toBe("JEMA1111");
    await base.client.query("update public.clients set telephone = '+33600002222' where id = $1", [c.id]);
    expect(await lire()).toBe("JEMA2222");
  });

  it("vérification à l'inscription : valide, invalide, client inactif ; sans dévoiler le parrain", async () => {
    await client("Lucie", "Petit", "+33600005555");
    await client("Ancien", "Client", "+33600006666", false);
    expect(await verifier("lupe 5555")).toBe(true);
    expect(await verifier("LUPE-5555")).toBe(true);
    expect(await verifier("LUPE 5556")).toBe(false);
    expect(await verifier("ANCL 6666")).toBe(false);
    expect(await verifier("")).toBe(false);
  });

  it("sans compte, impossible de vérifier un code", async () => {
    await expect(
      en(base.client, { role: "anon" }, (c) => c.query("select public.verifier_code_parrainage('LUPE5555')")),
    ).rejects.toThrow(/permission|Connexion/);
  });
});
