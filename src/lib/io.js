import fs from "node:fs/promises";
import path from "node:path";
import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}
export async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
export async function readJson(p) {
  return JSON.parse(await fs.readFile(p, "utf8"));
}
export async function atomicWrite(p, value) {
  await ensureDir(path.dirname(p));
  const temp = `${p}.${process.pid}.tmp`;
  await fs.writeFile(temp, value);
  await fs.rename(temp, p);
}
export async function writeJson(p, value) {
  await atomicWrite(p, JSON.stringify(value, null, 2));
}
export async function readJsonl(p) {
  if (!(await exists(p))) return [];
  return (await fs.readFile(p, "utf8"))
    .split("\n")
    .filter((x) => x.trim())
    .map(JSON.parse);
}
export async function writeJsonl(p, rows) {
  await atomicWrite(
    p,
    rows.map((x) => JSON.stringify(x)).join("\n") + (rows.length ? "\n" : ""),
  );
}
export async function appendJsonl(p, value) {
  await writeJsonl(p, [...(await readJsonl(p)), value]);
}
export async function readText(p) {
  const bytes = await fs.readFile(p);
  return (p.endsWith(".gz") ? await promisify(gunzip)(bytes) : bytes).toString(
    "utf8",
  );
}
export async function writeText(p, text) {
  await atomicWrite(p, await promisify(gzip)(text));
}
export function slug(s) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}
