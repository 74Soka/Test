import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { momentDuRappel } = await import("@/lib/notifications/robot");

describe("moment des rappels (heure de Paris)", () => {
  it("12 h → midi, 18 h → soir, sinon rien, été comme hiver", () => {
    expect(momentDuRappel(new Date("2026-11-12T11:00:00Z"))).toBe("midi"); // hiver : UTC+1
    expect(momentDuRappel(new Date("2026-11-12T17:00:00Z"))).toBe("soir");
    expect(momentDuRappel(new Date("2026-11-12T18:00:00Z"))).toBeNull(); // 19 h : plus de rappel
    expect(momentDuRappel(new Date("2026-06-11T10:00:00Z"))).toBe("midi"); // été : UTC+2
    expect(momentDuRappel(new Date("2026-06-11T16:00:00Z"))).toBe("soir");
    expect(momentDuRappel(new Date("2026-11-12T12:00:00Z"))).toBeNull();
    expect(momentDuRappel(new Date("2026-11-12T08:00:00Z"))).toBeNull();
  });
});

describe("clés de signature rangées dans Netlify", () => {
  it("sont utilisées si les deux variables sont présentes, sinon la base prend le relais", async () => {
    const { clesDeNetlify } = await import("@/lib/notifications/cles-env");
    const avant = { pub: process.env.VAPID_CLE_PUBLIQUE, priv: process.env.VAPID_CLE_PRIVEE };
    process.env.VAPID_CLE_PUBLIQUE = " BPub ";
    delete process.env.VAPID_CLE_PRIVEE;
    expect(clesDeNetlify()).toBeNull();
    process.env.VAPID_CLE_PRIVEE = "priv";
    expect(clesDeNetlify()).toEqual({ publique: "BPub", privee: "priv" });
    if (avant.pub === undefined) delete process.env.VAPID_CLE_PUBLIQUE;
    else process.env.VAPID_CLE_PUBLIQUE = avant.pub;
    if (avant.priv === undefined) delete process.env.VAPID_CLE_PRIVEE;
    else process.env.VAPID_CLE_PRIVEE = avant.priv;
  });
});
