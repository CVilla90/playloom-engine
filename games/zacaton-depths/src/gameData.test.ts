import { describe, expect, it } from "vitest";
import {
  activeBreathingGas,
  assessGasPlan,
  buildDiveStats,
  CAVE_MAX_DEPTH_METERS,
  contractById,
  CONTRACTS,
  createDefaultProgress,
  DEFAULT_DIVE_SITE_ID,
  decompressionLoadRate,
  decompressionReliefRate,
  DIVE_SITES,
  diveSiteById,
  diveSiteUnlockReason,
  flashlightBatteryCapacity,
  flashlightBatteryDrainPerSecond,
  flashlightRechargeCost,
  highestMappedDepthMeters,
  installUpgrade,
  isProgressState,
  LANDMARKS,
  lifelineLengthCapacity,
  mappingCellId,
  missionLockReason,
  MISSIONS,
  recommendedDecoStopDepth,
  recommendedGasMixForDepth,
  siteLandmarks,
  TANK_DEFINITIONS,
  tankDefinition,
  tankWeight,
  upgradeRequirementReason,
  upgradesForCategory
} from "./gameData";

describe("zacaton depth progression data", () => {
  it("uses the Zacaton-inspired 339m cave depth target", () => {
    expect(CAVE_MAX_DEPTH_METERS).toBe(339);
  });

  it("starts with breath-hold air and no technical equipment", () => {
    const progress = createDefaultProgress();
    const base = buildDiveStats(progress.equipment);
    expect(base.gasLabel).toBe("breath-hold");
    expect(base.hasTank).toBe(false);
    expect(base.hasFlashlight).toBe(false);
    expect(base.hasFins).toBe(false);
    expect(base.hasDpv).toBe(false);
    expect(base.hasDepthGauge).toBe(false);
    expect(base.hasMappingSlate).toBe(false);
    expect(base.hasSonar).toBe(false);
    expect(base.hasSurveySensors).toBe(false);
    expect(base.hasLifeline).toBe(false);
    expect(base.lifelineLengthMeters).toBe(0);
    expect(base.maxTankGas).toBe(0);
    expect(base.maxLungOxygen).toBe(100);
    expect(progress.mappedDepthBands).toEqual([]);
    expect(progress.mappedSiteCells).toEqual([]);
    expect(progress.selectedDiveSiteId).toBe(DEFAULT_DIVE_SITE_ID);
    expect(progress.discoveredLandmarkIds).toEqual([]);
    expect(progress.activeContractId).toBeNull();
    expect(progress.completedContractIds).toEqual([]);
    expect(progress.tanks).toEqual([]);
    expect(progress.nextTankId).toBe(1);
    expect(progress.flashlightBattery).toBe(0);
    expect(progress.settings).toEqual({ musicEnabled: false, sfxEnabled: false });
  });

  it("makes tank, fins, light, gauge, and backup upgrades affect dive stats", () => {
    const base = buildDiveStats(createDefaultProgress().equipment);
    const upgradedEquipment = installUpgrade(
      installUpgrade(
        installUpgrade(
          installUpgrade(
            installUpgrade(
              installUpgrade(createDefaultProgress().equipment, "basic-tank"),
              "larger-tank"
            ),
            "rubber-fins"
          ),
          "better-flashlight"
        ),
        "depth-gauge"
      ),
      "backup-tank"
    );
    const upgraded = buildDiveStats(upgradedEquipment);

    expect(upgraded.maxOxygen).toBeGreaterThan(base.maxOxygen);
    expect(upgraded.swimSpeed).toBeGreaterThan(base.swimSpeed);
    expect(upgraded.lightRadius).toBeGreaterThan(base.lightRadius);
    expect(upgraded.backupOxygen).toBeGreaterThan(0);
    expect(upgraded.exactDepthGauge).toBe(true);
    expect(upgraded.hasTank).toBe(true);
    expect(upgraded.maxTankGas).toBeGreaterThan(base.maxTankGas);
  });

  it("does not lock the deepest starter survey behind equipment", () => {
    const progress = createDefaultProgress();
    const deepMission = MISSIONS[2];
    expect(deepMission).toBeDefined();
    expect(missionLockReason(progress, deepMission!)).toBeNull();
  });

  it("groups upgrades by submenu and enforces item prerequisites", () => {
    const progress = createDefaultProgress();
    expect(upgradesForCategory("gas").map((upgrade) => upgrade.id)).toContain("trimix-training");
    expect(upgradeRequirementReason(progress.equipment, "larger-tank")).toContain("single air cylinder");
    const withTank = installUpgrade(progress.equipment, "basic-tank");
    expect(upgradeRequirementReason(withTank, "larger-tank")).toBeNull();
    expect(upgradesForCategory("propulsion").map((upgrade) => upgrade.id)).toEqual([
      "rubber-fins",
      "better-fins",
      "diver-propulsion-vehicle"
    ]);
    expect(upgradeRequirementReason(progress.equipment, "diver-propulsion-vehicle")).toContain("better fins");
    expect(upgradesForCategory("instruments").map((upgrade) => upgrade.id)).toContain("mapping-slate");
    expect(upgradeRequirementReason(progress.equipment, "compact-sonar")).toContain("survey mapping slate");
    expect(upgradesForCategory("safety").map((upgrade) => upgrade.id)).toEqual(["lifeline-spool", "longer-lifeline"]);
    expect(upgradeRequirementReason(progress.equipment, "longer-lifeline")).toContain("lifeline spool");
  });

  it("validates saved progress shape", () => {
    expect(isProgressState(createDefaultProgress())).toBe(true);
    expect(isProgressState({ money: -1, activeMissionIndex: 0, completedMissionIds: [], equipment: {} })).toBe(false);
    expect(isProgressState({ ...createDefaultProgress(), mappedDepthBands: [1.5] })).toBe(false);
    expect(isProgressState({ ...createDefaultProgress(), discoveredLandmarkIds: [7] })).toBe(false);
    expect(isProgressState({ ...createDefaultProgress(), activeContractId: "missing-contract" })).toBe(false);
    expect(isProgressState({ ...createDefaultProgress(), completedContractIds: [12] })).toBe(false);
    expect(isProgressState({ ...createDefaultProgress(), selectedDiveSiteId: "missing-site" })).toBe(false);
    expect(isProgressState({ ...createDefaultProgress(), mappedSiteCells: ["missing:1"] })).toBe(false);
    expect(isProgressState({ ...createDefaultProgress(), mappedSiteCells: [mappingCellId(DEFAULT_DIVE_SITE_ID, 1)] })).toBe(true);
    expect(isProgressState({ ...createDefaultProgress(), tanks: [{ id: "bad", kind: "tank", gasMix: "air", fill: 1, dropped: false }] })).toBe(false);
    expect(isProgressState({ ...createDefaultProgress(), flashlightBattery: -1 })).toBe(false);
    expect(isProgressState({ ...createDefaultProgress(), settings: { musicEnabled: true } })).toBe(false);
  });

  it("accepts pre-discovery save files and defines in-cave landmarks", () => {
    const preDpvEquipment = {
      basicTank: false,
      largerTank: false,
      backupTank: false,
      trimixTraining: false,
      handheldLight: false,
      betterFlashlight: false,
      wideBeamFilter: false,
      rubberFins: false,
      betterFins: false,
      basicDepthGauge: false,
      depthGauge: false,
      mappingSlate: false,
      compactSonar: false,
      surveySensorKit: false,
      lifelineSpool: false,
      longerLifeline: false
    };
    const legacyProgress = {
      money: 0,
      activeMissionIndex: 0,
      completedMissionIds: [],
      equipment: preDpvEquipment
    };
    expect(isProgressState(legacyProgress)).toBe(true);
    expect(LANDMARKS.length).toBeGreaterThan(0);
    expect(
      LANDMARKS.every((landmark) => {
        const site = diveSiteById(landmark.siteId);
        return landmark.depth > 0 && landmark.depth <= site.maxDepth;
      })
    ).toBe(true);
    expect(siteLandmarks(DEFAULT_DIVE_SITE_ID).length).toBeGreaterThan(0);
  });

  it("defines reusable dive sites and site-scoped mapping cells", () => {
    const progress = createDefaultProgress();
    expect(DIVE_SITES[0]?.id).toBe(DEFAULT_DIVE_SITE_ID);
    expect(DIVE_SITES.some((site) => site.geometry === "side-passage")).toBe(true);
    expect(DIVE_SITES.some((site) => site.atmosphericWildlife)).toBe(true);
    expect(diveSiteById("missing").id).toBe(DEFAULT_DIVE_SITE_ID);
    expect(diveSiteUnlockReason(progress, DIVE_SITES[0]!)).toBeNull();
    expect(diveSiteUnlockReason(progress, DIVE_SITES[1]!)).toContain("60m");
    const mapped = { ...progress, mappedSiteCells: [mappingCellId(DEFAULT_DIVE_SITE_ID, 6)] };
    expect(highestMappedDepthMeters(mapped)).toBeGreaterThanOrEqual(60);
    expect(diveSiteUnlockReason(mapped, DIVE_SITES[1]!)).toBeNull();
  });

  it("defines optional contracts with rewards, risk hints, and lookup support", () => {
    expect(CONTRACTS.length).toBeGreaterThanOrEqual(5);
    expect(CONTRACTS.every((contract) => contract.contractor.length > 0 && contract.reward > 0)).toBe(true);
    expect(CONTRACTS.some((contract) => contract.darkEvent)).toBe(true);
    expect(contractById(CONTRACTS[0]?.id)).toBe(CONTRACTS[0]);
    expect(contractById(null)).toBeNull();
  });

  it("defines tank capacities, refill costs, and variable carried weight", () => {
    const single = tankDefinition("single");
    expect(TANK_DEFINITIONS.map((definition) => definition.kind)).toEqual(["single", "twin", "pony"]);
    expect(single.capacity).toBeGreaterThan(0);
    expect(single.refillCost).toBeLessThan(single.buyCost);
    expect(
      tankWeight({
        id: "tank-test",
        kind: "single",
        gasMix: "air",
        fill: 0,
        dropped: false
      })
    ).toBe(single.emptyWeight);
    expect(
      tankWeight({
        id: "tank-test",
        kind: "single",
        gasMix: "air",
        fill: single.capacity,
        dropped: false
      })
    ).toBe(single.fullWeight);
  });

  it("models flashlight battery capacity, drain, and recharge cost", () => {
    const progress = createDefaultProgress();
    const noLight = progress.equipment;
    const handheld = installUpgrade(noLight, "handheld-light");
    const better = installUpgrade(handheld, "better-flashlight");
    const wide = installUpgrade(better, "wide-beam-filter");

    expect(flashlightBatteryCapacity(noLight)).toBe(0);
    expect(flashlightBatteryCapacity(handheld)).toBeGreaterThan(0);
    expect(flashlightBatteryCapacity(better)).toBeGreaterThan(flashlightBatteryCapacity(handheld));
    expect(flashlightBatteryCapacity(wide)).toBeGreaterThan(flashlightBatteryCapacity(better));
    expect(flashlightBatteryDrainPerSecond(better)).toBeLessThan(flashlightBatteryDrainPerSecond(handheld));
    expect(flashlightRechargeCost(better, flashlightBatteryCapacity(better))).toBe(0);
    expect(flashlightRechargeCost(better, 0)).toBeGreaterThan(0);
  });

  it("models lifeline spool capacity and upgrade requirements", () => {
    const progress = createDefaultProgress();
    const spool = installUpgrade(progress.equipment, "lifeline-spool");
    const longer = installUpgrade(spool, "longer-lifeline");

    expect(lifelineLengthCapacity(progress.equipment)).toBe(0);
    expect(lifelineLengthCapacity(spool)).toBe(120);
    expect(lifelineLengthCapacity(longer)).toBe(260);
    expect(buildDiveStats(spool).hasLifeline).toBe(true);
    expect(buildDiveStats(longer).lifelineLengthMeters).toBeGreaterThan(buildDiveStats(spool).lifelineLengthMeters);
  });

  it("models mapping, sonar, and survey sensor instruments", () => {
    const progress = createDefaultProgress();
    const slate = installUpgrade(progress.equipment, "mapping-slate");
    const sonar = installUpgrade(slate, "compact-sonar");
    const sensors = installUpgrade(slate, "survey-sensor-kit");

    expect(buildDiveStats(slate).hasMappingSlate).toBe(true);
    expect(buildDiveStats(sonar).hasSonar).toBe(true);
    expect(buildDiveStats(sensors).hasSurveySensors).toBe(true);
    expect(buildDiveStats(sonar).sedimentResistance).toBeGreaterThan(buildDiveStats(slate).sedimentResistance);
    expect(buildDiveStats(sensors).sedimentResistance).toBeGreaterThan(buildDiveStats(slate).sedimentResistance);
  });

  it("models the DPV as the strongest low-silt propulsion upgrade", () => {
    const base = createDefaultProgress().equipment;
    const rubber = installUpgrade(base, "rubber-fins");
    const technical = installUpgrade(rubber, "better-fins");
    const dpv = installUpgrade(technical, "diver-propulsion-vehicle");

    expect(upgradeRequirementReason(technical, "diver-propulsion-vehicle")).toBeNull();
    expect(buildDiveStats(technical).hasDpv).toBe(false);
    expect(buildDiveStats(dpv).hasDpv).toBe(true);
    expect(buildDiveStats(dpv).swimSpeed).toBeGreaterThan(buildDiveStats(technical).swimSpeed);
    expect(buildDiveStats(dpv).sedimentResistance).toBeGreaterThan(buildDiveStats(technical).sedimentResistance);
  });

  it("recommends deeper gas mixes and flags risky deep air", () => {
    expect(recommendedGasMixForDepth(30)).toBe("air");
    expect(recommendedGasMixForDepth(90)).toBe("trimix");
    expect(activeBreathingGas()).toBe("air");
    expect(
      activeBreathingGas([
        { id: "air", kind: "pony", gasMix: "air", fill: 60, dropped: false },
        { id: "trimix", kind: "twin", gasMix: "trimix", fill: 180, dropped: false }
      ])
    ).toBe("trimix");

    const deepAir = assessGasPlan(110, [{ id: "air", kind: "single", gasMix: "air", fill: 120, dropped: false }]);
    const deepTrimix = assessGasPlan(110, [{ id: "mix", kind: "twin", gasMix: "trimix", fill: 120, dropped: false }]);
    expect(deepAir.isWrongGas).toBe(true);
    expect(deepAir.narcosisRisk).toBeGreaterThan(deepTrimix.narcosisRisk);
    expect(deepAir.toxicityRisk).toBeGreaterThan(0);
    expect(deepTrimix.advice).toBe("trimix ok");
  });

  it("models decompression load and stop guidance", () => {
    expect(decompressionLoadRate(18)).toBe(0);
    expect(decompressionLoadRate(80)).toBeGreaterThan(decompressionLoadRate(30));
    expect(decompressionReliefRate(6)).toBeGreaterThan(decompressionReliefRate(20));
    expect(recommendedDecoStopDepth(10)).toBe(0);
    expect(recommendedDecoStopDepth(45)).toBe(9);
    expect(recommendedDecoStopDepth(92)).toBe(18);
  });
});
