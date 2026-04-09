export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type LightAxis = "x" | "y";

export interface AreaLighting {
  readonly axis: LightAxis;
  readonly start: number;
  readonly end: number;
}

export interface AreaDef extends Rect {
  readonly id: string;
  readonly label: string;
  readonly kind: "room" | "hall";
  readonly floor: string;
  readonly trim: string;
  readonly glow: string;
  readonly lighting: AreaLighting;
}

export interface RelayDef {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly areaId: string;
}

export interface PanelDef {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly areaId: string;
  readonly sequence: number;
}

export interface TrainingDummyDef {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly areaId: string;
}

export interface PlayerSpawnPointDef {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly areaId: string;
}

export const WORLD_WIDTH = 3000;
export const WORLD_HEIGHT = 1920;
export const PLAYER_SPAWN_POINTS: readonly PlayerSpawnPointDef[] = [
  {
    id: "entry-lobby-nw",
    x: 188,
    y: 238,
    areaId: "entry-lobby"
  },
  {
    id: "entry-lobby-n",
    x: 272,
    y: 226,
    areaId: "entry-lobby"
  },
  {
    id: "entry-lobby-ne",
    x: 356,
    y: 238,
    areaId: "entry-lobby"
  },
  {
    id: "entry-lobby-sw",
    x: 204,
    y: 314,
    areaId: "entry-lobby"
  },
  {
    id: "entry-lobby-s",
    x: 272,
    y: 326,
    areaId: "entry-lobby"
  },
  {
    id: "entry-lobby-se",
    x: 340,
    y: 314,
    areaId: "entry-lobby"
  }
];
export const PLAYER_SPAWN: PlayerSpawnPointDef = PLAYER_SPAWN_POINTS[0]!;

