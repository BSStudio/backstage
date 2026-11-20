"use server";

import { revalidatePath } from "next/cache";
import {
  type ActionResult,
  FORBIDDEN,
  mapActionError,
} from "@/lib/actions/result";
import { CloudflareError } from "@/lib/cloudflare/client";
import { captureServiceError } from "@/lib/observability/capture";
import { canAdminister, canManageShortLinks } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import {
  createShortLink,
  deleteShortLink,
  publishShortLink,
  republishShortLinks,
  updateShortLink,
} from "@/lib/services/short-links";
import { permittedActor } from "@/lib/session";

const INVALID = { validation: "Érvénytelen linkadatok" };

function revalidateShortLinks() {
  revalidatePath("/admin/short-links");
}

// Shown verbatim like a website push failure: it names what Cloudflare refused, which is what
// an admin needs before trying again.
function mapError(error: unknown): ActionResult<never> {
  if (error instanceof CloudflareError) {
    captureServiceError(error);
    return { success: false, error: error.message };
  }
  return mapActionError(error, {
    validation: "A rövid linkek publikálása nincs beállítva",
  });
}

export async function createShortLinkAction(
  input: Record<string, unknown>,
): Promise<ActionResult<{ slug: string }>> {
  const actor = await permittedActor(canManageShortLinks);
  if (!actor) return FORBIDDEN;

  try {
    const { link, syncErrors } = await createShortLink(prisma, input, actor);
    revalidateShortLinks();
    return { success: true, data: { slug: link.slug }, syncErrors };
  } catch (error) {
    return mapActionError(error, INVALID);
  }
}

export async function updateShortLinkAction(
  slug: string,
  input: Record<string, unknown>,
): Promise<ActionResult<{ slug: string }>> {
  const actor = await permittedActor(canManageShortLinks);
  if (!actor) return FORBIDDEN;

  try {
    const { link, syncErrors } = await updateShortLink(
      prisma,
      slug,
      input,
      actor,
    );
    revalidateShortLinks();
    return { success: true, data: { slug: link.slug }, syncErrors };
  } catch (error) {
    return mapActionError(error, INVALID);
  }
}

export async function deleteShortLinkAction(
  slug: string,
): Promise<ActionResult<null>> {
  const actor = await permittedActor(canManageShortLinks);
  if (!actor) return FORBIDDEN;

  try {
    const { syncErrors } = await deleteShortLink(prisma, slug, actor);
    revalidateShortLinks();
    return { success: true, data: null, syncErrors };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function publishShortLinkAction(
  slug: string,
): Promise<ActionResult<{ slug: string }>> {
  const actor = await permittedActor(canManageShortLinks);
  if (!actor) return FORBIDDEN;

  try {
    const { link, syncErrors } = await publishShortLink(prisma, slug, actor);
    revalidateShortLinks();
    return { success: true, data: { slug: link.slug }, syncErrors };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function republishShortLinksAction(): Promise<
  ActionResult<{ links: number; removed: number }>
> {
  const actor = await permittedActor(canAdminister);
  if (!actor) return FORBIDDEN;

  try {
    const counts = await republishShortLinks(prisma, actor);
    revalidateShortLinks();
    revalidatePath("/admin/audit");
    return { success: true, data: counts, syncErrors: [] };
  } catch (error) {
    return mapError(error);
  }
}
