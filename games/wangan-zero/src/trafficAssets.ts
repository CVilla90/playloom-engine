import yaw000Url from "../assets/traffic-car-frames/traffic-car-yaw-000.png?url";
import yaw004Url from "../assets/traffic-car-frames/traffic-car-yaw-004.png?url";
import yaw008Url from "../assets/traffic-car-frames/traffic-car-yaw-008.png?url";
import frontYaw000Url from "../assets/traffic-car-frames/traffic-car-front-yaw-000.png?url";
import frontYaw004Url from "../assets/traffic-car-frames/traffic-car-front-yaw-004.png?url";
import truckYaw000Url from "../assets/traffic-truck-frames/traffic-truck-yaw-000.png?url";
import truckYaw004Url from "../assets/traffic-truck-frames/traffic-truck-yaw-004.png?url";
import truckFrontYaw000Url from "../assets/traffic-truck-frames/traffic-truck-front-yaw-000.png?url";
import truckFrontYaw004Url from "../assets/traffic-truck-frames/traffic-truck-front-yaw-004.png?url";
import shirokageYaw000Url from "../assets/shirokage-car-frames/shirokage-yaw-000.png?url";
import shirokageYaw004Url from "../assets/shirokage-car-frames/shirokage-yaw-004.png?url";
import shirokageFrontYaw000Url from "../assets/shirokage-car-frames/shirokage-front-yaw-000.png?url";
import shirokageFrontYaw004Url from "../assets/shirokage-car-frames/shirokage-front-yaw-004.png?url";
import shirokageRedYaw000Url from "../assets/shirokage-red-car-frames/shirokage-red-yaw-000.png?url";
import shirokageRedYaw004Url from "../assets/shirokage-red-car-frames/shirokage-red-yaw-004.png?url";
import shirokageRedFrontYaw000Url from "../assets/shirokage-red-car-frames/shirokage-red-front-yaw-000.png?url";
import shirokageRedFrontYaw004Url from "../assets/shirokage-red-car-frames/shirokage-red-front-yaw-004.png?url";
import hibanaRsYaw000Url from "../assets/hibana-rs-car-frames/hibana-rs-yaw-000.png?url";
import hibanaRsYaw004Url from "../assets/hibana-rs-car-frames/hibana-rs-yaw-004.png?url";
import hibanaRsFrontYaw000Url from "../assets/hibana-rs-car-frames/hibana-rs-front-yaw-000.png?url";
import hibanaRsFrontYaw004Url from "../assets/hibana-rs-car-frames/hibana-rs-front-yaw-004.png?url";
import aonamiGtYaw000Url from "../assets/aonami-gt-car-frames/aonami-gt-yaw-000.png?url";
import aonamiGtYaw004Url from "../assets/aonami-gt-car-frames/aonami-gt-yaw-004.png?url";
import aonamiGtFrontYaw000Url from "../assets/aonami-gt-car-frames/aonami-gt-front-yaw-000.png?url";
import aonamiGtFrontYaw004Url from "../assets/aonami-gt-car-frames/aonami-gt-front-yaw-004.png?url";
import kageroVxYaw000Url from "../assets/kagero-vx-car-frames/kagero-vx-yaw-000.png?url";
import kageroVxYaw004Url from "../assets/kagero-vx-car-frames/kagero-vx-yaw-004.png?url";
import kageroVxFrontYaw000Url from "../assets/kagero-vx-car-frames/kagero-vx-front-yaw-000.png?url";
import kageroVxFrontYaw004Url from "../assets/kagero-vx-car-frames/kagero-vx-front-yaw-004.png?url";
import reimeiXrYaw000Url from "../assets/reimei-xr-car-frames/reimei-xr-yaw-000.png?url";
import reimeiXrYaw004Url from "../assets/reimei-xr-car-frames/reimei-xr-yaw-004.png?url";
import reimeiXrFrontYaw000Url from "../assets/reimei-xr-car-frames/reimei-xr-front-yaw-000.png?url";
import reimeiXrFrontYaw004Url from "../assets/reimei-xr-car-frames/reimei-xr-front-yaw-004.png?url";
import { carColorHex, type CarColorId } from "./multiplayer/playerProfile";

interface TrafficVehicleFrames {
  /** Straight-on rear view for traffic in the player's lane. */
  readonly straight: HTMLImageElement;
  /** Slight quarter-turn for traffic in a different lane. */
  readonly quarter: HTMLImageElement;
  /** Straight-on front view for the rear-view mirror. */
  readonly frontStraight: HTMLImageElement;
  /** Slight front quarter-turn for the rear-view mirror. */
  readonly frontQuarter: HTMLImageElement;
}

export interface TrafficAssets {
  readonly sedan: TrafficVehicleFrames & {
    /** Wider quarter-turn (08°). Reserved for the far/close yaw swap, currently unused. */
    readonly close: HTMLImageElement;
  };
  readonly truck: TrafficVehicleFrames;
  readonly shirokage: TrafficVehicleFrames;
  readonly shirokageRed: TrafficVehicleFrames;
  readonly hibanaRs: TrafficVehicleFrames;
  readonly aonamiGt: TrafficVehicleFrames;
  readonly kageroVx: TrafficVehicleFrames;
  /** Player car views, preloaded for future replays, multiplayer, and garage UI. */
  readonly reimeiXr: TrafficVehicleFrames;
}

