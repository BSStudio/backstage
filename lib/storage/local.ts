import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AvatarStorage } from "./types";

export class LocalAvatarStorage implements AvatarStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolve(filename: string): string {
    const full = path.join(this.root, filename);
    if (full !== this.root && !full.startsWith(this.root + path.sep)) {
      throw new Error("Invalid file path");
    }
    return full;
  }

  async put(
    filename: string,
    buffer: Buffer,
    _contentType: string,
  ): Promise<void> {
    const full = this.resolve(filename);
    await mkdir(this.root, { recursive: true });
    await writeFile(full, buffer);
  }

  async remove(filename: string): Promise<void> {
    const full = this.resolve(filename);
    try {
      await unlink(full);
    } catch {
      // File may not exist
    }
  }

  async fetch(
    filename: string,
  ): Promise<{ body: Uint8Array; contentType: string } | null> {
    const full = this.resolve(filename);
    try {
      const buf = await readFile(full);
      return { body: new Uint8Array(buf), contentType: "image/webp" };
    } catch {
      return null;
    }
  }
}
