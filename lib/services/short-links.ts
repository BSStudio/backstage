import { z } from "zod";
import type { PrismaClient, ShortLink } from "@/app/generated/prisma/client";
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
import { shortLinkHost } from "@/lib/short-link-config";
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
  return new ValidationError({
    errors: [],
    properties: { [field]: { errors: [message] } },
  });
}

// An unconfigured Cloudflare is not a failure: the row saves and reads as unpublished, the
// same way an unconfigured target records a SKIPPED sync job.
async function publish(
  prisma: PrismaClient,
  slug: string,
  url: string,
): Promise<{ syncErrors: string[]; publishedAt: Date | null }> {
  if (!isCloudflareConfigured()) return { syncErrors: [], publishedAt: null };
  try {
    await putKvPairs([{ key: slug, value: url }]);
    const publishedAt = new Date();
    await prisma.shortLink.update({ where: { slug }, data: { publishedAt } });
    return { syncErrors: [], publishedAt };
  } catch (error) {
    if (error instanceof CloudflareError) {
      return { syncErrors: [error.message], publishedAt: null };
    }
    throw error;
  }
}

function withPublishedAt(link: ShortLink, publishedAt: Date | null): ShortLink {
  return publishedAt ? { ...link, publishedAt } : link;
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

// A missing click count is a blank column, not an incident — the same call the calendar makes.
export async function getShortLinkClicks(
  actor: Actor,
): Promise<Record<string, number>> {
  ensureCanViewAdminArea(actor);
  try {
    return await readShortLinkClicks();
  } catch (error) {
    logger.warn("short_link_clicks_read_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
}

export async function createShortLink(
  prisma: PrismaClient,
  input: unknown,
  actor: Actor,
): Promise<ShortLinkResult> {
  ensureCanManageShortLinks(actor);

  const parsed = createShortLinkSchema(shortLinkHost()).safeParse(input);
  if (!parsed.success) throw new ValidationError(z.treeifyError(parsed.error));

  const data = { ...parsed.data, note: parsed.data.note || null };

  const clash = await prisma.shortLink.findUnique({
    where: { slug: data.slug },
  });
  if (clash) throw fieldError("slug", "Ez a rövidítés már létezik");

  const link = await prisma.$transaction(async (tx) => {
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
  });

  const { syncErrors, publishedAt } = await publish(
    prisma,
    link.slug,
    link.url,
  );
  return { link: withPublishedAt(link, publishedAt), syncErrors };
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

  const parsed = updateShortLinkSchema(shortLinkHost()).safeParse(input);
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

  const { syncErrors, publishedAt } = await publish(
    prisma,
    updated.slug,
    updated.url,
  );
  return { link: withPublishedAt(updated, publishedAt), syncErrors };
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

  const link = await prisma.shortLink.findUnique({ where: { slug } });
  if (!link) throw new NotFoundError();

  const { syncErrors, publishedAt } = await publish(
    prisma,
    link.slug,
    link.url,
  );
  return { link: withPublishedAt(link, publishedAt), syncErrors };
}

export async function republishShortLinks(
  prisma: PrismaClient,
  actor: Actor,
): Promise<{ links: number; removed: number }> {
  ensureCanAdminister(actor);

  if (!isCloudflareConfigured()) {
    throw fieldError("config", "A rövid linkek publikálása nincs beállítva");
  }

  const links = await prisma.shortLink.findMany({
    orderBy: { createdAt: "asc" },
  });

  const wanted = new Set(links.map((link) => link.slug));
  const strays = (await listKvKeys()).filter((key) => !wanted.has(key));

  await putKvPairs(links.map((link) => ({ key: link.slug, value: link.url })));
  await deleteKvKeys(strays);

  await prisma.shortLink.updateMany({ data: { publishedAt: new Date() } });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      targetLabel: "Rövid linkek",
      action: "SHORT_LINK_FULL_SYNC",
      diff: { links: links.length, removed: strays.length } as object,
    },
  });

  return { links: links.length, removed: strays.length };
}
