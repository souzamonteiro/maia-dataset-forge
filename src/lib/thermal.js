import fs from "node:fs/promises";
import { readJson, writeJson, exists } from "./io.js";

export async function cpuTemperature() {
  const values = [];
  for (const entry of await fs.readdir("/sys/class/hwmon")) {
    const dir = `/sys/class/hwmon/${entry}`;
    const name = (await fs.readFile(`${dir}/name`, "utf8")).trim();
    if (!["k10temp", "coretemp", "zenpower"].includes(name)) continue;
    for (const file of await fs.readdir(dir)) {
      if (!/^temp\d+_input$/.test(file)) continue;
      const value =
        Number((await fs.readFile(`${dir}/${file}`, "utf8")).trim()) / 1000;
      if (!Number.isFinite(value) || value <= 0 || value > 125)
        throw new Error("Invalid CPU temperature sensor");
      values.push(value);
    }
  }
  if (!values.length)
    throw new Error("No supported CPU sensor; inference stopped");
  return Math.max(...values);
}

export function createThermalGuard({
  read = cpuTemperature,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  intervalMs = 1000,
  statePath = "data/logs/thermal-state.json",
  eventPath = "data/logs/thermal-events.jsonl",
} = {}) {
  let baseline;
  let cooling = false;
  const log = async (event, temperature) => {
    const row = {
      time: new Date().toISOString(),
      event,
      temperature,
      baseline,
      limit: 95,
    };
    console.log(
      `[thermal] ${event}: ${temperature} °C; resume at ${baseline} °C`,
    );
    await fs.appendFile(eventPath, JSON.stringify(row) + "\n");
  };
  const initialize = async () => {
    if (baseline !== undefined) return;
    const temperature = await read();
    if (await exists(statePath)) {
      const state = await readJson(statePath);
      baseline = state.baseline;
      cooling = state.cooling === true;
    } else {
      if (temperature > 85)
        throw new Error(
          "CPU above 85 °C: let it cool before recording the initial temperature",
        );
      baseline = temperature;
      await writeJson(statePath, {
        baseline,
        limit: 95,
        cooling: false,
        createdAt: new Date().toISOString(),
      });
    }
    if (!Number.isFinite(baseline) || baseline <= 0 || baseline > 85)
      throw new Error("Invalid saved thermal baseline");
  };
  const save = () =>
    writeJson(statePath, {
      baseline,
      limit: 95,
      cooling,
      updatedAt: new Date().toISOString(),
    });
  const waitForCooling = async () => {
    let temperature = await read();
    if (temperature >= 95) {
      cooling = true;
      await save();
    }
    if (!cooling) return;
    await log("cooling", temperature);
    while (temperature > baseline) {
      await sleep(intervalMs);
      temperature = await read();
    }
    cooling = false;
    await save();
    await log("resuming", temperature);
  };
  return async (operation) => {
    await initialize();
    for (;;) {
      await waitForCooling();
      const controller = new AbortController();
      let done = false,
        fault,
        hot = false;
      const monitor = (async () => {
        while (!done) {
          await sleep(intervalMs);
          if (done) return;
          try {
            const temperature = await read();
            if (temperature >= 95) {
              hot = true;
              cooling = true;
              controller.abort(new Error("Thermal limit reached"));
              await save();
              await log("paused", temperature);
              return;
            }
          } catch (error) {
            fault = error;
            controller.abort(error);
            return;
          }
        }
      })();
      let result, failure;
      try {
        result = await operation(controller.signal);
      } catch (error) {
        failure = error;
      } finally {
        done = true;
        await monitor;
      }
      if (fault) throw fault;
      if (hot) continue;
      if (failure) throw failure;
      return result;
    }
  };
}

// Complete each call, but cool before starting the next one. No thermal retries.
export function createStepCoolingGuard({
  read = cpuTemperature,
  intervalMs = 1000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  eventPath = "data/logs/thermal-steps.jsonl",
} = {}) {
  return async (operation) => {
    await fs.mkdir((await import("node:path")).dirname(eventPath), {
      recursive: true,
    });
    const started = Date.now();
    let temperature = await read();
    if (temperature > 60)
      console.log(`[thermal] cooling from ${temperature} °C to <=60 °C`);
    let lastCoolingLog = Date.now();
    while (temperature > 60) {
      await sleep(intervalMs);
      temperature = await read();
      if (Date.now() - lastCoolingLog >= 30000) {
        console.log(
          `[thermal] still cooling: ${temperature} °C; target <=60 °C`,
        );
        lastCoolingLog = Date.now();
      }
    }
    const row = {
      startedAt: new Date().toISOString(),
      initialC: temperature,
      maxC: temperature,
      waitMs: Date.now() - started,
      policy: "cool-before-60-monitor-only",
    };
    console.log(`[thermal] starting at ${temperature} °C`);
    const begin = Date.now();
    const controller = new AbortController();
    let done = false,
      fault,
      warned = false;
    const monitor = (async () => {
      while (!done) {
        await sleep(intervalMs);
        if (done) break;
        try {
          const value = await read();
          row.maxC = Math.max(row.maxC, value);
          if (value >= 95 && !warned) {
            warned = true;
            console.log(
              `[thermal] ${value} °C reached; completing current call, then cooling`,
            );
          }
        } catch (error) {
          fault = error;
          controller.abort(error);
          break;
        }
      }
    })();
    try {
      const result = await operation(controller.signal);
      if (fault) throw fault;
      return result;
    } finally {
      done = true;
      await monitor;
      row.callMs = Date.now() - begin;
      row.finalC = await read();
      row.maxC = Math.max(row.maxC, row.finalC);
      if (fault) row.sensorError = fault.message;
      await fs.appendFile(eventPath, JSON.stringify(row) + "\n");
      console.log(
        `[thermal] completed: ${row.finalC} °C; sampled maximum ${row.maxC} °C; ${(row.callMs / 1000).toFixed(1)} s`,
      );
    }
  };
}
