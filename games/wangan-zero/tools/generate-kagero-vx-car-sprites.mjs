// Kagero VX uses the shared projection pipeline with a wide cab-forward
// mid-engine wedge, four-lamp nose, and vertical-bar rear light signature.
process.argv.push("--variant=kagero-vx");
await import("./generate-traffic-car-sprites.mjs");
