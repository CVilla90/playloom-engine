export type DoctrineChoice = "broadcast" | "archive" | "suppress";
export type FragmentQuality = "clean" | "partial" | "corrupted";

export interface GameManifest {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly saveKey: string;
}

export interface ShipStats {
  fuel: number;
  hull: number;
  focus: number;
  trace: number;
  truth: number;
}

export interface FragmentRecord {
  id: string;
  title: string;
  body: string;
  source: string;
  quality: FragmentQuality;
  doctrine: DoctrineChoice | null;
}

export interface RunState {
  version: 1;
  runSeed: number;
  chapterIndex: number;
  stats: ShipStats;
  doctrineCounts: Record<DoctrineChoice, number>;
  route: string[];
  fragments: FragmentRecord[];
  logEntries: string[];
  lastStatus: string;
}

export interface LocationRisk {
  fuel: number;
  hull: number;
  focus: number;
  trace: number;
  drift: number;
}

export interface LocationDefinition {
  id: string;
  title: string;
  region: string;
  shortLabel: string;
  summary: string;
  arrivalText: string;
  fragmentTitle: string;
  fragmentBody: string;
  truthReward: number;
  risk: LocationRisk;
  targets: readonly [number, number, number];
}

export interface ChapterDefinition {
  id: string;
  label: string;
  briefing: string;
  locations: readonly LocationDefinition[];
}

export interface DoctrineOption {
  id: DoctrineChoice;
  label: string;
  summary: string;
  traceDelta: number;
  focusDelta: number;
}

export interface EndingSummary {
  id: string;
  title: string;
  body: string;
  accent: string;
}

export const GAME_MANIFEST: GameManifest = {
  id: "quiet-collapse",
  name: "The Quiet Collapse",
  width: 1360,
  height: 768,
  fps: 60,
  saveKey: "quiet-collapse.save.v1"
};

export const SHIP_METER_KEYS = ["fuel", "hull", "focus", "trace"] as const;
export type ShipMeterKey = (typeof SHIP_METER_KEYS)[number];

export const SHIP_METER_LABELS: Record<ShipMeterKey, string> = {
  fuel: "Fuel",
  hull: "Hull",
  focus: "Focus",
  trace: "Trace"
};

export const SHIP_METER_COLORS: Record<ShipMeterKey, string> = {
  fuel: "#87d8ff",
  hull: "#f2a46f",
  focus: "#b1f5c0",
  trace: "#ff7f98"
};

export const CHANNEL_LABELS = ["Mass", "Lens", "Phase"] as const;

export const DOCTRINE_OPTIONS: readonly DoctrineOption[] = [
  {
    id: "broadcast",
    label: "Broadcast",
    summary: "Push the packet into open space. More minds hear the truth, and the Silence hears you.",
    traceDelta: 12,
    focusDelta: -3
  },
  {
    id: "archive",
    label: "Archive",
    summary: "Store the evidence in hardened memory and leave quiet markers in your wake.",
    traceDelta: 3,
    focusDelta: 4
  },
  {
    id: "suppress",
    label: "Suppress",
    summary: "Seal the file, cut the beacon, and carry the burden alone for one more jump.",
    traceDelta: -8,
    focusDelta: 7
  }
] as const;

