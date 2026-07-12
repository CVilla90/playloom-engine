// The police interceptor reuses the shared projection pipeline on the generic
// sedan geometry, adding the patrol two-tone livery, door decals, and the
// red/blue roof light bar.
process.argv.push("--variant=police");
await import("./generate-traffic-car-sprites.mjs");
