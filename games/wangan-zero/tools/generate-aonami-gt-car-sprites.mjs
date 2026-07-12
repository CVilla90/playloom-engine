// Aonami GT uses the shared projection and raster pipeline with dedicated
// low, wide grand-tourer geometry and an opaque teal/graphite material set.
process.argv.push("--variant=aonami-gt");
await import("./generate-traffic-car-sprites.mjs");
