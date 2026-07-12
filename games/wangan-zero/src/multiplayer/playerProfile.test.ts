import { describe, expect, it } from "vitest";
import { validatePlayerProfile } from "./playerProfile";

describe("validatePlayerProfile", () => {
  it("trims a valid profile and normalizes its name", () => {
    expect(validatePlayerProfile({ name: "  Night Fox  ", mainColor: "black", accentColor: "white" })).toEqual({
      ok: true,
      normalizedName: "night fox",
      reason: null,
      profile: { name: "Night Fox", mainColor: "black", accentColor: "white" }
    });
  });

  it("rejects invalid colors", () => {
    expect(validatePlayerProfile({ name: "Akira", mainColor: "purple", accentColor: "yellow" }).ok).toBe(false);
  });
});
