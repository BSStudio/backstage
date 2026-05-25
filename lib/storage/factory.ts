import { LocalAvatarStorage } from "./local";
import { S3AvatarStorage } from "./s3";
import type { AvatarStorage } from "./types";

const LOCAL_ROOT = "./storage/avatars";
const S3_PREFIX = "avatars";

let cached: AvatarStorage | null = null;

export function avatarStorage(): AvatarStorage {
  if (cached) return cached;
  const backend = process.env.AVATAR_STORAGE ?? "local";

  if (backend === "local") {
    cached = new LocalAvatarStorage(LOCAL_ROOT);
    return cached;
  }

  if (backend === "s3") {
    cached = new S3AvatarStorage(required("S3_BUCKET"), S3_PREFIX, {
      region: required("S3_REGION"),
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    });
    return cached;
  }

  throw new Error(`Unknown AVATAR_STORAGE backend: ${backend}`);
}

export function resetAvatarStorageCache(): void {
  cached = null;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required when AVATAR_STORAGE=s3`);
  return value;
}
