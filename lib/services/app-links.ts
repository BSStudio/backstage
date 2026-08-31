import { z } from "zod";
import type { PrismaClient } from "@/app/generated/prisma/client";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { type Actor, ensureCanAdminister } from "@/lib/permissions";
import {
  CreateAppLinkSchema,
  MoveDirectionSchema,
  UpdateAppLinkSchema,
} from "./app-link-schemas";

export type {
  CreateAppLinkInput,
  UpdateAppLinkInput,
} from "./app-link-schemas";
export {
  AppLinkFormSchema,
  CreateAppLinkSchema,
  MoveDirectionSchema,
  UpdateAppLinkSchema,
} from "./app-link-schemas";

const ORDER = [{ sortOrder: "asc" }, { name: "asc" }] as const;

export async function listAppLinks(
  prisma: PrismaClient,
  { featuredOnly = false }: { featuredOnly?: boolean } = {},
) {
  return prisma.appLink.findMany({
    where: featuredOnly ? { featured: true } : undefined,
    orderBy: [...ORDER],
  });
}

export async function createAppLink(
  prisma: PrismaClient,
  input: unknown,
  actor: Actor,
) {
  ensureCanAdminister(actor);

  const parsed = CreateAppLinkSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(z.treeifyError(parsed.error));

  const data = {
    ...parsed.data,
    description: parsed.data.description || null,
  };

  // A new link lands at the end of the list; the admin moves it from there.
  const { _max } = await prisma.appLink.aggregate({
    _max: { sortOrder: true },
  });

  return prisma.$transaction(async (tx) => {
    const created = await tx.appLink.create({
      data: { ...data, sortOrder: (_max.sortOrder ?? -1) + 1 },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        targetLabel: data.name,
        action: "APP_LINK_CREATED",
        diff: { created: data } as object,
      },
    });
    return created;
  });
}

export async function updateAppLink(
  prisma: PrismaClient,
  id: string,
  input: unknown,
  actor: Actor,
) {
  ensureCanAdminister(actor);

  const link = await prisma.appLink.findUnique({ where: { id } });
  if (!link) throw new NotFoundError();

  const parsed = UpdateAppLinkSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(z.treeifyError(parsed.error));

  // An emptied description clears the field rather than storing "".
  const data = Object.fromEntries(
    Object.entries(parsed.data).map(([key, val]) => [
      key,
      val === "" ? null : val,
    ]),
  ) as typeof parsed.data;

  const diff: Record<string, { old: unknown; new: unknown }> = {};
  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined && (link as Record<string, unknown>)[key] !== val) {
      diff[key] = { old: (link as Record<string, unknown>)[key], new: val };
    }
  }

  if (Object.keys(diff).length === 0) return link;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.appLink.update({ where: { id }, data });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        targetLabel: data.name ?? link.name,
        action: "APP_LINK_UPDATED",
        diff: diff as object,
      },
    });
    return updated;
  });
}

export async function deleteAppLink(
  prisma: PrismaClient,
  id: string,
  actor: Actor,
) {
  ensureCanAdminister(actor);

  const link = await prisma.appLink.findUnique({ where: { id } });
  if (!link) throw new NotFoundError();

  await prisma.$transaction(async (tx) => {
    await tx.appLink.delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        targetLabel: link.name,
        action: "APP_LINK_DELETED",
        diff: { name: { old: link.name, new: null } } as object,
      },
    });
  });

  return { deleted: true };
}

/**
 * Swap a link with its neighbour. Every row is renumbered from the resulting order, so a
 * list that arrived with duplicate or gapped `sortOrder` values comes out contiguous.
 */
export async function moveAppLink(
  prisma: PrismaClient,
  id: string,
  direction: unknown,
  actor: Actor,
) {
  ensureCanAdminister(actor);

  const parsed = MoveDirectionSchema.safeParse(direction);
  if (!parsed.success) throw new ValidationError(z.treeifyError(parsed.error));

  const links = await prisma.appLink.findMany({ orderBy: [...ORDER] });
  const index = links.findIndex((link) => link.id === id);
  if (index === -1) throw new NotFoundError();

  const target = parsed.data === "UP" ? index - 1 : index + 1;
  if (target < 0 || target >= links.length) return { moved: false };

  const reordered = [...links];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

  await prisma.$transaction([
    ...reordered.map((link, order) =>
      prisma.appLink.update({
        where: { id: link.id },
        data: { sortOrder: order },
      }),
    ),
    prisma.auditLog.create({
      data: {
        actorId: actor.id,
        targetLabel: links[index].name,
        action: "APP_LINK_UPDATED",
        diff: { sortOrder: { old: index, new: target } } as object,
      },
    }),
  ]);

  return { moved: true };
}
