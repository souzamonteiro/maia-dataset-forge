import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createThermalGuard } from "../src/lib/thermal.js";
test("thermal limit cancels current request, cools to baseline and retries", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-thermal-"));
  try {
    const readings = [50, 50, 95, 70, 50];
    const statePath = path.join(dir, "state.json");
    const guard = createThermalGuard({
      read: async () => readings.shift() ?? 50,
      intervalMs: 1,
      statePath,
      eventPath: path.join(dir, "events.jsonl"),
    });
    let attempts = 0;
    const value = await guard((signal) => {
      attempts++;
      if (attempts === 2) return Promise.resolve("complete");
      return new Promise((resolve, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        }),
      );
    });
    assert.equal(value, "complete");
    assert.equal(attempts, 2);
    const state = JSON.parse(await fs.readFile(statePath, "utf8"));
    assert.equal(state.baseline, 50);
    assert.equal(state.cooling, false);
    assert.match(
      await fs.readFile(path.join(dir, "events.jsonl"), "utf8"),
      /paused/,
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("hot initialization and unavailable sensors prevent inference", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-thermal-"));
  try {
    for (const read of [
      async () => 96,
      async () => {
        throw new Error("sensor missing");
      },
    ]) {
      const guard = createThermalGuard({
        read,
        statePath: path.join(dir, "state.json"),
      });
      await assert.rejects(guard(() => assert.fail("must not run")));
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