export const AREAS: readonly AreaDef[] = [
  {
    id: "entry-lobby",
    label: "Entry Lobby",
    kind: "room",
    x: 112,
    y: 164,
    width: 320,
    height: 224,
    floor: "#b59c62",
    trim: "#f0df9f",
    glow: "rgba(243, 231, 165, 0.20)",
    lighting: {
      axis: "x",
      start: 0.64,
      end: 0.48
    }
  },
  {
    id: "prep-bay",
    label: "Suit Prep Bay",
    kind: "room",
    x: 154,
    y: 388,
    width: 236,
    height: 184,
    floor: "#8e7650",
    trim: "#dcc58f",
    glow: "rgba(240, 223, 164, 0.14)",
    lighting: {
      axis: "y",
      start: 0.34,
      end: 0.12
    }
  },
  {
    id: "intake-hall",
    label: "Intake Hall",
    kind: "hall",
    x: 432,
    y: 244,
    width: 360,
    height: 96,
    floor: "#8d7a49",
    trim: "#d8c892",
    glow: "rgba(238, 227, 155, 0.16)",
    lighting: {
      axis: "x",
      start: 0.46,
      end: 0.18
    }
  },
  {
    id: "archive-west",
    label: "Archive West",
    kind: "room",
    x: 792,
    y: 126,
    width: 300,
    height: 118,
    floor: "#b88f5a",
    trim: "#eed6a1",
    glow: "rgba(255, 232, 176, 0.18)",
    lighting: {
      axis: "x",
      start: 0.18,
      end: 0.04
    }
  },
  {
    id: "transit-spine",
    label: "Transit Spine",
    kind: "hall",
    x: 792,
    y: 244,
    width: 1310,
    height: 96,
    floor: "#7d6f48",
    trim: "#d8c892",
    glow: "rgba(238, 227, 155, 0.15)",
    lighting: {
      axis: "x",
      start: 0.26,
      end: 0.08
    }
  },
  {
    id: "signal-loft",
    label: "Signal Loft",
    kind: "room",
    x: 1168,
    y: 112,
    width: 292,
    height: 132,
    floor: "#7d5846",
    trim: "#d6aa7c",
    glow: "rgba(255, 194, 138, 0.12)",
    lighting: {
      axis: "y",
      start: 0.08,
      end: 0
    }
  },
  {
    id: "observation-deck",
    label: "Observation Deck",
    kind: "room",
    x: 2102,
    y: 132,
    width: 508,
    height: 264,
    floor: "#6b8090",
    trim: "#d2e2ee",
    glow: "rgba(204, 233, 255, 0.16)",
    lighting: {
      axis: "x",
      start: 0.18,
      end: 0.94
    }
  },
  {
    id: "server-nest",
    label: "Server Nest",
    kind: "room",
    x: 2610,
    y: 176,
    width: 206,
    height: 176,
    floor: "#5e6f67",
    trim: "#adc5bb",
    glow: "rgba(190, 228, 210, 0.10)",
    lighting: {
      axis: "y",
      start: 0.12,
      end: 0.46
    }
  },
  {
    id: "maintenance-spine",
    label: "Maintenance Spine",
    kind: "hall",
    x: 1182,
    y: 340,
    width: 112,
    height: 972,
    floor: "#7b6c48",
    trim: "#c8b47a",
    glow: "rgba(234, 214, 134, 0.10)",
    lighting: {
      axis: "y",
      start: 0.22,
      end: 0.04
    }
  },
  {
    id: "tape-link",
    label: "Tape Link",
    kind: "hall",
    x: 688,
    y: 750,
    width: 494,
    height: 92,
    floor: "#6d6244",
    trim: "#c7b57c",
    glow: "rgba(228, 209, 132, 0.10)",
    lighting: {
      axis: "x",
      start: 0.18,
      end: 0.06
    }
  },
  {
    id: "tape-vault",
    label: "Tape Vault",
    kind: "room",
    x: 392,
    y: 658,
    width: 296,
    height: 276,
    floor: "#8c6544",
    trim: "#ddb880",
    glow: "rgba(248, 223, 150, 0.15)",
    lighting: {
      axis: "x",
      start: 0.10,
      end: 0.02
    }
  },
  {
    id: "flooded-annex",
    label: "Flooded Annex",
    kind: "room",
    x: 1294,
    y: 640,
    width: 430,
    height: 328,
    floor: "#64866d",
    trim: "#c7e1cb",
    glow: "rgba(184, 233, 190, 0.13)",
    lighting: {
      axis: "y",
      start: 0.26,
      end: 0.68
    }
  },
  {
    id: "coolant-bridge",
    label: "Coolant Bridge",
    kind: "hall",
    x: 1724,
    y: 750,
    width: 360,
    height: 92,
    floor: "#5e6f67",
    trim: "#adc5bb",
    glow: "rgba(190, 228, 210, 0.10)",
    lighting: {
      axis: "x",
      start: 0.12,
      end: 0.38
    }
  },
  {
    id: "generator-gallery",
    label: "Generator Gallery",
    kind: "room",
    x: 2084,
    y: 620,
    width: 430,
    height: 348,
    floor: "#7a5947",
    trim: "#e0bb90",
    glow: "rgba(255, 205, 132, 0.14)",
    lighting: {
      axis: "x",
      start: 0.08,
      end: 0.02
    }
  },
  {
    id: "breaker-drop",
    label: "Breaker Drop",
    kind: "hall",
    x: 2250,
    y: 968,
    width: 108,
    height: 178,
    floor: "#705a46",
    trim: "#c3a27d",
    glow: "rgba(240, 192, 110, 0.10)",
    lighting: {
      axis: "y",
      start: 0.04,
      end: 0.20
    }
  },
  {
    id: "lower-loop",
    label: "Lower Loop",
    kind: "hall",
    x: 1294,
    y: 1208,
    width: 790,
    height: 104,
    floor: "#917f4f",
    trim: "#e5d092",
    glow: "rgba(246, 210, 125, 0.14)",
    lighting: {
      axis: "x",
      start: 0.08,
      end: 0.28
    }
  },
  {
    id: "breaker-core",
    label: "Breaker Core",
    kind: "room",
    x: 2084,
    y: 1146,
    width: 432,
    height: 326,
    floor: "#7a5947",
    trim: "#e0bb90",
    glow: "rgba(255, 205, 132, 0.14)",
    lighting: {
      axis: "x",
      start: 0.04,
      end: 0
    }
  },
  {
    id: "south-service",
    label: "South Service",
    kind: "hall",
    x: 1188,
    y: 1312,
    width: 106,
    height: 396,
    floor: "#756548",
    trim: "#cdb67f",
    glow: "rgba(234, 214, 134, 0.10)",
    lighting: {
      axis: "y",
      start: 0.10,
      end: 0.02
    }
  },
  {
    id: "quiet-depot",
    label: "Quiet Depot",
    kind: "room",
    x: 888,
    y: 1560,
    width: 300,
    height: 248,
    floor: "#7d5846",
    trim: "#d6aa7c",
    glow: "rgba(255, 194, 138, 0.12)",
    lighting: {
      axis: "x",
      start: 0.08,
      end: 0.02
    }
  },
  {
    id: "archive-crawl",
    label: "Archive Crawl",
    kind: "room",
    x: 1294,
    y: 1568,
    width: 366,
    height: 232,
    floor: "#8c6544",
    trim: "#ddb880",
    glow: "rgba(248, 223, 150, 0.15)",
    lighting: {
      axis: "x",
      start: 0.06,
      end: 0
    }
  },
  {
    id: "south-cross",
    label: "South Cross",
    kind: "hall",
    x: 1660,
    y: 1628,
    width: 424,
    height: 92,
    floor: "#5e6f67",
    trim: "#adc5bb",
    glow: "rgba(190, 228, 210, 0.10)",
    lighting: {
      axis: "x",
      start: 0.04,
      end: 0.18
    }
  },
  {
    id: "exit-transfer",
    label: "Exit Transfer",
    kind: "hall",
    x: 2516,
    y: 1260,
    width: 180,
    height: 92,
    floor: "#7d6f48",
    trim: "#d8c892",
    glow: "rgba(238, 227, 155, 0.14)",
    lighting: {
      axis: "x",
      start: 0.08,
      end: 0.22
    }
  },
  {
    id: "exit-chamber",
    label: "Exit Chamber",
    kind: "room",
    x: 2696,
    y: 1108,
    width: 248,
    height: 396,
    floor: "#c0aa70",
    trim: "#f7e6aa",
    glow: "rgba(255, 225, 148, 0.18)",
    lighting: {
      axis: "y",
      start: 0.26,
      end: 0.84
    }
  }
];

