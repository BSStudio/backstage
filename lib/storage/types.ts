export interface AvatarStorage {
  put(filename: string, buffer: Buffer, contentType: string): Promise<void>;
  remove(filename: string): Promise<void>;
  fetch(
    filename: string,
  ): Promise<{ body: Uint8Array; contentType: string } | null>;
}
