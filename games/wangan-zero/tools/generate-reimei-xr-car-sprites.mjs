// Reimei XR uses the shared projection pipeline with a long low nose,
// rear-set teardrop canopy, broad shoulders, and an opaque cobalt/gold palette.
process.argv.push("--variant=reimei-xr");
await import("./generate-traffic-car-sprites.mjs");
