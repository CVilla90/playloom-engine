export const INVENTORY_SLOT_COUNT = 6;

export type InventoryItemType =
  | "almond_milk"
  | "ammo_box_9mm"
  | "clipboard_note"
  | "flashlight_cells"
  | "med_case"
  | "office_badge"
  | "pistol_9mm"
  | "ration_can";

export type InventoryItemAssetId =
  | "almond-milk"
  | "ammo-box-9mm"
  | "med-case"
  | "pistol-9mm"
  | "ration-can";

export interface InventoryItemDefinition {
  readonly label: string;
  readonly shortLabel: string;
  readonly assetId?: InventoryItemAssetId;
  readonly canUse: boolean;
  readonly canEquip: boolean;
  readonly consumeOnUse: boolean;
}

export const INVENTORY_ITEM_DEFINITIONS: Record<InventoryItemType, InventoryItemDefinition> = {
  almond_milk: {
    label: "Almond Milk",
    shortLabel: "Milk",
    assetId: "almond-milk",
    canUse: true,
    canEquip: false,
    consumeOnUse: true
  },
  ammo_box_9mm: {
    label: "9mm Ammo Box",
    shortLabel: "9mm Ammo",
    assetId: "ammo-box-9mm",
    canUse: true,
    canEquip: false,
    consumeOnUse: true
  },
  clipboard_note: {
    label: "Clipboard Note",
    shortLabel: "Note",
    canUse: true,
    canEquip: false,
    consumeOnUse: false
  },
  flashlight_cells: {
    label: "Flashlight Cells",
    shortLabel: "Cells",
    canUse: false,
    canEquip: false,
    consumeOnUse: false
  },
  med_case: {
    label: "Med Case",
    shortLabel: "Med Case",
    assetId: "med-case",
    canUse: true,
    canEquip: false,
    consumeOnUse: true
  },
  office_badge: {
    label: "Office Badge",
    shortLabel: "Badge",
    canUse: true,
    canEquip: false,
    consumeOnUse: false
  },
  pistol_9mm: {
    label: "9mm Pistol",
    shortLabel: "9mm",
    assetId: "pistol-9mm",
    canUse: false,
    canEquip: true,
    consumeOnUse: false
  },
  ration_can: {
    label: "Ration Can",
    shortLabel: "Ration",
    assetId: "ration-can",
    canUse: true,
    canEquip: false,
    consumeOnUse: true
  }
};

export function inventoryItemLabel(item: InventoryItemType): string {
  return INVENTORY_ITEM_DEFINITIONS[item].label;
}

export function canUseInventoryItem(item: InventoryItemType): boolean {
  return INVENTORY_ITEM_DEFINITIONS[item].canUse;
}

export function canEquipInventoryItem(item: InventoryItemType): boolean {
  return INVENTORY_ITEM_DEFINITIONS[item].canEquip;
}
