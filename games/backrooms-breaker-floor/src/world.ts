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

export const WORLD_WIDTH = 1600;
export const WORLD_HEIGHT = 1120;
export const PLAYER_SPAWN = { x: 204, y: 228 };

export const AREAS: readonly AreaDef[] = [
  {
    id: "entry-lobby",
    label: "Entry Lobby",
    kind: "room",
    x: 92,
    y: 136,
    width: 260,
    height: 188,
    floor: "#b59c62",
    trim: "#f0df9f",
    glow: "rgba(243, 231, 165, 0.20)",
    lighting: {
      axis: "x",
      start: 0.62,
      end: 0.46
    }
  },
  {
    id: "east-hall",
    label: "East Hall",
    kind: "hall",
    x: 352,
    y: 194,
    width: 738,
    height: 86,
    floor: "#8d7a49",
    trim: "#d8c892",
    glow: "rgba(238, 227, 155, 0.16)",
    lighting: {
      axis: "x",
      start: 0.42,
      end: 0.12
    }
  },
  {
    id: "supply-closet",
    label: "Supply Closet",
    kind: "room",
    x: 620,
    y: 88,
    width: 124,
    height: 106,
    floor: "#7d5846",
    trim: "#d6aa7c",
    glow: "rgba(255, 194, 138, 0.12)",
    lighting: {
      axis: "y",
      start: 0.05,
      end: 0
    }
  },
  {
    id: "storage",
    label: "Storage Wing",
    kind: "room",
    x: 782,
    y: 70,
    width: 228,
    height: 186,
    floor: "#b88f5a",
    trim: "#eed6a1",
    glow: "rgba(255, 232, 176, 0.18)",
    lighting: {
      axis: "x",
      start: 0.1,
      end: 0
    }
  },
  {
    id: "observation",
    label: "Observation",
    kind: "room",
    x: 1090,
    y: 86,
    width: 366,
    height: 246,
    floor: "#6b8090",
    trim: "#d2e2ee",
    glow: "rgba(204, 233, 255, 0.16)",
    lighting: {
      axis: "x",
      start: 0.12,
      end: 0.94
    }
  },
  {
    id: "service-spine",
    label: "Service Spine",
    kind: "hall",
    x: 552,
    y: 280,
    width: 112,
    height: 376,
    floor: "#7b6c48",
    trim: "#c8b47a",
    glow: "rgba(234, 214, 134, 0.10)",
    lighting: {
      axis: "y",
      start: 0.2,
      end: 0.04
    }
  },
  {
    id: "tape-vault",
    label: "Tape Vault",
    kind: "room",
    x: 246,
    y: 560,
    width: 324,
    height: 188,
    floor: "#8c6544",
    trim: "#ddb880",
    glow: "rgba(248, 223, 150, 0.15)",
    lighting: {
      axis: "x",
      start: 0.08,
      end: 0.04
    }
  },
  {
    id: "annex-link",
    label: "Annex Link",
    kind: "hall",
    x: 664,
    y: 620,
    width: 276,
    height: 90,
    floor: "#5e6f67",
    trim: "#adc5bb",
    glow: "rgba(190, 228, 210, 0.10)",
    lighting: {
      axis: "x",
      start: 0.05,
      end: 0.44
    }
  },
  {
    id: "pool-annex",
    label: "Pool Annex",
    kind: "room",
    x: 940,
    y: 486,
    width: 350,
    height: 316,
    floor: "#64866d",
    trim: "#c7e1cb",
    glow: "rgba(184, 233, 190, 0.13)",
    lighting: {
      axis: "y",
      start: 0.34,
      end: 0.72
    }
  },
  {
    id: "breaker-core",
    label: "Breaker Core",
    kind: "room",
    x: 1290,
    y: 450,
    width: 280,
    height: 314,
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
    id: "service-drop",
    label: "Service Drop",
    kind: "hall",
    x: 1308,
    y: 764,
    width: 88,
    height: 84,
    floor: "#705a46",
    trim: "#c3a27d",
    glow: "rgba(240, 192, 110, 0.10)",
    lighting: {
      axis: "y",
      start: 0.02,
      end: 0.16
    }
  },
  {
    id: "exit-spine",
    label: "Exit Spine",
    kind: "hall",
    x: 720,
    y: 848,
    width: 570,
    height: 88,
    floor: "#917f4f",
    trim: "#e5d092",
    glow: "rgba(246, 210, 125, 0.14)",
    lighting: {
      axis: "x",
      start: 0.08,
      end: 0.34
    }
  },
  {
    id: "exit-chamber",
    label: "Exit Chamber",
    kind: "room",
    x: 1290,
    y: 734,
    width: 292,
    height: 252,
    floor: "#c0aa70",
    trim: "#f7e6aa",
    glow: "rgba(255, 225, 148, 0.18)",
    lighting: {
      axis: "y",
      start: 0.34,
      end: 0.84
    }
  }
];

export const RELAYS: readonly RelayDef[] = [
  {
    id: "relay-storage",
    label: "Relay A",
    x: 930,
    y: 156,
    areaId: "storage"
  },
  {
    id: "relay-tape",
    label: "Relay B",
    x: 400,
    y: 660,
    areaId: "tape-vault"
  },
  {
    id: "relay-annex",
    label: "Relay C",
    x: 1108,
    y: 692,
    areaId: "pool-annex"
  }
];

export const PANELS: readonly PanelDef[] = [
  {
    id: "panel-a",
    label: "Core Breaker A",
    x: 1450,
    y: 620,
    areaId: "breaker-core",
    sequence: 1
  },
  {
    id: "panel-b",
    label: "Observation Reroute B",
    x: 1370,
    y: 206,
    areaId: "observation",
    sequence: 2
  }
];

export const EXIT_TERMINAL = {
  x: 1450,
  y: 868
};

export const LOCKED_EXIT_GATE: Rect = {
  x: 1282,
  y: 840,
  width: 18,
  height: 96
};
