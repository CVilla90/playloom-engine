import type { CharacterId, ResourceKey } from "./types";

import scrapIconUrl from "../assets/icons/scrap.svg?url";
import stoneIconUrl from "../assets/icons/stone.svg?url";
import metalIconUrl from "../assets/icons/metal.svg?url";
import woodIconUrl from "../assets/icons/wood.svg?url";

import humanSilhouetteUrl from "../assets/characters/human.svg?url";
import robotSilhouetteUrl from "../assets/characters/robot.svg?url";
import animalSilhouetteUrl from "../assets/characters/animal.svg?url";

import panelUrl from "../assets/ui/panel.svg?url";

export interface GameAssets {
  resourceIcons: Record<ResourceKey, HTMLImageElement>;
  characterIcons: Record<CharacterId, HTMLImageElement>;
  panel: HTMLImageElement;
}

function imageFromUrl(url: string): HTMLImageElement {
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  return image;
}

export function createAssets(): GameAssets {
  return {
    resourceIcons: {
      scrap: imageFromUrl(scrapIconUrl),
      stone: imageFromUrl(stoneIconUrl),
      metal: imageFromUrl(metalIconUrl),
      wood: imageFromUrl(woodIconUrl)
    },
    characterIcons: {
      human: imageFromUrl(humanSilhouetteUrl),
      robot: imageFromUrl(robotSilhouetteUrl),
      animal: imageFromUrl(animalSilhouetteUrl)
    },
    panel: imageFromUrl(panelUrl)
  };
}
