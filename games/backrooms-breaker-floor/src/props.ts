export type DecorPropAssetId =
  | "locker-bank"
  | "filing-cabinet"
  | "water-cooler"
  | "suit-rack"
  | "archive-cart"
  | "box-stack"
  | "breaker-cabinet"
  | "server-rack"
  | "wet-floor-sign"
  | "dead-office-plant";

export interface DecorPropPlacement {
  readonly id: string;
  readonly areaId: string;
  readonly assetId: DecorPropAssetId;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly anchorY?: number;
}

export const DECOR_PROPS: readonly DecorPropPlacement[] = [
  {
    id: "prep-bay-lockers",
    areaId: "prep-bay",
    assetId: "locker-bank",
    x: 214,
    y: 456,
    width: 82,
    height: 98,
    anchorY: 0.86
  },
  {
    id: "prep-bay-cabinet",
    areaId: "prep-bay",
    assetId: "filing-cabinet",
    x: 338,
    y: 452,
    width: 58,
    height: 74,
    anchorY: 0.84
  },
  {
    id: "entry-lobby-cooler",
    areaId: "entry-lobby",
    assetId: "water-cooler",
    x: 392,
    y: 248,
    width: 42,
    height: 72,
    anchorY: 0.88
  },
  {
    id: "entry-lobby-plant",
    areaId: "entry-lobby",
    assetId: "dead-office-plant",
    x: 168,
    y: 314,
    width: 48,
    height: 78,
    anchorY: 0.88
  },
  {
    id: "prep-bay-suit-rack",
    areaId: "prep-bay",
    assetId: "suit-rack",
    x: 286,
    y: 454,
    width: 88,
    height: 90,
    anchorY: 0.84
  },
  {
    id: "prep-bay-sign",
    areaId: "prep-bay",
    assetId: "wet-floor-sign",
    x: 188,
    y: 536,
    width: 42,
    height: 68,
    anchorY: 0.9
  },
  {
    id: "archive-west-cart",
    areaId: "archive-west",
    assetId: "archive-cart",
    x: 888,
    y: 210,
    width: 86,
    height: 60,
    anchorY: 0.76
  },
  {
    id: "archive-west-cabinet",
    areaId: "archive-west",
    assetId: "filing-cabinet",
    x: 1032,
    y: 194,
    width: 56,
    height: 72,
    anchorY: 0.84
  },
  {
    id: "archive-west-boxes",
    areaId: "archive-west",
    assetId: "box-stack",
    x: 958,
    y: 214,
    width: 70,
    height: 58,
    anchorY: 0.82
  },
  {
    id: "signal-loft-breaker-cabinet",
    areaId: "signal-loft",
    assetId: "breaker-cabinet",
    x: 1362,
    y: 188,
    width: 74,
    height: 88,
    anchorY: 0.84
  },
  {
    id: "signal-loft-rack",
    areaId: "signal-loft",
    assetId: "server-rack",
    x: 1234,
    y: 194,
    width: 78,
    height: 90,
    anchorY: 0.86
  },
  {
    id: "flooded-annex-wet-floor",
    areaId: "flooded-annex",
    assetId: "wet-floor-sign",
    x: 1538,
    y: 808,
    width: 42,
    height: 68,
    anchorY: 0.9
  },
  {
    id: "flooded-annex-boxes",
    areaId: "flooded-annex",
    assetId: "box-stack",
    x: 1662,
    y: 898,
    width: 70,
    height: 58,
    anchorY: 0.82
  },
  {
    id: "server-nest-rack",
    areaId: "server-nest",
    assetId: "server-rack",
    x: 2728,
    y: 270,
    width: 84,
    height: 96,
    anchorY: 0.86
  },
  {
    id: "server-nest-rack-b",
    areaId: "server-nest",
    assetId: "server-rack",
    x: 2668,
    y: 288,
    width: 78,
    height: 92,
    anchorY: 0.86
  },
  {
    id: "breaker-core-cabinet",
    areaId: "breaker-core",
    assetId: "breaker-cabinet",
    x: 2422,
    y: 1366,
    width: 74,
    height: 88,
    anchorY: 0.84
  },
  {
    id: "observation-deck-plant",
    areaId: "observation-deck",
    assetId: "dead-office-plant",
    x: 2420,
    y: 214,
    width: 48,
    height: 78,
    anchorY: 0.88
  },
  {
    id: "observation-deck-cooler",
    areaId: "observation-deck",
    assetId: "water-cooler",
    x: 2160,
    y: 218,
    width: 42,
    height: 72,
    anchorY: 0.88
  },
  {
    id: "observation-deck-cabinet",
    areaId: "observation-deck",
    assetId: "filing-cabinet",
    x: 2526,
    y: 308,
    width: 58,
    height: 74,
    anchorY: 0.84
  },
  {
    id: "quiet-depot-boxes",
    areaId: "quiet-depot",
    assetId: "box-stack",
    x: 1036,
    y: 1702,
    width: 78,
    height: 64,
    anchorY: 0.82
  },
  {
    id: "quiet-depot-cart",
    areaId: "quiet-depot",
    assetId: "archive-cart",
    x: 1126,
    y: 1686,
    width: 86,
    height: 60,
    anchorY: 0.76
  },
  {
    id: "quiet-depot-lockers",
    areaId: "quiet-depot",
    assetId: "locker-bank",
    x: 948,
    y: 1680,
    width: 80,
    height: 96,
    anchorY: 0.86
  },
  {
    id: "tape-vault-cart",
    areaId: "tape-vault",
    assetId: "archive-cart",
    x: 472,
    y: 790,
    width: 86,
    height: 60,
    anchorY: 0.76
  },
  {
    id: "tape-vault-cabinet",
    areaId: "tape-vault",
    assetId: "filing-cabinet",
    x: 620,
    y: 838,
    width: 56,
    height: 72,
    anchorY: 0.84
  },
  {
    id: "generator-gallery-cabinet",
    areaId: "generator-gallery",
    assetId: "breaker-cabinet",
    x: 2192,
    y: 734,
    width: 74,
    height: 88,
    anchorY: 0.84
  },
  {
    id: "generator-gallery-boxes",
    areaId: "generator-gallery",
    assetId: "box-stack",
    x: 2414,
    y: 888,
    width: 70,
    height: 58,
    anchorY: 0.82
  },
  {
    id: "archive-crawl-cabinet",
    areaId: "archive-crawl",
    assetId: "filing-cabinet",
    x: 1408,
    y: 1690,
    width: 56,
    height: 72,
    anchorY: 0.84
  },
  {
    id: "archive-crawl-boxes",
    areaId: "archive-crawl",
    assetId: "box-stack",
    x: 1534,
    y: 1704,
    width: 70,
    height: 58,
    anchorY: 0.82
  }
];
