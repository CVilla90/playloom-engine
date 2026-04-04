import { describe, expect, it } from "vitest";
import {
  cargoCapacityFromParts,
  cargoEntriesFromManifest,
  cargoManifestFromEntries,
  cargoUsedCapacity,
  marketQuotesFor,
  workshopPartsFor
} from "./economyData";

describe("black relay courier economy data", () => {
  it("creates cross-destination price spreads for trading", () => {
    const dustWire = marketQuotesFor("dust-market", 2).find((quote) => quote.commodity.id === "relay-wire");
    const cinderWire = marketQuotesFor("cinder-yard", 2).find((quote) => quote.commodity.id === "relay-wire");

    expect(dustWire).toBeTruthy();
    expect(cinderWire).toBeTruthy();
    expect(cinderWire!.buyPrice).toBeLessThan(dustWire!.sellPrice);
  });

  it("round-trips cargo manifests and derives hold use from installed bays", () => {
    const manifest = cargoManifestFromEntries([
      { commodityId: "amber-grain", quantity: 2 },
      { commodityId: "echo-glass", quantity: 1 }
    ]);

    expect(cargoUsedCapacity(manifest)).toBe(3);
    expect(cargoEntriesFromManifest(manifest)).toHaveLength(2);
    expect(cargoCapacityFromParts(["caravel-spine-16"])).toBe(16);
  });

  it("stages cargo and engine upgrades at different workshops", () => {
    expect(workshopPartsFor("dust-market", "cargo").length).toBeGreaterThan(0);
    expect(workshopPartsFor("dust-market", "engine")).toHaveLength(0);
    expect(workshopPartsFor("cinder-yard", "engine").length).toBeGreaterThan(0);
  });
});
