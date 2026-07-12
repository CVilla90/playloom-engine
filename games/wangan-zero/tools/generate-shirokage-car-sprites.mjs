// Project Shirokage keeps the proven traffic-car geometry and render pipeline.
// Its restrained 1980s compact-coupe cues are selected through this variant.
process.argv.push("--variant=shirokage");
await import("./generate-traffic-car-sprites.mjs");
