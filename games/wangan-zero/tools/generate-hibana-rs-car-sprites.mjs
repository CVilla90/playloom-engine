// Hibana RS uses the shared projection pipeline with compact liftback geometry,
// stable segmented body panels, and an opaque ember-orange material set.
process.argv.push("--variant=hibana-rs");
await import("./generate-traffic-car-sprites.mjs");
