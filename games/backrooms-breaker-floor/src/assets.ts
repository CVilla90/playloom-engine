import yellowSuitUrl from "../assets/generated/sprites/yellow-suit.svg?url";
import yellowSuitMeta from "../assets/generated/sprites/yellow-suit.sprite.json";
import yellowSuitCorpseUrl from "../assets/generated/sprites/yellow-suit-corpse.svg?url";
import stalkerCorpseUrl from "../assets/generated/sprites/stalker-corpse.svg?url";
import breakerFloorIconUrl from "../assets/generated/ui/breaker-floor-icon.svg?url";
import lockerBankUrl from "../assets/generated/props/locker-bank.svg?url";
import filingCabinetUrl from "../assets/generated/props/filing-cabinet.svg?url";
import waterCoolerUrl from "../assets/generated/props/water-cooler.svg?url";
import suitRackUrl from "../assets/generated/props/suit-rack.svg?url";
import archiveCartUrl from "../assets/generated/props/archive-cart.svg?url";
import boxStackUrl from "../assets/generated/props/box-stack.svg?url";
import breakerCabinetUrl from "../assets/generated/props/breaker-cabinet.svg?url";
import serverRackUrl from "../assets/generated/props/server-rack.svg?url";
import wetFloorSignUrl from "../assets/generated/props/wet-floor-sign.svg?url";
import deadOfficePlantUrl from "../assets/generated/props/dead-office-plant.svg?url";
import almondMilkUrl from "../assets/generated/props/almond-milk.svg?url";
import pistol9mmUrl from "../assets/generated/props/pistol-9mm.svg?url";
import ammoBox9mmUrl from "../assets/generated/props/ammo-box-9mm.svg?url";
import rationCanUrl from "../assets/generated/props/ration-can.svg?url";
import medCaseUrl from "../assets/generated/props/med-case.svg?url";
import backroomsOfficeHum01Url from "../assets/generated/audio/backrooms-office-hum-01.wav?url";
import backroomsOfficeHum02Url from "../assets/generated/audio/backrooms-office-hum-02.wav?url";
import backroomsOfficeHum03Url from "../assets/generated/audio/backrooms-office-hum-03.wav?url";
import backroomsOfficeHum04Url from "../assets/generated/audio/backrooms-office-hum-04.wav?url";
import backroomsSuitStepUrl from "../assets/generated/audio/backrooms-suit-step.wav?url";
import backroomsPunchSwingUrl from "../assets/generated/audio/backrooms-punch-swing.wav?url";
import backroomsPunchImpactUrl from "../assets/generated/audio/backrooms-punch-impact.wav?url";
import backroomsPistolShotUrl from "../assets/generated/audio/backrooms-pistol-shot.wav?url";
import backroomsRelaySurgeUrl from "../assets/generated/audio/backrooms-relay-surge.wav?url";
import backroomsBreakerClangUrl from "../assets/generated/audio/backrooms-breaker-clang.wav?url";
import backroomsStalkerStepUrl from "../assets/generated/audio/backrooms-stalker-step.wav?url";
import backroomsStalkerGrowlUrl from "../assets/generated/audio/backrooms-stalker-growl.wav?url";
import backroomsStalkerGrowl02Url from "../assets/generated/audio/backrooms-stalker-growl-02.wav?url";
import type { InventoryItemAssetId } from "./inventory";
import type { DecorPropAssetId } from "./props";

export interface SpriteSheetMeta {
  id: string;
  image: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  fps: number;
}

export interface CharacterAssets {
  sheet: HTMLImageElement;
  sprite: SpriteSheetMeta;
}

export interface TitleAssets {
  breakerFloorIcon: HTMLImageElement;
}

export interface GameAssets {
  character: CharacterAssets;
  playerCorpse: HTMLImageElement;
  stalkerCorpse: HTMLImageElement;
  decor: Record<DecorPropAssetId, HTMLImageElement>;
  itemIcons: Partial<Record<InventoryItemAssetId, HTMLImageElement>>;
  audio: {
    ambientClips: HTMLAudioElement[];
    stalkerVoiceClips: HTMLAudioElement[];
    stepUrl: string;
    punchSwingUrl: string;
    punchImpactUrl: string;
    pistolShotUrl: string;
    relayPickupUrl: string;
    breakerToggleUrl: string;
    stalkerStepUrl: string;
  };
}

