import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { momentDuRappel } = await import("@/lib/notifications/robot");

describe("moment des rappels (heure de Paris)", () => {
  it("12 h → midi, 19 h → soir, sinon rien, été comme hiver", () => {
    expect(momentDuRappel(new Date("2026-11-12T11:00:00Z"))).toBe("midi"); // hiver : UTC+1
    expect(momentDuRappel(new Date("2026-11-12T18:00:00Z"))).toBe("soir");
    expect(momentDuRappel(new Date("2026-06-11T10:00:00Z"))).toBe("midi"); // été : UTC+2
    expect(momentDuRappel(new Date("2026-06-11T17:00:00Z"))).toBe("soir");
    expect(momentDuRappel(new Date("2026-11-12T12:00:00Z"))).toBeNull();
    expect(momentDuRappel(new Date("2026-11-12T08:00:00Z"))).toBeNull();
  });
});
