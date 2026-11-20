import { z } from "zod";
import {
  Prisma,
  type PrismaClient,
  type ShortLink,
} from "@/app/generated/prisma/client";
import { readShortLinkClicks } from "@/lib/cloudflare/analytics";
import {
  CloudflareError,
  isCloudflareConfigured,
} from "@/lib/cloudflare/client";
import { deleteKvKeys, listKvKeys, putKvPairs } from "@/lib/cloudflare/kv";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/observability/logger";
import {
  type Actor,
  ensureCanAdminister,
  ensureCanManageShortLinks,
  ensureCanViewAdminArea,
} from "@/lib/permissions";
import { shortLinkBaseUrl } from "@/lib/short-link-config";
import {
  createShortLinkSchema,
  updateShortLinkSchema,
} from "./short-link-schemas";

export type {
  CreateShortLinkInput,
  UpdateShortLinkInput,
} from "./short-link-schemas";
export {
  createShortLinkSchema,
  shortLinkFormSchema,
  updateShortLinkSchema,
} from "./short-link-schemas";

export interface ShortLinkResult {
  link: ShortLink;
  syncErrors: string[];
}

function fieldError(field: string, message: string): ValidationError {
  return new ValidationError(
    { errors: [], properties: { [field]: { errors: [message] } } },
    message,
  );
}

function notConfigured(): ValidationError {
  return fieldError("config", "A rövid linkek publikálása nincs beállítva");
}

// An unconfigured Cloudflare is not a failure: the row saves and reads as unpublished, the
// same way an unconfigured target records a SKIPPED sync job.
async function publish(
  prisma: PrismaClient,
  link: ShortLink,
): Promise<ShortLinkResult> {
  if (!isCloudflareConfigured()) return { link, syncErrors: [] };
  try {
    await putKvPairs([{ key: link.slug, value: link.url }]);
  } catch (error) {
    if (error instanceof CloudflareError) {
      return { link, syncErrors: [error.message] };
    }
    throw error;
  }
  const { count } = await prisma.shortLink.updateMany({
    where: { slug: link.slug },
    data: { publishedUrl: link.url },
  });
  // Deleted while the write was in flight: take back the key it just put.
  if (count === 0) return { link, syncErrors: await unpublish(link.slug) };
  return { link: { ...link, publishedUrl: link.url }, syncErrors: [] };
}

async function unpublish(slug: string): Promise<string[]> {
  if (!isCloudflareConfigured()) return [];
  try {
    await deleteKvKeys([slug]);
    return [];
  } catch (error) {
    if (error instanceof CloudflareError) return [error.message];
    throw error;
  }
}

export async function listShortLinks(prisma: PrismaClient, actor: Actor) {
  ensureCanViewAdminArea(actor);
  return prisma.shortLink.findMany({ orderBy: { createdAt: "desc" } });
}

// Null when Cloudflare will not say: an unknown count is a blank cell, not an incident — the
// same call the calendar makes.
export async function getShortLinkClicks(
  actor: Actor,
): Promise<Record<string, number> | null> {
  ensureCanViewAdminArea(actor);
  try {
    return await readShortLinkClicks();
  } catch (error) {
    logger.warn("short_link_clicks_read_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function createShortLink(
  prisma: PrismaClient,
  input: unknown,
  actor: Actor,
): Promise<ShortLinkResult> {
  ensureCanManageShortLinks(actor);

  const parsed = createShortLinkSchema(shortLinkBaseUrl()).safeParse(input);
  if (!parsed.success) throw new ValidationError(z.treeifyError(parsed.error));

  const data = { ...parsed.data, note: parsed.data.note || null };

  const link = await prisma
    .$transaction(async (tx) => {
      const created = await tx.shortLink.create({
        data: { ...data, createdById: actor.id },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          targetLabel: data.slug,
          action: "SHORT_LINK_CREATED",
          diff: { created: data } as object,
        },
      });
      return created;
    })
    .catch((error) => {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw fieldError("slug", "Ez a végződés már foglalt");
      }
      throw error;
    });

  return publish(prisma, link);
}

