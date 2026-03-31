import yellowSuitUrl from "../assets/generated/sprites/yellow-suit.svg?url";
import yellowSuitMeta from "../assets/generated/sprites/yellow-suit.sprite.json";
import fluorescentHumUrl from "../assets/generated/audio/fluorescent-hum.wav?url";
import hazmatStepUrl from "../assets/generated/audio/hazmat-step.wav?url";
import relayPickupUrl from "../assets/generated/audio/relay-pickup.wav?url";
import breakerToggleUrl from "../assets/generated/audio/breaker-toggle.wav?url";

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

export interface GameAssets {
  character: CharacterAssets;
  audio: {
    ambient: HTMLAudioElement;
    stepUrl: string;
    relayPickupUrl: string;
    breakerToggleUrl: string;
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

export async function loadGameAssets(): Promise<GameAssets> {
  const [character, ambient] = await Promise.all([
    loadCharacterAssets(),
    loadAudio(fluorescentHumUrl, true, 0.24)
  ]);

  return {
    character,
    audio: {
      ambient,
      stepUrl: hazmatStepUrl,
      relayPickupUrl,
      breakerToggleUrl
    }
  };
}
