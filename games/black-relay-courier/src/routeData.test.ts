import { describe, expect, it } from "vitest";
import { routeWonderById, travelRouteFor } from "./routeData";

describe("black relay courier route data", () => {
  it("derives route distance from the flown lane instead of the destination alone", () => {
    const registryToGlass = travelRouteFor("registry-beacon", "glass-maw");
    const dustToGlass = travelRouteFor("dust-market", "glass-maw");

    expect(registryToGlass).toBeTruthy();
    expect(dustToGlass).toBeTruthy();
    expect(registryToGlass!.totalDistance).not.toBe(dustToGlass!.totalDistance);
  });

  it("keeps route wonders symmetric across both directions", () => {
    const outbound = travelRouteFor("registry-beacon", "glass-maw");
    const inbound = travelRouteFor("glass-maw", "registry-beacon");

    expect(outbound).toBeTruthy();
    expect(inbound).toBeTruthy();
    expect(outbound!.totalDistance).toBe(inbound!.totalDistance);
    expect(outbound!.wonderId).toBe("prism-shear");
    expect(inbound!.wonderId).toBe("prism-shear");
    expect(routeWonderById(outbound!.wonderId)?.label).toBe("Prism Shear");
  });

  it("stretches deep frontier and void routes well beyond local launches", () => {
    const wakeToHelix = travelRouteFor("free-wake", "helix-crown");
    const helixToMute = travelRouteFor("helix-crown", "mute-reach");

    expect(wakeToHelix).toBeTruthy();
    expect(helixToMute).toBeTruthy();
    expect(wakeToHelix!.totalDistance).toBeGreaterThan(16);
    expect(helixToMute!.totalDistance).toBeGreaterThan(40);
    expect(helixToMute!.totalDistance).toBeGreaterThan(wakeToHelix!.totalDistance);
  });
});
