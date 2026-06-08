import { DECOR_PROPS, type DecorPropAssetId } from "./props";
import {
  INVENTORY_ITEM_DEFINITIONS,
  type InventoryItemType
} from "./inventory";

export type SearchableContainerAssetId = "locker-bank" | "filing-cabinet";

export type ContainerLootProfile = "general" | "medical" | "office" | "records" | "security";

interface WeightedEntry<T extends string> {
  readonly type: T;
  readonly weight: number;
}

export interface SearchableContainerDef {
  readonly id: string;
  readonly label: string;
  readonly assetId: SearchableContainerAssetId;
  readonly areaId: string;
  readonly x: number;
  readonly y: number;
  readonly interactionRadius: number;
  readonly lootProfile: ContainerLootProfile;
}

export interface ContainerItemDefinition {
  readonly label: string;
}

const SEARCHABLE_CONTAINER_ASSET_IDS = new Set<SearchableContainerAssetId>(["locker-bank", "filing-cabinet"]);

const AREA_LOOT_PROFILES: Record<string, ContainerLootProfile> = {
  "entry-lobby": "general",
  "prep-bay": "medical",
  "archive-west": "records",
  "observation-deck": "office",
  "quiet-depot": "security",
  "tape-vault": "records"
};

const CONTAINER_COUNT_TABLES: Record<SearchableContainerAssetId, readonly WeightedEntry<"0" | "1" | "2" | "3">[]> = {
  "locker-bank": [
    { type: "0", weight: 28 },
    { type: "1", weight: 38 },
    { type: "2", weight: 24 },
    { type: "3", weight: 10 }
  ],
  "filing-cabinet": [
    { type: "0", weight: 32 },
    { type: "1", weight: 42 },
    { type: "2", weight: 20 },
    { type: "3", weight: 6 }
  ]
};

const LOOT_TABLES: Record<ContainerLootProfile, readonly WeightedEntry<InventoryItemType>[]> = {
  general: [
    { type: "almond_milk", weight: 18 },
    { type: "ration_can", weight: 18 },
    { type: "flashlight_cells", weight: 20 },
    { type: "clipboard_note", weight: 20 },
    { type: "office_badge", weight: 10 },
    { type: "med_case", weight: 14 }
  ],
  medical: [
    { type: "med_case", weight: 34 },
    { type: "almond_milk", weight: 18 },
    { type: "ration_can", weight: 14 },
    { type: "flashlight_cells", weight: 18 },
    { type: "clipboard_note", weight: 10 },
    { type: "office_badge", weight: 6 }
  ],
  office: [
    { type: "clipboard_note", weight: 30 },
    { type: "office_badge", weight: 22 },
    { type: "almond_milk", weight: 16 },
    { type: "ration_can", weight: 10 },
    { type: "flashlight_cells", weight: 14 },
    { type: "med_case", weight: 8 }
  ],
  records: [
    { type: "clipboard_note", weight: 34 },
    { type: "flashlight_cells", weight: 18 },
    { type: "ration_can", weight: 14 },
    { type: "office_badge", weight: 14 },
    { type: "almond_milk", weight: 10 },
    { type: "med_case", weight: 10 }
  ],
  security: [
    { type: "pistol_9mm", weight: 18 },
    { type: "ammo_box_9mm", weight: 28 },
    { type: "flashlight_cells", weight: 18 },
    { type: "office_badge", weight: 12 },
    { type: "ration_can", weight: 10 },
    { type: "med_case", weight: 14 }
  ]
};

function chooseWeighted<T extends string>(entries: readonly WeightedEntry<T>[], random: () => number): T {
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = random() * totalWeight;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry.type;
    }
  }

  return entries[entries.length - 1]!.type;
}

function containerLabel(assetId: SearchableContainerAssetId): string {
  return assetId === "locker-bank" ? "Locker Bank" : "Filing Cabinet";
}

function interactionRadius(assetId: SearchableContainerAssetId): number {
  return assetId === "locker-bank" ? 48 : 44;
}

export function isSearchableContainerAssetId(assetId: DecorPropAssetId): assetId is SearchableContainerAssetId {
  return SEARCHABLE_CONTAINER_ASSET_IDS.has(assetId as SearchableContainerAssetId);
}

export const CONTAINER_ITEM_DEFINITIONS = INVENTORY_ITEM_DEFINITIONS;

export const SEARCHABLE_CONTAINERS: readonly SearchableContainerDef[] = DECOR_PROPS.flatMap((prop) => {
  if (!isSearchableContainerAssetId(prop.assetId)) {
    return [];
  }

  return [{
    id: prop.id,
    label: containerLabel(prop.assetId),
    assetId: prop.assetId,
    areaId: prop.areaId,
    x: prop.x,
    y: prop.y,
    interactionRadius: interactionRadius(prop.assetId),
    lootProfile: AREA_LOOT_PROFILES[prop.areaId] ?? "general"
  }];
});

export function rollContainerContents(
  profile: ContainerLootProfile,
  assetId: SearchableContainerAssetId,
  random: () => number = Math.random
): InventoryItemType[] {
  const count = Number.parseInt(chooseWeighted(CONTAINER_COUNT_TABLES[assetId], random), 10);
  if (count <= 0) {
    return [];
  }

  const available = [...LOOT_TABLES[profile]];
  const items: InventoryItemType[] = [];
  for (let index = 0; index < count && available.length > 0; index += 1) {
    const chosen = chooseWeighted(available, random);
    items.push(chosen);
    const chosenIndex = available.findIndex((entry) => entry.type === chosen);
    if (chosenIndex >= 0) {
      available.splice(chosenIndex, 1);
    }
  }

  return items;
}
