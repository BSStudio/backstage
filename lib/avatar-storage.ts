import { avatarStorage } from "./storage/factory";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const FILENAME_RE = /^[a-zA-Z0-9_-]+-(square|portrait)\.webp$/;

// WebP magic bytes: "RIFF" at offset 0, "WEBP" at offset 8
function isWebP(buffer: Buffer): boolean {
  return (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  );
}

function isSafeId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

export async function saveAvatar(
  memberId: string,
  variant: "square" | "portrait",
  buffer: Buffer,
): Promise<string> {
  if (!isSafeId(memberId)) throw new Error("Invalid member ID");
  if (buffer.length > MAX_FILE_SIZE) throw new Error("File too large");
  if (!isWebP(buffer)) throw new Error("Invalid image format");

  const filename = `${memberId}-${variant}.webp`;
  await avatarStorage().put(filename, buffer, "image/webp");
  return `/avatars/${filename}`;
}

export async function deleteAvatars(memberId: string): Promise<void> {
  if (!isSafeId(memberId)) throw new Error("Invalid member ID");
  for (const variant of ["square", "portrait"] as const) {
    await avatarStorage().remove(`${memberId}-${variant}.webp`);
  }
}

export async function getAvatar(
  filename: string,
): Promise<{ body: Uint8Array; contentType: string } | null> {
  if (!FILENAME_RE.test(filename)) return null;
  return avatarStorage().fetch(filename);
}
