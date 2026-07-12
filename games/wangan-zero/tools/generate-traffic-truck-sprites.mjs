// The truck uses the proven traffic renderer with a separate, simple solid model.
process.argv.push("--variant=truck");
await import("./generate-traffic-car-sprites.mjs");
