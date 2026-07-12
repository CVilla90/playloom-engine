// Red Project Shirokage keeps the same geometry as the canonical car and
// changes only the generated material palette/output names for rival use.
process.argv.push("--variant=shirokage-red");
await import("./generate-traffic-car-sprites.mjs");
