import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { AvatarStorage } from "./types";

export interface S3Options {
  region: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export class S3AvatarStorage implements AvatarStorage {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly prefix: string;

  constructor(bucket: string, prefix: string, options: S3Options) {
    this.bucket = bucket;
    this.prefix = prefix.replace(/^\/+|\/+$/g, "");
    this.client = new S3Client({
      region: options.region,
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      ...(options.forcePathStyle ? { forcePathStyle: true } : {}),
      ...(options.accessKeyId && options.secretAccessKey
        ? {
            credentials: {
              accessKeyId: options.accessKeyId,
              secretAccessKey: options.secretAccessKey,
            },
          }
        : {}),
    });
  }

  private key(filename: string): string {
    return this.prefix ? `${this.prefix}/${filename}` : filename;
  }

  async put(
    filename: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.key(filename),
        Body: buffer,
        ContentType: contentType,
      }),
    );
  }

  async remove(filename: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: this.key(filename),
      }),
    );
  }

  async fetch(
    filename: string,
  ): Promise<{ body: Uint8Array; contentType: string } | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: this.key(filename),
        }),
      );
      if (!res.Body) return null;
      const body = await res.Body.transformToByteArray();
      return { body, contentType: res.ContentType ?? "image/webp" };
    } catch (err) {
      const code =
        (err as { name?: string }).name ??
        (err as { Code?: string }).Code ??
        "";
      if (
        code === "NoSuchKey" ||
        code === "NotFound" ||
        (err as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode === 404
      ) {
        return null;
      }
      throw err;
    }
  }
}
