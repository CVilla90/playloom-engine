import { execSync } from "node:child_process";

const steps = [
  { name: "manifest + boundary validation", command: "npm run validate" },
  { name: "type-check", command: "npm run check" },
  { name: "tests", command: "npm run test" },
  { name: "production build", command: "npm run build" }
];

for (const step of steps) {
  console.log(`\n[smoke] ${step.name}`);
  execSync(step.command, { stdio: "inherit" });
}

console.log("\n[smoke] All checks passed.");
