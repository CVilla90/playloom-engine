import backgroundCoreUrl from "../assets/generated/icons/background-core.svg?url";
import backgroundCoreV2Url from "../assets/generated/icons/background-core-v2.svg?url";
import ceilingGridUrl from "../assets/generated/icons/ceiling-grid.svg?url";
import ceilingGridV2Url from "../assets/generated/icons/ceiling-grid-v2.svg?url";
import floorPlateUrl from "../assets/generated/icons/floor-plate.svg?url";
import floorPlateV2Url from "../assets/generated/icons/floor-plate-v2.svg?url";
import stairFrameUrl from "../assets/generated/icons/stair-frame.svg?url";
import stairFrameV2Url from "../assets/generated/icons/stair-frame-v2.svg?url";
import stairFrameV3Url from "../assets/generated/icons/stair-frame-v3.svg?url";
import stairConnectorV3Url from "../assets/generated/icons/stair-connector-v3.svg?url";
import stairSwitchbackV4Url from "../assets/generated/icons/stair-switchback-v4.svg?url";
import stairConnectorV4Url from "../assets/generated/icons/stair-connector-v4.svg?url";
import stairLadderV5Url from "../assets/generated/icons/stair-ladder-v5.svg?url";
import stairConnectorV5Url from "../assets/generated/icons/stair-connector-v5.svg?url";
import wallPanelUrl from "../assets/generated/icons/wall-panel.svg?url";
import wallPanelV2Url from "../assets/generated/icons/wall-panel-v2.svg?url";
import chromeBotUrl from "../assets/generated/sprites/chrome-bot.svg?url";
import chromeBotMeta from "../assets/generated/sprites/chrome-bot.sprite.json";
import neonRunnerUrl from "../assets/generated/sprites/neon-runner.svg?url";
import neonRunnerMeta from "../assets/generated/sprites/neon-runner.sprite.json";
import alleyJackalUrl from "../assets/generated/sprites/alley-jackal.svg?url";
import alleyJackalMeta from "../assets/generated/sprites/alley-jackal.sprite.json";
import synthRaiderUrl from "../assets/generated/sprites/synth-raider.svg?url";
import synthRaiderMeta from "../assets/generated/sprites/synth-raider.sprite.json";

import shaftDriftUrl from "../assets/generated/audio/shaft-drift.wav?url";
import footstepMetalUrl from "../assets/generated/audio/footstep-metal.wav?url";
import jumpThrusterUrl from "../assets/generated/audio/jump-thruster.wav?url";
import landingClangUrl from "../assets/generated/audio/landing-clang.wav?url";

export interface SpriteSheetMeta {
  id: string;
  image: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  fps: number;
}

export type CharacterId = "chrome-bot" | "neon-runner" | "alley-jackal" | "synth-raider";

export interface CharacterSpriteAsset {
  sheet: HTMLImageElement;
  sprite: SpriteSheetMeta;
}

export interface GameAssets {
  images: {
    backgroundCore: HTMLImageElement;
    backgroundCoreV2: HTMLImageElement;
    ceilingGrid: HTMLImageElement;
    ceilingGridV2: HTMLImageElement;
    floorPlate: HTMLImageElement;
    floorPlateV2: HTMLImageElement;
    stairFrame: HTMLImageElement;
    stairFrameV2: HTMLImageElement;
    stairFrameV3: HTMLImageElement;
    stairConnectorV3: HTMLImageElement;
    stairSwitchbackV4: HTMLImageElement;
    stairConnectorV4: HTMLImageElement;
    stairLadderV5: HTMLImageElement;
    stairConnectorV5: HTMLImageElement;
    wallPanel: HTMLImageElement;
    wallPanelV2: HTMLImageElement;
  };
  characters: Record<CharacterId, CharacterSpriteAsset>;
  audio: {
    ambient: HTMLAudioElement;
    stepUrl: string;
    jumpUrl: string;
    landUrl: string;
  };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    image.src = url;
  });
}

function loadAudio(url: string, loop: boolean, volume: number): Promise<HTMLAudioElement> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.preload = "auto";
    audio.loop = loop;
    audio.volume = volume;
    audio.oncanplaythrough = () => resolve(audio);
    audio.onerror = () => reject(new Error(`Failed to load audio: ${url}`));
    audio.src = url;
    audio.load();
  });
}

export async function loadGameAssets(): Promise<GameAssets> {
  const [
    backgroundCore,
    backgroundCoreV2,
    ceilingGrid,
    ceilingGridV2,
    floorPlate,
    floorPlateV2,
    stairFrame,
    stairFrameV2,
    stairFrameV3,
    stairConnectorV3,
    stairSwitchbackV4,
    stairConnectorV4,
    stairLadderV5,
    stairConnectorV5,
    wallPanel,
    wallPanelV2,
    chromeBotSheet,
    neonRunnerSheet,
    alleyJackalSheet,
    synthRaiderSheet,
    ambient
  ] = await Promise.all([
    loadImage(backgroundCoreUrl),
    loadImage(backgroundCoreV2Url),
    loadImage(ceilingGridUrl),
    loadImage(ceilingGridV2Url),
    loadImage(floorPlateUrl),
    loadImage(floorPlateV2Url),
    loadImage(stairFrameUrl),
    loadImage(stairFrameV2Url),
    loadImage(stairFrameV3Url),
    loadImage(stairConnectorV3Url),
    loadImage(stairSwitchbackV4Url),
    loadImage(stairConnectorV4Url),
    loadImage(stairLadderV5Url),
    loadImage(stairConnectorV5Url),
    loadImage(wallPanelUrl),
    loadImage(wallPanelV2Url),
    loadImage(chromeBotUrl),
    loadImage(neonRunnerUrl),
    loadImage(alleyJackalUrl),
    loadImage(synthRaiderUrl),
    loadAudio(shaftDriftUrl, true, 0.26)
  ]);

  return {
    images: {
      backgroundCore,
      backgroundCoreV2,
      ceilingGrid,
      ceilingGridV2,
      floorPlate,
      floorPlateV2,
      stairFrame,
      stairFrameV2,
      stairFrameV3,
      stairConnectorV3,
      stairSwitchbackV4,
      stairConnectorV4,
      stairLadderV5,
      stairConnectorV5,
      wallPanel,
      wallPanelV2
    },
    characters: {
      "chrome-bot": {
        sheet: chromeBotSheet,
        sprite: chromeBotMeta as SpriteSheetMeta
      },
      "neon-runner": {
        sheet: neonRunnerSheet,
        sprite: neonRunnerMeta as SpriteSheetMeta
      },
      "alley-jackal": {
        sheet: alleyJackalSheet,
        sprite: alleyJackalMeta as SpriteSheetMeta
      },
      "synth-raider": {
        sheet: synthRaiderSheet,
        sprite: synthRaiderMeta as SpriteSheetMeta
      }
    },
    audio: {
      ambient,
      stepUrl: footstepMetalUrl,
      jumpUrl: jumpThrusterUrl,
      landUrl: landingClangUrl
    }
  };
}