export const RELAYS: readonly RelayDef[] = [
  {
    id: "relay-archive",
    label: "Relay A",
    x: 930,
    y: 226,
    areaId: "archive-west"
  },
  {
    id: "relay-depot",
    label: "Relay B",
    x: 1032,
    y: 1682,
    areaId: "quiet-depot"
  },
  {
    id: "relay-gallery",
    label: "Relay C",
    x: 2298,
    y: 804,
    areaId: "generator-gallery"
  }
];

export const PANELS: readonly PanelDef[] = [
  {
    id: "panel-a",
    label: "Core Breaker A",
    x: 2334,
    y: 1296,
    areaId: "breaker-core",
    sequence: 1
  },
  {
    id: "panel-b",
    label: "Observation Reroute B",
    x: 2476,
    y: 264,
    areaId: "observation-deck",
    sequence: 2
  }
];

export const EXIT_TERMINAL = {
  x: 2822,
  y: 1302
};

export const TRAINING_DUMMY: TrainingDummyDef = {
  id: "prep-bay-dummy",
  label: "Evac Drill Dummy",
  x: 276,
  y: 492,
  radius: 18,
  areaId: "prep-bay"
};

export const LOCKED_EXIT_GATE: Rect = {
  x: 2678,
  y: 1228,
  width: 18,
  height: 156
};
