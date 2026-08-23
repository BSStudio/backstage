import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const DATA_DIR = join(import.meta.dirname, "..", "data");

export function dataPath(...segments: string[]): string {
  return join(DATA_DIR, ...segments);
}

export async function readJson<T>(relative: string): Promise<T> {
  return JSON.parse(await readFile(dataPath(relative), "utf8")) as T;
}

export async function readJsonIfExists<T>(relative: string): Promise<T | null> {
  if (!existsSync(dataPath(relative))) return null;
  return readJson<T>(relative);
}

export async function writeJson(
  relative: string,
  value: unknown,
): Promise<string> {
  const target = dataPath(relative);
  mkdirSync(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return target;
}

export async function readText(relative: string): Promise<string> {
  return readFile(dataPath(relative), "utf8");
}

export async function writeText(
  relative: string,
  contents: string,
): Promise<string> {
  const target = dataPath(relative);
  mkdirSync(dirname(target), { recursive: true });
  await writeFile(target, contents, "utf8");
  return target;
}