function createDecorAssetMap(images: Record<DecorPropAssetId, HTMLImageElement>): Record<DecorPropAssetId, HTMLImageElement> {
  return images;
}

function createItemIconMap(images: Partial<Record<InventoryItemAssetId, HTMLImageElement>>): Partial<Record<InventoryItemAssetId, HTMLImageElement>> {
  return images;
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

export async function loadCharacterAssets(): Promise<CharacterAssets> {
  const sheet = await loadImage(yellowSuitUrl);
  return {
    sheet,
    sprite: yellowSuitMeta as SpriteSheetMeta
  };
}

let titleAssetsPromise: Promise<TitleAssets> | null = null;

export function loadTitleAssets(): Promise<TitleAssets> {
  titleAssetsPromise ??= loadImage(breakerFloorIconUrl).then((breakerFloorIcon) => ({
    breakerFloorIcon
  }));
  return titleAssetsPromise;
}

export async function loadGameAssets(): Promise<GameAssets> {
  const [character, playerCorpse, stalkerCorpse, decor, itemIcons, ambientClips, stalkerVoiceClips] = await Promise.all([
    loadCharacterAssets(),
    loadImage(yellowSuitCorpseUrl),
    loadImage(stalkerCorpseUrl),
    Promise.all([
      loadImage(lockerBankUrl),
      loadImage(filingCabinetUrl),
      loadImage(waterCoolerUrl),
      loadImage(suitRackUrl),
      loadImage(archiveCartUrl),
      loadImage(boxStackUrl),
      loadImage(breakerCabinetUrl),
      loadImage(serverRackUrl),
      loadImage(wetFloorSignUrl),
      loadImage(deadOfficePlantUrl)
    ]).then(
      ([
        lockerBank,
        filingCabinet,
        waterCooler,
        suitRack,
        archiveCart,
        boxStack,
        breakerCabinet,
        serverRack,
        wetFloorSign,
        deadOfficePlant
      ]) =>
      createDecorAssetMap({
        "locker-bank": lockerBank,
        "filing-cabinet": filingCabinet,
        "water-cooler": waterCooler,
        "suit-rack": suitRack,
        "archive-cart": archiveCart,
        "box-stack": boxStack,
        "breaker-cabinet": breakerCabinet,
        "server-rack": serverRack,
        "wet-floor-sign": wetFloorSign,
        "dead-office-plant": deadOfficePlant
      })
    ),
    Promise.all([
      loadImage(almondMilkUrl),
      loadImage(pistol9mmUrl),
      loadImage(ammoBox9mmUrl),
      loadImage(rationCanUrl),
      loadImage(medCaseUrl)
    ]).then(([almondMilk, pistol9mm, ammoBox9mm, rationCan, medCase]) =>
      createItemIconMap({
        "almond-milk": almondMilk,
        "pistol-9mm": pistol9mm,
        "ammo-box-9mm": ammoBox9mm,
        "ration-can": rationCan,
        "med-case": medCase
      })
    ),
    Promise.all([
      loadAudio(backroomsOfficeHum01Url, false, 0.04),
      loadAudio(backroomsOfficeHum02Url, false, 0.04),
      loadAudio(backroomsOfficeHum03Url, false, 0.04),
      loadAudio(backroomsOfficeHum04Url, false, 0.04)
    ]),
    Promise.all([
      loadAudio(backroomsStalkerGrowlUrl, false, 0.08),
      loadAudio(backroomsStalkerGrowl02Url, false, 0.08)
    ])
  ]);

  return {
    character,
    playerCorpse,
    stalkerCorpse,
    decor,
    itemIcons,
    audio: {
      ambientClips,
      stalkerVoiceClips,
      stepUrl: backroomsSuitStepUrl,
      punchSwingUrl: backroomsPunchSwingUrl,
      punchImpactUrl: backroomsPunchImpactUrl,
      pistolShotUrl: backroomsPistolShotUrl,
      relayPickupUrl: backroomsRelaySurgeUrl,
      breakerToggleUrl: backroomsBreakerClangUrl,
      stalkerStepUrl: backroomsStalkerStepUrl
    }
  };
}
