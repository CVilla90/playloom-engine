import backupTankUrl from "../assets/svg/backup-tank.svg?url";
import cavePlantUrl from "../assets/svg/cave-plant.svg?url";
import depthGaugeUrl from "../assets/svg/depth-gauge.svg?url";
import diverBodyUrl from "../assets/svg/diver-body.svg?url";
import finsFastUrl from "../assets/svg/fins-fast.svg?url";
import finsStandardUrl from "../assets/svg/fins-standard.svg?url";
import flashlightUrl from "../assets/svg/flashlight.svg?url";
import limestoneShelfUrl from "../assets/svg/limestone-shelf.svg?url";
import mineralVeinUrl from "../assets/svg/mineral-vein.svg?url";
import rockClusterUrl from "../assets/svg/rock-cluster.svg?url";
import tankDoubleUrl from "../assets/svg/tank-double.svg?url";
import tankSingleUrl from "../assets/svg/tank-single.svg?url";

export interface DiveAssets {
  readonly diverBody: HTMLImageElement;
  readonly tankSingle: HTMLImageElement;
  readonly tankDouble: HTMLImageElement;
  readonly backupTank: HTMLImageElement;
  readonly finsStandard: HTMLImageElement;
  readonly finsFast: HTMLImageElement;
  readonly flashlight: HTMLImageElement;
  readonly depthGauge: HTMLImageElement;
  readonly cavePlant: HTMLImageElement;
  readonly rockCluster: HTMLImageElement;
  readonly mineralVein: HTMLImageElement;
  readonly limestoneShelf: HTMLImageElement;
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

export async function loadDiveAssets(): Promise<DiveAssets> {
  const [
    diverBody,
    tankSingle,
    tankDouble,
    backupTank,
    finsStandard,
    finsFast,
    flashlight,
    depthGauge,
    cavePlant,
    rockCluster,
    mineralVein,
    limestoneShelf
  ] = await Promise.all([
    loadImage(diverBodyUrl),
    loadImage(tankSingleUrl),
    loadImage(tankDoubleUrl),
    loadImage(backupTankUrl),
    loadImage(finsStandardUrl),
    loadImage(finsFastUrl),
    loadImage(flashlightUrl),
    loadImage(depthGaugeUrl),
    loadImage(cavePlantUrl),
    loadImage(rockClusterUrl),
    loadImage(mineralVeinUrl),
    loadImage(limestoneShelfUrl)
  ]);

  return {
    diverBody,
    tankSingle,
    tankDouble,
    backupTank,
    finsStandard,
    finsFast,
    flashlight,
    depthGauge,
    cavePlant,
    rockCluster,
    mineralVein,
    limestoneShelf
  };
}
