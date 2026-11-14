import { describe, expect, it } from "vitest";
import { ordonnerSelonPreference, type ArretAOrdonner } from "@/lib/tournees/preference";

// Clients sur une ligne droite vers l'est, départ à l'ouest
const depart = { lat: 43.1, lng: 5.9 };
const p = (lng: number) => ({ lat: 43.1, lng });
const arret = (id: string, lng: number | null, ordre: number | null = null): ArretAOrdonner => ({
  id: `cmd-${id}`,
  clientId: id,
  position: lng === null ? null : p(lng),
  ordre,
});

describe("ordre des tournées selon les habitudes du livreur", () => {
  it("reprend l'ordre préféré du secteur, même s'il n'est pas le plus court", () => {
    const ordre = ordonnerSelonPreference([arret("a", 5.95), arret("b", 6.0), arret("c", 6.05)], ["c", "a", "b"], depart);
    expect(ordre).toEqual(["cmd-c", "cmd-a", "cmd-b"]);
  });

  it("insère un nouveau client là où il allonge le moins la route", () => {
    const ordre = ordonnerSelonPreference(
      [arret("a", 5.95), arret("c", 6.05), arret("nouveau", 6.0)],
      ["a", "c"],
      depart,
    );
    expect(ordre).toEqual(["cmd-a", "cmd-nouveau", "cmd-c"]);
  });

  it("une tournée déjà organisée ce jour-là garde son ordre ; un client ajouté s'y insère", () => {
    const ordre = ordonnerSelonPreference(
      [arret("b", 6.0, 0), arret("a", 5.95, 1), arret("ajout", 6.2)],
      ["a", "b"],
      depart,
    );
    // L'ordre choisi par le livreur (b puis a) ne bouge pas ; le nouveau client est placé au mieux
    expect(ordre.filter((id) => id !== "cmd-ajout")).toEqual(["cmd-b", "cmd-a"]);
    expect(ordre).toHaveLength(3);
  });

  it("sans préférence : chaque client est inséré au mieux ; sans position, à la fin", () => {
    const ordre = ordonnerSelonPreference([arret("loin", 6.1), arret("sans", null), arret("pres", 5.95)], [], depart);
    expect(ordre).toEqual(["cmd-pres", "cmd-loin", "cmd-sans"]);
  });
});