export async function updateShortLink(
  prisma: PrismaClient,
  slug: string,
  input: unknown,
  actor: Actor,
): Promise<ShortLinkResult> {
  ensureCanManageShortLinks(actor);

  const link = await prisma.shortLink.findUnique({ where: { slug } });
  if (!link) throw new NotFoundError();

  const parsed = updateShortLinkSchema(shortLinkBaseUrl()).safeParse(input);
  if (!parsed.success) throw new ValidationError(z.treeifyError(parsed.error));

  const { note } = parsed.data;
  const data = {
    ...parsed.data,
    ...(note !== undefined && { note: note || null }),
  };

  const diff: Record<string, { old: unknown; new: unknown }> = {};
  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined && (link as Record<string, unknown>)[key] !== val) {
      diff[key] = { old: (link as Record<string, unknown>)[key], new: val };
    }
  }
  if (Object.keys(diff).length === 0) return { link, syncErrors: [] };

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.shortLink.update({ where: { slug }, data });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        targetLabel: slug,
        action: "SHORT_LINK_UPDATED",
        diff: diff as object,
      },
    });
    return row;
  });

  // Only the target reaches KV, so a note-only edit has nothing to push.
  if (!diff.url) return { link: updated, syncErrors: [] };

  return publish(prisma, updated);
}

export async function deleteShortLink(
  prisma: PrismaClient,
  slug: string,
  actor: Actor,
): Promise<{ deleted: true; syncErrors: string[] }> {
  ensureCanManageShortLinks(actor);

  const link = await prisma.shortLink.findUnique({ where: { slug } });
  if (!link) throw new NotFoundError();

  await prisma.$transaction(async (tx) => {
    await tx.shortLink.delete({ where: { slug } });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        targetLabel: slug,
        action: "SHORT_LINK_DELETED",
        diff: { url: { old: link.url, new: null } } as object,
      },
    });
  });

  return { deleted: true, syncErrors: await unpublish(slug) };
}

export async function publishShortLink(
  prisma: PrismaClient,
  slug: string,
  actor: Actor,
): Promise<ShortLinkResult> {
  ensureCanManageShortLinks(actor);

  if (!isCloudflareConfigured()) throw notConfigured();

  const link = await prisma.shortLink.findUnique({ where: { slug } });
  if (!link) throw new NotFoundError();

  return publish(prisma, link);
}

export async function republishShortLinks(
  prisma: PrismaClient,
  actor: Actor,
): Promise<{ links: number; removed: number }> {
  ensureCanAdminister(actor);

  if (!isCloudflareConfigured()) throw notConfigured();

  // Keys before rows, so a link created in between is written rather than taken for a stray.
  const keys = await listKvKeys();
  const links = await prisma.shortLink.findMany({
    orderBy: { createdAt: "asc" },
  });

  const wanted = new Set(links.map((link) => link.slug));
  const strays = keys.filter((key) => !wanted.has(key));

  await putKvPairs(links.map((link) => ({ key: link.slug, value: link.url })));

  // Re-read after the put: a link deleted since had its key put back above, and a stray may
  // have become a link.
  const remaining = new Set(
    (await prisma.shortLink.findMany({ select: { slug: true } })).map(
      (link) => link.slug,
    ),
  );
  const orphans = strays.filter((key) => !remaining.has(key));
  const deleted = links
    .map((link) => link.slug)
    .filter((slug) => !remaining.has(slug));
  await deleteKvKeys([...orphans, ...deleted]);

  // updateMany rather than update: a row deleted since the read is not an error here.
  await prisma.$transaction(
    links.map((link) =>
      prisma.shortLink.updateMany({
        where: { slug: link.slug },
        data: { publishedUrl: link.url },
      }),
    ),
  );

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      targetLabel: "Rövid linkek",
      action: "SHORT_LINK_FULL_SYNC",
      diff: { links: links.length, removed: orphans.length } as object,
    },
  });

  return { links: links.length, removed: orphans.length };
}
