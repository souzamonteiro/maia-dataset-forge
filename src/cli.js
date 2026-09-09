#!/usr/bin/env node
import fs from "node:fs";
if (fs.existsSync(".env")) {
  for (const l of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = l.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
import { setThermalGuard } from "./lib/ollama.js";
import { createStepCoolingGuard } from "./lib/thermal.js";
setThermalGuard(createStepCoolingGuard());
const cmd = process.argv[2] || "help";
const map = {
  "batch-pilot": () =>
    import("./pipeline/batch-pilot.js").then((m) => m.batchPilot()),
  "benchmark-cost": () =>
    import("./pipeline/benchmark-cost.js").then((m) =>
      m.benchmarkCost(process.argv[3]),
    ),
  "recheck-evidence": () =>
    import("./pipeline/recheck-evidence.js").then((m) =>
      m.recheckEvidence(process.argv[3], process.argv[4]),
    ),
  "prepare-benchmark": () =>
    import("./pipeline/prepare-benchmark.js").then((m) => m.prepareBenchmark()),
  benchmark: () => import("./pipeline/benchmark.js").then((m) => m.benchmark()),
  check: () => import("./pipeline/check.js").then((m) => m.check()),
  cleanup: () =>
    import("./pipeline/cleanup.js").then((m) =>
      m.cleanup({ apply: process.argv.includes("--apply") }),
    ),
  discover: () => import("./pipeline/discover.js").then((m) => m.discover()),
  download: () =>
    import("./pipeline/download.js").then((m) => m.downloadPapers()),
  extract: () => import("./pipeline/extract.js").then((m) => m.extract()),
  generate: () => import("./pipeline/generate.js").then((m) => m.generate()),
  validate: () => import("./pipeline/validate.js").then((m) => m.validate()),
  export: () => import("./pipeline/export.js").then((m) => m.exportDataset()),
};
try {
  if (cmd === "pipeline") {
    for (const x of [
      "check",
      "discover",
      "download",
      "extract",
      "generate",
      "validate",
      "export",
    ])
      await map[x]();
  } else if (map[cmd]) await map[cmd]();
  else
    console.log(
      "Usage: node src/cli.js <discover|download|extract|generate|validate|export|pipeline|check|cleanup [--apply]>",
    );
} catch (error) {
  console.error(`Maia Dataset Forge: ${error.message}`);
  process.exitCode = 1;
}
