import yellowSuitUrl from "../assets/generated/sprites/yellow-suit.svg?url";
import yellowSuitMeta from "../assets/generated/sprites/yellow-suit.sprite.json";
import yellowSuitCorpseUrl from "../assets/generated/sprites/yellow-suit-corpse.svg?url";
import stalkerCorpseUrl from "../assets/generated/sprites/stalker-corpse.svg?url";
import breakerFloorIconUrl from "../assets/generated/ui/breaker-floor-icon.svg?url";
import backroomsOfficeHum01Url from "../assets/generated/audio/backrooms-office-hum-01.wav?url";
import backroomsOfficeHum02Url from "../assets/generated/audio/backrooms-office-hum-02.wav?url";
import backroomsOfficeHum03Url from "../assets/generated/audio/backrooms-office-hum-03.wav?url";
import backroomsOfficeHum04Url from "../assets/generated/audio/backrooms-office-hum-04.wav?url";
import backroomsSuitStepUrl from "../assets/generated/audio/backrooms-suit-step.wav?url";
import backroomsPunchSwingUrl from "../assets/generated/audio/backrooms-punch-swing.wav?url";
import backroomsPunchImpactUrl from "../assets/generated/audio/backrooms-punch-impact.wav?url";
import backroomsRelaySurgeUrl from "../assets/generated/audio/backrooms-relay-surge.wav?url";
import backroomsBreakerClangUrl from "../assets/generated/audio/backrooms-breaker-clang.wav?url";
import backroomsStalkerStepUrl from "../assets/generated/audio/backrooms-stalker-step.wav?url";
import backroomsStalkerGrowlUrl from "../assets/generated/audio/backrooms-stalker-growl.wav?url";
import backroomsStalkerGrowl02Url from "../assets/generated/audio/backrooms-stalker-growl-02.wav?url";

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
  audio: {
    ambientClips: HTMLAudioElement[];
    stalkerVoiceClips: HTMLAudioElement[];
    stepUrl: string;
    punchSwingUrl: string;
    punchImpactUrl: string;
    relayPickupUrl: string;
    breakerToggleUrl: string;
    stalkerStepUrl: string;
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
  const [character, playerCorpse, stalkerCorpse, ambientClips, stalkerVoiceClips] = await Promise.all([
    loadCharacterAssets(),
    loadImage(yellowSuitCorpseUrl),
    loadImage(stalkerCorpseUrl),
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
    audio: {
      ambientClips,
      stalkerVoiceClips,
      stepUrl: backroomsSuitStepUrl,
      punchSwingUrl: backroomsPunchSwingUrl,
      punchImpactUrl: backroomsPunchImpactUrl,
      relayPickupUrl: backroomsRelaySurgeUrl,
      breakerToggleUrl: backroomsBreakerClangUrl,
      stalkerStepUrl: backroomsStalkerStepUrl
    }
  };
}