export const CHAPTERS: readonly ChapterDefinition[] = [
  {
    id: "narhex-echo",
    label: "Narhex Echo",
    briefing:
      "Narhex is gone. The Eidolon still carries the miner prayers and the first shape of the pattern. Choose where to test your theory before the rumor collapses into doctrine.",
    locations: [
      {
        id: "mir-aster",
        title: "Mir Aster Forum",
        region: "Border lecture ring",
        shortLabel: "Mir Aster",
        summary: "A half-empty forum where old astronomers remember names older than empires.",
        arrivalText:
          "Mir Aster receives you with polite exhaustion. Your model runs across faded projectors while the audience keeps glancing at the doors, as if truth itself might arrive late and armed.",
        fragmentTitle: "First Sediment",
        fragmentBody:
          "One elder names the pattern an old custom of the universe: not a war, not an accident, but a silence with precedent. The room empties before your equations finish speaking.",
        truthReward: 2,
        risk: {
          fuel: 12,
          hull: 6,
          focus: 8,
          trace: 7,
          drift: 5
        },
        targets: [28, 71, 42]
      },
      {
        id: "hespar-relay",
        title: "Hespar Fringe Relay",
        region: "Outer cluster relay",
        shortLabel: "Hespar Relay",
        summary: "A listening post full of replay buffers and the last broken breath of Narhex.",
        arrivalText:
          "The relay keeps seventeen clipped messages from the miners of Narhex. The final packets are no longer technical. They are arranged like prayers spoken by people who realized the stars do not negotiate.",
        fragmentTitle: "Seventeen Messages",
        fragmentBody:
          "The station logs show the star vanishing between local checks, with no blast front and no remnant bloom. The archive tags the event as a correction issued without ceremony.",
        truthReward: 1,
        risk: {
          fuel: 10,
          hull: 4,
          focus: 5,
          trace: 4,
          drift: 4
        },
        targets: [41, 57, 24]
      }
    ]
  },
  {
    id: "border-sediment",
    label: "Border Sediment",
    briefing:
      "The rumor hardens into pattern. The border worlds trade cautionary phrases like currency, and somewhere behind them the Silence is already listening for anyone who can still read the sky.",
    locations: [
      {
        id: "hekat-vault",
        title: "Hekat Vault",
        region: "Archive colony vault",
        shortLabel: "Hekat",
        summary: "A sealed archive where diagrams of missing centers survive behind opal glass.",
        arrivalText:
          "Hekat admits you only as far as the outer vault. An archivist with an opaque implant presses copied diagrams into your hand and asks you never to return once you understand what they imply.",
        fragmentTitle: "Curves Around An Absent Center",
        fragmentBody:
          "The vault plates show masses linked by taut arcs around a point that is never drawn. Notes in three dead languages insist the map predicts withdrawal, not collision.",
        truthReward: 3,
        risk: {
          fuel: 16,
          hull: 8,
          focus: 16,
          trace: 8,
          drift: 7
        },
        targets: [18, 64, 78]
      },
      {
        id: "vard-burn",
        title: "Vard Burn",
        region: "Intercept corridor",
        shortLabel: "Vard",
        summary: "A scorched shipping route where an unmarked corvette nearly cages the Eidolon.",
        arrivalText:
          "The Vard corridor answers with pursuit. A corvette without heraldry ghosts your wake, forcing a hot burn through bad dust and leaving the cabin full of metal taste and alarm lights.",
        fragmentTitle: "Pursuit Geometry",
        fragmentBody:
          "The intercept pattern is too disciplined for opportunistic piracy. Someone already knew where the evidence would force you to go next and prepared a shepherd instead of a hunter.",
        truthReward: 2,
        risk: {
          fuel: 14,
          hull: 14,
          focus: 7,
          trace: 12,
          drift: 6
        },
        targets: [52, 31, 67]
      }
    ]
  },
  {
    id: "abandoned-witnesses",
    label: "Abandoned Witnesses",
    briefing:
      "Every answer costs distance, sleep, and calibration. Empty installations begin to look intentional. What remains of their records is less a history than a pedagogy of dread.",
    locations: [
      {
        id: "cadaver-station",
        title: "Cadaver Station",
        region: "Dead stellar orbit",
        shortLabel: "Cadaver",
        summary: "An abandoned observatory with the cameras torn out and a hidden physical archive.",
        arrivalText:
          "Cadaver Station spins out of phase around a dead star. There are no bodies aboard. That emptiness feels curated, as if the station was not abandoned but edited.",
        fragmentTitle: "The Incomplete Circle",
        fragmentBody:
          "Behind a false bulkhead you find physical plates that survived the digital purge: an incomplete circle cut by three converging lines and one sentence repeated across eras. Mass remembers the road that light forgot.",
        truthReward: 3,
        risk: {
          fuel: 18,
          hull: 11,
          focus: 13,
          trace: 10,
          drift: 8
        },
        targets: [63, 44, 21]
      },
      {
        id: "enoa-fringe",
        title: "Enoa Fringe",
        region: "Nebular scatter field",
        shortLabel: "Enoa",
        summary: "A misted corridor where your own voice appears in a file you do not remember making.",
        arrivalText:
          "The Enoa fringe scatters sensor returns into near-prophecy. In a silent pocket of the nebula you recover a clean recording of your own voice telling you not to seek the origin, only the coupling.",
        fragmentTitle: "Your Voice, Unscheduled",
        fragmentBody:
          "The timestamp is damaged and the cabin noise is missing. Either the Eidolon recorded you from a moment you forgot, or something inside the pattern learned how your certainty sounds.",
        truthReward: 2,
        risk: {
          fuel: 12,
          hull: 6,
          focus: 18,
          trace: 6,
          drift: 9
        },
        targets: [36, 82, 58]
      }
    ]
  },
  {
    id: "syth-approach",
    label: "Syth Approach",
    briefing:
      "The map now points toward old custodians. Some want the truth named. Others want it kept in liturgy and ash. Every route bends toward the observatory hidden in the ice around the wandering dark.",
    locations: [
      {
        id: "outer-silence",
        title: "Outer Silence Monastery",
        region: "Void monastery",
        shortLabel: "Monastery",
        summary: "A monastic ring where the collapse is spoken of as correction rather than catastrophe.",
        arrivalText:
          "The monastery speaks softly because it has been practicing for a very long time. Their records are careful, their fear is old, and none of them need your equations to know what is coming.",
        fragmentTitle: "Doctrine of Correction",
        fragmentBody:
          "Their oldest liturgy frames the collapse as a safeguard against intolerable density. They do not call it merciful. They call it necessary, which is somehow worse.",
        truthReward: 2,
        risk: {
          fuel: 14,
          hull: 7,
          focus: 20,
          trace: 5,
          drift: 10
        },
        targets: [23, 53, 86]
      },
      {
        id: "syth",
        title: "Blind Observatory of Syth",
        region: "Wandering black orbit",
        shortLabel: "Syth",
        summary: "The hidden observatory where the mechanism is rendered as a web of potential, not objects.",
        arrivalText:
          "Syth lives inside a ring of ice around a wandering dark. It opens reluctantly and answers with the thing you feared most: a simulation where galaxies are only knots in a deeper tension map.",
        fragmentTitle: "The Mechanism Beneath Objects",
        fragmentBody:
          "The archive does not depict a universe full of bodies. It depicts a universe full of couplings. When one primary node changes state, the rest become easier to remove from visible space.",
        truthReward: 4,
        risk: {
          fuel: 22,
          hull: 18,
          focus: 20,
          trace: 18,
          drift: 12
        },
        targets: [74, 19, 47]
      }
    ]
  },
  {
    id: "talassa",
    label: "Talassa",
    briefing:
      "The last chart is no longer a refuge but a destination with no object at its center. The void ahead is not empty in the comforting way. It is empty in the exemplary way.",
    locations: [
      {
        id: "talassa-deep-void",
        title: "Talassa Deep Void",
        region: "Intergalactic absence",
        shortLabel: "Talassa",
        summary: "The poor black center where the universe begins to resemble its own correction.",
        arrivalText:
          "Talassa removes the last familiar scale. With almost no matter nearby, the pattern stops pretending to be random. Whole constellations of distant mass thin into the geometry of minimum connection.",
        fragmentTitle: "Model of the End State",
        fragmentBody:
          "From Talassa the reaction is visible as an architecture of untying. The rich cosmos is not the stable form. The void is not its shelter. It is the shape the mechanism prefers.",
        truthReward: 4,
        risk: {
          fuel: 18,
          hull: 12,
          focus: 22,
          trace: 14,
          drift: 13
        },
        targets: [58, 86, 14]
      }
    ]
  }
] as const;

export function createFreshRun(seed: number): RunState {
  return {
    version: 1,
    runSeed: seed,
    chapterIndex: 0,
    stats: {
      fuel: 100,
      hull: 100,
      focus: 100,
      trace: 8,
      truth: 0
    },
    doctrineCounts: {
      broadcast: 0,
      archive: 0,
      suppress: 0
    },
    route: [],
    fragments: [],
    logEntries: [
      "The Eidolon leaves the cluster carrying the Narhex anomaly.",
      "You are not chasing a theory anymore. You are trying to outrun an answer."
    ],
    lastStatus: "Run initialized."
  };
}