function imageFromUrl(url: string): HTMLImageElement {
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  return image;
}

export function createTrafficAssets(): TrafficAssets {
  return {
    sedan: {
      straight: imageFromUrl(yaw000Url),
      quarter: imageFromUrl(yaw004Url),
      close: imageFromUrl(yaw008Url),
      frontStraight: imageFromUrl(frontYaw000Url),
      frontQuarter: imageFromUrl(frontYaw004Url)
    },
    truck: {
      straight: imageFromUrl(truckYaw000Url),
      quarter: imageFromUrl(truckYaw004Url),
      frontStraight: imageFromUrl(truckFrontYaw000Url),
      frontQuarter: imageFromUrl(truckFrontYaw004Url)
    },
    shirokage: {
      straight: imageFromUrl(shirokageYaw000Url),
      quarter: imageFromUrl(shirokageYaw004Url),
      frontStraight: imageFromUrl(shirokageFrontYaw000Url),
      frontQuarter: imageFromUrl(shirokageFrontYaw004Url)
    },
    shirokageRed: {
      straight: imageFromUrl(shirokageRedYaw000Url),
      quarter: imageFromUrl(shirokageRedYaw004Url),
      frontStraight: imageFromUrl(shirokageRedFrontYaw000Url),
      frontQuarter: imageFromUrl(shirokageRedFrontYaw004Url)
    },
    hibanaRs: {
      straight: imageFromUrl(hibanaRsYaw000Url),
      quarter: imageFromUrl(hibanaRsYaw004Url),
      frontStraight: imageFromUrl(hibanaRsFrontYaw000Url),
      frontQuarter: imageFromUrl(hibanaRsFrontYaw004Url)
    },
    aonamiGt: {
      straight: imageFromUrl(aonamiGtYaw000Url),
      quarter: imageFromUrl(aonamiGtYaw004Url),
      frontStraight: imageFromUrl(aonamiGtFrontYaw000Url),
      frontQuarter: imageFromUrl(aonamiGtFrontYaw004Url)
    },
    kageroVx: {
      straight: imageFromUrl(kageroVxYaw000Url),
      quarter: imageFromUrl(kageroVxYaw004Url),
      frontStraight: imageFromUrl(kageroVxFrontYaw000Url),
      frontQuarter: imageFromUrl(kageroVxFrontYaw004Url)
    },
    reimeiXr: {
      straight: imageFromUrl(reimeiXrYaw000Url),
      quarter: imageFromUrl(reimeiXrYaw004Url),
      frontStraight: imageFromUrl(reimeiXrFrontYaw000Url),
      frontQuarter: imageFromUrl(reimeiXrFrontYaw004Url)
    }
  };
}

export function imageReady(image: HTMLImageElement): boolean {
  return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
}

const tintedReimeiCache = new WeakMap<HTMLImageElement, Map<string, HTMLCanvasElement>>();

function hexRgb(hex: string): readonly [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16)
  ];
}

function recoloredChannel(base: number, reference: number, sourceLuma: number): number {
  const shade = Math.max(0.24, Math.min(1.5, sourceLuma / reference));
  return Math.max(0, Math.min(255, Math.round(base * shade)));
}

/**
 * Builds a cached runtime colorway from the canonical cobalt/gold sprite.
 * Geometry, glass, lamps, tires, and authored shading remain untouched.
 */
export function tintedReimeiFrame(
  image: HTMLImageElement,
  mainColor: CarColorId,
  accentColor: CarColorId
): CanvasImageSource {
  if (!imageReady(image)) {
    return image;
  }
  const key = `${mainColor}:${accentColor}`;
  let imageCache = tintedReimeiCache.get(image);
  if (!imageCache) {
    imageCache = new Map();
    tintedReimeiCache.set(image, imageCache);
  }
  const cached = imageCache.get(key);
  if (cached) {
    return cached;
  }

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return image;
  }
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const main = hexRgb(carColorHex(mainColor));
  const accent = hexRgb(carColorHex(accentColor));
  for (let offset = 0; offset < pixels.data.length; offset += 4) {
    const red = pixels.data[offset]!;
    const green = pixels.data[offset + 1]!;
    const blue = pixels.data[offset + 2]!;
    const isBody = blue > 54 && blue > red * 1.2 && blue > green * 1.22;
    const isAccent = red > 74 && green > 56 && green > blue * 1.35 && red / Math.max(1, green) < 1.58;
    if (!isBody && !isAccent) {
      continue;
    }
    const sourceLuma = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    const target = isBody ? main : accent;
    const referenceLuma = isBody ? 91 : 164;
    pixels.data[offset] = recoloredChannel(target[0], referenceLuma, sourceLuma);
    pixels.data[offset + 1] = recoloredChannel(target[1], referenceLuma, sourceLuma);
    pixels.data[offset + 2] = recoloredChannel(target[2], referenceLuma, sourceLuma);
  }
  context.putImageData(pixels, 0, 0);
  imageCache.set(key, canvas);
  return canvas;
}
